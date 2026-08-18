import bcrypt from 'bcryptjs';
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
