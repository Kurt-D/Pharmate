import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../db/connection.js';

const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 12;

/** Provision a privileged account through a test-only database path. */
export async function createPrivilegedTestUser({ email, password, role, fullName = '' }) {
  if (!['pharmacist', 'caregiver', 'admin'].includes(role)) {
    throw new Error(`Unsupported privileged test role: ${role}`);
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    await conn.execute('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)', [
      id,
      email,
      passwordHash,
      role,
    ]);

    if (role === 'pharmacist') {
      await conn.execute('INSERT INTO pharmacists (id, full_name) VALUES (?, ?)', [id, fullName]);
    } else if (role === 'caregiver') {
      await conn.execute('INSERT INTO caregivers (id, full_name) VALUES (?, ?)', [id, fullName]);
    } else {
      await conn.execute('INSERT INTO admins (id) VALUES (?)', [id]);
    }

    await conn.commit();
    return id;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/** Sign an access token that matches the user's current database session. */
export async function createAccessToken(userId, overrides = {}) {
  const [rows] = await pool.execute('SELECT role, session_version FROM users WHERE id = ?', [
    userId,
  ]);
  if (!rows[0]) throw new Error(`Test user not found: ${userId}`);
  return jwt.sign(
    {
      sub: userId,
      role: rows[0].role,
      sessionVersion: rows[0].session_version,
      ...overrides,
    },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
}
