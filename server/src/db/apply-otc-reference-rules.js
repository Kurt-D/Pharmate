import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = await readFile(
  path.resolve(here, '../../migrations/041_curated_otc_reference_rules.sql'),
  'utf8'
);
const connection = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'pharmate',
  user: process.env.DB_USER || 'pharmate',
  password: process.env.DB_PASS || '',
  multipleStatements: true,
});

try {
  // Schema changes belong to the migration runner. This command reapplies only
  // the data rules after seeding, when the column already exists.
  await connection.query(sql.replace(/^ALTER TABLE\b[^;]*;\s*/i, ''));
  console.log('Applied curated OTC reference rules.');
} finally {
  await connection.end();
}
