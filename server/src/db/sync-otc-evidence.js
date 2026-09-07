import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = await readFile(
  path.resolve(here, '../../migrations/043_otc_label_evidence_registry.sql'),
  'utf8'
);
const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  database: process.env.DB_NAME || 'pharmate',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
  multipleStatements: true,
});

try {
  await connection.query(sql);
  const [rows] = await connection.query(
    `SELECT evidence_status,COUNT(DISTINCT drug_id) AS medicines
       FROM otc_rule_evidence_queue GROUP BY evidence_status ORDER BY evidence_status`
  );
  console.log(JSON.stringify(rows));
} finally {
  await connection.end();
}
