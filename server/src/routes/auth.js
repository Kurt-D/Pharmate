import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { encrypt } from '../utils/crypto.js';
import { generatePatientCode } from '../utils/patientCode.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_DAYS = Number(process.env.JWT_REFRESH_EXPIRES_DAYS) || 30;

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}

function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

function refreshExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_DAYS);
  return d;
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password, role, full_name, contact_num, address, medical_condition } = req.body;

  const VALID_ROLES = ['patient', 'pharmacist', 'caregiver', 'admin'];
  if (!email || !password || !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'email, password, and a valid role are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = uuidv4();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', [
      userId,
      email,
      passwordHash,
      role,
    ]);

    if (role === 'patient') {
      const patientCode = await generatePatientCode();
      await conn.execute(
        `INSERT INTO patients
           (id, patient_code, full_name_enc, contact_num_enc, address_enc, medical_condition_enc)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          patientCode,
          full_name ? encrypt(full_name) : null,
          contact_num ? encrypt(contact_num) : null,
          address ? encrypt(address) : null,
          medical_condition ? encrypt(medical_condition) : null,
        ]
      );
      // Insert default anchors (D-B)
      await conn.execute('INSERT INTO patient_anchors (patient_id) VALUES (?)', [userId]);
    } else if (role === 'pharmacist') {
      const { license_number, branch_id } = req.body;
      await conn.execute(
        'INSERT INTO pharmacists (id, full_name, license_number, branch_id) VALUES (?, ?, ?, ?)',
        [userId, full_name || '', license_number || null, branch_id || null]
      );
    } else if (role === 'caregiver') {
      await conn.execute('INSERT INTO caregivers (id, full_name) VALUES (?, ?)', [
        userId,
        full_name || '',
      ]);
    } else if (role === 'admin') {
      await conn.execute('INSERT INTO admins (id) VALUES (?)', [userId]);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  res.status(201).json({ message: 'Registered successfully' });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const [rows] = await pool.execute(
    'SELECT id, password_hash, role, is_active FROM users WHERE email = ?',
    [email]
  );
  const user = rows[0];

  // Constant-time-ish: always run bcrypt even on missing user to prevent timing attacks
  const hashToCheck =
    user?.password_hash ?? '$2a$12$invalidhashpadding000000000000000000000000000000000000000';
  const match = await bcrypt.compare(password, hashToCheck);

  if (!user || !match || !user.is_active) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Fetch role-specific extras
  let extra = {};
  if (user.role === 'patient') {
    const [pRows] = await pool.execute('SELECT patient_code FROM patients WHERE id = ?', [user.id]);
    extra = { patientCode: pRows[0]?.patient_code ?? null };
  }

  const payload = { sub: user.id, role: user.role };
  const accessToken = signAccess(payload);
  const rawRefresh = randomBytes(40).toString('hex');

  await pool.execute(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [uuidv4(), user.id, hashToken(rawRefresh), refreshExpiresAt()]
  );

  res.json({
    accessToken,
    refreshToken: rawRefresh,
    user: { id: user.id, role: user.role, ...extra },
  });
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

  const tokenHash = hashToken(refreshToken);
  const [rows] = await pool.execute(
    `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked, u.role, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = ?`,
    [tokenHash]
  );
  const record = rows[0];

  if (!record || record.revoked || !record.is_active || new Date(record.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  // Rotate: revoke old, issue new
  await pool.execute('UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW(3) WHERE id = ?', [
    record.id,
  ]);
  const newRaw = randomBytes(40).toString('hex');
  await pool.execute(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
    [uuidv4(), record.user_id, hashToken(newRaw), refreshExpiresAt()]
  );

  const accessToken = signAccess({ sub: record.user_id, role: record.role });
  res.json({ accessToken, refreshToken: newRaw });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await pool.execute(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW(3) WHERE token_hash = ? AND user_id = ?',
      [hashToken(refreshToken), req.user.sub]
    );
  }
  res.json({ message: 'Logged out' });
});

export default router;
