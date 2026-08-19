import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { encrypt } from '../utils/crypto.js';
import { generatePatientCode } from '../utils/patientCode.js';
import { requireAuth } from '../middleware/auth.js';
import { failedAttemptLimit, rateLimit } from '../middleware/rateLimit.js';
import { validatePassword } from '../utils/passwordPolicy.js';
import { normalizeEmail } from '../utils/email.js';
import { deliverPasswordReset } from '../services/passwordResetDelivery.js';

const router = Router();

const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_DAYS = Number(process.env.JWT_REFRESH_EXPIRES_DAYS) || 30;
// bcrypt cost is 12 in production (D-G). Overridable so CI/tests aren't dominated
// by intentionally-slow hashing; production must leave BCRYPT_COST unset.
const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 12;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const FORGOT_RESPONSE = { message: 'If the account is eligible, a password reset link will be sent' };
const INVALID_RESET_RESPONSE = { error: 'Invalid or expired reset token' };

const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
const loginLimit = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 20 });
const failedLoginLimit = failedAttemptLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 5,
  keyGenerator: (req) =>
    `${req.ip}:${String(req.body?.email || '')
      .trim()
      .toLowerCase()}`,
});
const refreshLimit = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 30 });
const forgotIpLimit = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: process.env.NODE_ENV === 'test' ? 1000 : 5,
});
const forgotEmailLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 3,
  keyGenerator: (req) => normalizeEmail(req.body?.email) || 'invalid-email',
});
const resetLimit = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 10 });

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
router.post('/register', registerLimit, async (req, res) => {
  const { password, role, full_name, contact_num, address, medical_condition } = req.body;
  const email = normalizeEmail(req.body.email);

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password, and role are required' });
  }
  if (role !== 'patient') {
    return res.status(403).json({ error: 'Public registration is available only to patients' });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
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
    await conn.execute('INSERT INTO patient_preferences (patient_id) VALUES (?)', [userId]);

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
router.post('/login', loginLimit, failedLoginLimit, async (req, res) => {
  const { password, role: selectedRole, accountGroup } = req.body;
  const email = normalizeEmail(req.body.email);
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (selectedRole !== undefined && !['patient', 'caregiver'].includes(selectedRole)) {
    return res.status(400).json({ error: 'Invalid mobile account type' });
  }
  if (accountGroup !== undefined && accountGroup !== 'staff') {
    return res.status(400).json({ error: 'Invalid account group' });
  }
  if (selectedRole && accountGroup) {
    return res.status(400).json({ error: 'Choose either a mobile role or the staff portal' });
  }

  const [rows] = await pool.execute(
    'SELECT id, password_hash, role, is_active, session_version FROM users WHERE email = ?',
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

  const roleMismatch = selectedRole && user.role !== selectedRole;
  const staffMismatch = accountGroup === 'staff' && !['pharmacist', 'admin'].includes(user.role);
  if (roleMismatch || staffMismatch) {
    return res.status(403).json({ error: 'This account does not match the selected login type' });
  }

  // Fetch role-specific extras
  let extra = {};
  if (user.role === 'patient') {
    const [pRows] = await pool.execute('SELECT patient_code FROM patients WHERE id = ?', [user.id]);
    extra = { patientCode: pRows[0]?.patient_code ?? null };
  }

  const payload = { sub: user.id, role: user.role, sessionVersion: user.session_version };
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

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post('/forgot-password', forgotIpLimit, forgotEmailLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  let delivery = null;

  if (email) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        'SELECT id, email FROM users WHERE email = ? AND is_active = 1 FOR UPDATE',
        [email]
      );
      const user = rows[0];
      if (user) {
        const rawToken = randomBytes(32).toString('hex');
        await conn.execute(
          'UPDATE password_reset_tokens SET used_at = NOW(3) WHERE user_id = ? AND used_at IS NULL',
          [user.id]
        );
        await conn.execute(
          `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
           VALUES (?, ?, ?, ?)`,
          [uuidv4(), user.id, hashToken(rawToken), new Date(Date.now() + RESET_TOKEN_TTL_MS)]
        );
        delivery = { email: user.email, rawToken };
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  // Delivery happens after persistence. Failure is deliberately hidden so this endpoint's
  // status and body cannot disclose whether an eligible account was found.
  if (delivery) {
    try {
      await deliverPasswordReset(delivery);
    } catch {
      console.error('Password-reset email delivery failed');
    }
  }
  res.status(202).json(FORGOT_RESPONSE);
});

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post('/reset-password', resetLimit, async (req, res) => {
  const { token, new_password: newPassword } = req.body || {};
  const passwordError = validatePassword(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json(INVALID_RESET_RESPONSE);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at, u.is_active
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = ?
       FOR UPDATE`,
      [hashToken(token)]
    );
    const record = rows[0];
    if (!record || record.used_at || !record.is_active || new Date(record.expires_at) <= new Date()) {
      await conn.rollback();
      return res.status(400).json(INVALID_RESET_RESPONSE);
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await conn.execute(
      `UPDATE users
       SET password_hash = ?, session_version = session_version + 1
       WHERE id = ?`,
      [passwordHash, record.user_id]
    );
    await conn.execute(
      'UPDATE password_reset_tokens SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL',
      [record.id]
    );
    await conn.execute(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW(3) WHERE user_id = ? AND revoked = 0',
      [record.user_id]
    );
    await conn.commit();
    return res.json({ message: 'Password reset successfully' });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post('/refresh', refreshLimit, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

  const tokenHash = hashToken(refreshToken);
  const [rows] = await pool.execute(
    `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked, u.role, u.is_active,
            u.session_version
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

  const accessToken = signAccess({
    sub: record.user_id,
    role: record.role,
    sessionVersion: record.session_version,
  });
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

// ── POST /api/auth/change-password ───────────────────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password: currentPassword, new_password: newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  const passwordError = validatePassword(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      'SELECT password_hash FROM users WHERE id = ? AND is_active = 1 FOR UPDATE',
      [req.user.sub]
    );
    const user = rows[0];
    const matches = user ? await bcrypt.compare(currentPassword, user.password_hash) : false;
    if (!matches) {
      await conn.rollback();
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (await bcrypt.compare(newPassword, user.password_hash)) {
      await conn.rollback();
      return res.status(400).json({ error: 'New password must differ from current password' });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await conn.execute(
      'UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?',
      [passwordHash, req.user.sub]
    );
    await conn.execute(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW(3) WHERE user_id = ? AND revoked = 0',
      [req.user.sub]
    );
    await conn.commit();
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

// ── POST /api/auth/logout-all ────────────────────────────────────────────────
router.post('/logout-all', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('UPDATE users SET session_version = session_version + 1 WHERE id = ?', [
      req.user.sub,
    ]);
    await conn.execute(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW(3) WHERE user_id = ? AND revoked = 0',
      [req.user.sub]
    );
    await conn.commit();
    res.json({ message: 'Logged out from all sessions' });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

export default router;
