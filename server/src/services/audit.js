import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'node:crypto';
import { pool } from '../db/connection.js';

export async function recordAudit({
  actor,
  action,
  entityType,
  entityId = null,
  patientId = null,
  metadata = null,
  requestId = null,
  sourceIp = null,
  outcome = 'success',
  executor = pool,
}) {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const normalizedMetadata = metadata == null ? null : JSON.stringify(metadata);
  const values = {
    id,
    actorUserId: actor?.id || actor?.sub || null,
    actorRole: actor?.role || 'system',
    action,
    entityType,
    entityId: entityId ? String(entityId) : null,
    patientId,
    requestId,
    sourceIp,
    outcome: outcome === 'failure' ? 'failure' : 'success',
    metadata: normalizedMetadata,
    createdAt,
  };
  const ownsConnection = executor === pool;
  const connection = ownsConnection ? await pool.getConnection() : executor;
  try {
    if (ownsConnection) await connection.beginTransaction();
    const [[state]] = await connection.execute(
      "SELECT last_hash FROM audit_chain_state WHERE chain_name='primary' FOR UPDATE"
    );
    const previousHash = state?.last_hash || null;
    const eventHash = createHash('sha256')
      .update(JSON.stringify({ ...values, previousHash }))
      .digest('hex');
    await connection.execute(
    `INSERT INTO audit_events
       (id,actor_user_id,actor_role,action,entity_type,entity_id,patient_id,request_id,source_ip,outcome,metadata_json,previous_hash,event_hash,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      values.id, values.actorUserId, values.actorRole, values.action, values.entityType,
      values.entityId, values.patientId, values.requestId, values.sourceIp, values.outcome,
      values.metadata, previousHash, eventHash, values.createdAt,
    ]
    );
    await connection.execute("UPDATE audit_chain_state SET last_hash=? WHERE chain_name='primary'", [eventHash]);
    if (ownsConnection) await connection.commit();
  } catch (error) {
    if (ownsConnection) await connection.rollback();
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}

function actionForStaffRequest(portal, req) {
  const path = req.path || '';
  if (/prescription|validation/.test(path)) return 'PRESCRIPTION_ACCESS';
  if (/inquir|message/.test(path)) return 'INQUIRY_ACCESS';
  if (/\/patients?(\/|$)|adherence/.test(path)) return 'PATIENT_DATA_ACCESS';
  if (/export|csv/.test(path)) return 'DATA_EXPORT_ACCESS';
  if (/rule|credential/.test(path)) return 'GOVERNANCE_ACCESS';
  return `${portal.toUpperCase()}_API_ACCESS`;
}

// Records staff reads and outcomes without recording request/response bodies.
// Existing domain audits retain their more specific mutation details.
export function auditStaffRequest(portal) {
  return (req, res, next) => {
    res.once('finish', () => {
      const status = res.statusCode;
      if (status === 404 || status >= 500) return;
      recordAudit({
        actor: req.user,
        action: actionForStaffRequest(portal, req),
        entityType: 'api_endpoint',
        entityId: `${req.method} ${req.baseUrl || ''}${req.path || ''}`.slice(0, 100),
        requestId: req.requestId || null,
        sourceIp: req.ip || req.socket?.remoteAddress || null,
        outcome: status >= 400 ? 'failure' : 'success',
        metadata: { method: req.method, status },
      }).catch((error) => console.error('Audit request record failed', { code: error?.code }));
    });
    next();
  };
}
