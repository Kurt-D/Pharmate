/**
 * Generates a unique patient_code: "PM-" + 6 uppercase alphanumerics (D-G).
 * Retries on collision (UNIQUE constraint in DB).
 */
import { pool } from '../db/connection.js';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomCode() {
  let s = 'PM-';
  for (let i = 0; i < 6; i++) {
    s += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return s;
}

export async function generatePatientCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const [rows] = await pool.execute('SELECT id FROM patients WHERE patient_code = ?', [code]);
    if (rows.length === 0) return code;
  }
  throw new Error('Failed to generate a unique patient_code after 10 attempts');
}
