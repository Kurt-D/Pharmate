import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from './connection.js';

const input = process.argv[2];
if (!input) throw new Error('Usage: npm run import:drug-reference -- <categorized-json>');
const rows = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
if (!Array.isArray(rows)) throw new Error('Expected a JSON array.');

const report = {
  read: rows.length,
  inserted_provisional: 0,
  updated_provisional: 0,
  preserved_verified: 0,
  rejected: 0,
};
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  for (const row of rows) {
    const name = String(row.generic_name || '')
      .trim()
      .toLowerCase();
    if (!name || !['RX', 'OTC'].includes(row.rx_class)) {
      report.rejected++;
      continue;
    }
    const brands = JSON.stringify(Array.isArray(row.brand_names) ? row.brand_names : []);
    const [[existing]] = await conn.execute(
      `SELECT id,is_provisional FROM drug_reference
       WHERE LOWER(TRIM(generic_name))=?
       ORDER BY is_provisional ASC, created_at ASC LIMIT 1`,
      [name]
    );
    if (existing && !existing.is_provisional) {
      report.preserved_verified++;
      continue;
    }
    const values = [
      row.min_interval_hours ?? null,
      row.max_daily_doses ?? null,
      row.is_prn_default ? 1 : 0,
      row.default_interval_hours ?? null,
      row.meal_anchor_code || 'NONE',
      row.meal_instruction ?? null,
      row.standard_frequency ?? null,
      row.notes ?? null,
      row.rx_class,
    ];
    if (existing) {
      await conn.execute(
        `UPDATE drug_reference SET min_interval_hours=?,max_daily_doses=?,is_prn_default=?,
         default_interval_hours=?,meal_anchor_code=?,meal_instruction=?,frequency_default=?,
         notes=?,rx_class=?,is_provisional=1 WHERE id=?`,
        [...values, existing.id]
      );
      report.updated_provisional++;
    } else {
      await conn.execute(
        `INSERT INTO drug_reference
         (generic_name,brand_names_json,min_interval_hours,max_daily_doses,is_prn_default,
          default_interval_hours,meal_anchor_code,meal_instruction,frequency_default,notes,
          is_restricted,rx_class,is_provisional)
         VALUES (?,?,?,?,?,?,?,?,?,?,0,?,1)`,
        [name, brands, ...values]
      );
      report.inserted_provisional++;
    }
  }
  await conn.commit();
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await conn.rollback();
  throw error;
} finally {
  conn.release();
  await pool.end();
}
