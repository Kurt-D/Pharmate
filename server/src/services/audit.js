import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';

export async function recordAudit({
  actor,
  action,
  entityType,
  entityId = null,
  patientId = null,
  metadata = null,
  executor = pool,
}) {
  await executor.execute(
    `INSERT INTO audit_events
       (id,actor_user_id,actor_role,action,entity_type,entity_id,patient_id,metadata_json)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      uuidv4(),
      actor?.id || actor?.sub || null,
      actor?.role || 'system',
      action,
      entityType,
      entityId ? String(entityId) : null,
      patientId,
      metadata == null ? null : JSON.stringify(metadata),
    ]
  );
}
