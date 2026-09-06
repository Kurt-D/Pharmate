import 'dotenv/config';
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  database: process.env.DB_NAME || 'pharmate',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
});

try {
  const [summary] = await connection.query(
    `SELECT evidence_status,COUNT(DISTINCT drug_id) AS medicines
       FROM otc_rule_evidence_queue GROUP BY evidence_status ORDER BY evidence_status`
  );
  const [missing] = await connection.query(
    `SELECT generic_name,common_strength,dosage_form,evidence_notes
       FROM otc_rule_evidence_queue WHERE evidence_status='MISSING' ORDER BY generic_name`
  );
  console.log(JSON.stringify({ summary, missing }, null, 2));
} finally {
  await connection.end();
}
