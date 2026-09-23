import 'dotenv/config';
import { createHash } from 'node:crypto';
import { pool } from '../src/db/connection.js';

function asIso(value) {
  return new Date(value).toISOString();
}

async function main() {
  const [rows] = await pool.execute(
    `SELECT id,actor_user_id,actor_role,action,entity_type,entity_id,patient_id,request_id,
            source_ip,outcome,metadata_json,previous_hash,event_hash,created_at
       FROM audit_events WHERE event_hash IS NOT NULL ORDER BY created_at ASC, id ASC`
  );
  let previousHash = null;
  for (const row of rows) {
    if (row.previous_hash !== previousHash) throw new Error(`Broken audit chain before event ${row.id}`);
    const values = {
      id: row.id,
      actorUserId: row.actor_user_id,
      actorRole: row.actor_role,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      patientId: row.patient_id,
      requestId: row.request_id,
      sourceIp: row.source_ip,
      outcome: row.outcome,
      metadata:
        row.metadata_json == null
          ? null
          : typeof row.metadata_json === 'string'
            ? row.metadata_json
            : JSON.stringify(row.metadata_json),
      createdAt: asIso(row.created_at),
    };
    const expected = createHash('sha256').update(JSON.stringify({ ...values, previousHash })).digest('hex');
    if (expected !== row.event_hash) throw new Error(`Audit event hash mismatch: ${row.id}`);
    previousHash = row.event_hash;
  }
  console.log(`Audit integrity verified: ${rows.length} chained event(s).`);
}

main().catch((error) => {
  console.error(`Audit integrity verification failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());
