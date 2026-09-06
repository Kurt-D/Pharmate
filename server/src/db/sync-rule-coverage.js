import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = await readFile(
  path.resolve(here, '../../migrations/042_full_rule_database_coverage.sql'),
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
  // Migrations create the columns once; coverage synchronization is repeatable.
  await connection.query(sql.replace(/^ALTER TABLE\b[^;]*;\s*/i, ''));
  await connection.query(
    `INSERT INTO medication_safety_rules
       (drug_id,population_key,allergy_terms_json,evidence_notes)
     SELECT drug.id,'ADULT',JSON_ARRAY(LOWER(TRIM(drug.generic_name))),
            'Safety domains must be completed in the administrator Rule Governance workflow.'
     FROM drug_reference drug
     WHERE drug.availability=1 AND NOT EXISTS (
       SELECT 1 FROM medication_safety_rules safety
       WHERE safety.drug_id=drug.id AND safety.population_key='ADULT'
     )`
  );
  const [coverageRows] = await connection.query(
    `SELECT effective_automation_status,COUNT(DISTINCT drug_id) AS medicines
     FROM medication_automation_coverage GROUP BY effective_automation_status`
  );
  const summary = { total: 0 };
  for (const row of coverageRows) {
    const count = Number(row.medicines || 0);
    summary.total += count;
    summary[String(row.effective_automation_status || 'unknown').toLowerCase()] = count;
  }
  console.log(JSON.stringify(summary));
} finally {
  await connection.end();
}
