import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { parseFrequency } from '../../engine/frequencyParser.js';
import { createPatientNotification } from './patientNotifications.js';

const EDITABLE = new Set(['dosage_instruction', 'frequency', 'is_prn', 'start_date', 'end_date']);
const CONTROL = new Set(['expected_updated_at']);
const EVENTS = new Set(['updated', 'stopped', 'cancelled']);
const STATUSES = new Set(['pending_validation', 'pending_drug', 'active', 'completed', 'cancelled']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SELECT = `SELECT m.id, m.patient_id, m.drug_id, m.drug_name_raw, m.source, m.is_prn,
  m.frequency, m.frequency_code, m.dosage_instruction, m.start_date, m.end_date,
  m.status, m.pharmacist_id, m.validated_at, m.created_at, m.updated_at, dr.rx_class,
  dr.min_interval_hours, dr.max_daily_doses,
  pp.status AS prescription_status, pp.decision_reason AS prescription_reason,
  pp.review_stage AS prescription_review_stage
  FROM medications m LEFT JOIN drug_reference dr ON dr.id=m.drug_id
  LEFT JOIN prescription_photos pp ON pp.id=m.prescription_photo_id`;

function jsonDate(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function medication(row) {
  return {
    id: row.id,
    drug_id: row.drug_id,
    drug_name_raw: row.drug_name_raw,
    source: row.source,
    is_prn: Boolean(row.is_prn),
    frequency: row.frequency,
    frequency_code: row.frequency_code,
    dosage_instruction: row.dosage_instruction,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
    rx_class: row.rx_class,
    prescription_status: row.prescription_status,
    prescription_reason: row.prescription_reason,
    prescription_review_stage: row.prescription_review_stage,
    created_at: jsonDate(row.created_at),
    updated_at: jsonDate(row.updated_at),
  };
}

function auditSnapshot(row) {
  return {
    dosage_instruction: row.dosage_instruction,
    frequency: row.frequency,
    frequency_code: row.frequency_code,
    is_prn: Boolean(row.is_prn),
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
  };
}

function fail(status, error, message) {
  return { error: { status, error, ...(message ? { message } : {}) } };
}

function validDate(value) {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function expectedMatches(expected, actual) {
  return typeof expected === 'string' && !Number.isNaN(Date.parse(expected)) &&
    new Date(expected).getTime() === new Date(actual).getTime();
}

function dosesPerDay(code) {
  if (code === 'QD' || code === 'HS') return 1;
  if (code === 'BID') return 2;
  if (code === 'TID') return 3;
  if (code === 'QID') return 4;
  const interval = code?.match(/^q(\d{1,2})h$/);
  if (interval) return Math.ceil(24 / Number(interval[1]));
  const mealMap = code?.match(/^MEALMAP\(([01]),([01]),([01])\)/);
  return mealMap ? Number(mealMap[1]) + Number(mealMap[2]) + Number(mealMap[3]) : null;
}

async function insertAudit(conn, row, actorId, eventType, before, after) {
  await conn.execute(
    `INSERT INTO medication_history
       (id, medication_id, patient_id, actor_id, actor_role, event_type, before_info, after_info)
     VALUES (?, ?, ?, ?, 'patient', ?, ?, ?)`,
    [uuidv4(), row.id, row.patient_id, actorId, eventType, JSON.stringify(before), JSON.stringify(after)]
  );
}

async function invalidateFuture(conn, row) {
  const [result] = await conn.execute(
    `DELETE ms FROM medication_schedules ms
     WHERE ms.medication_id = ? AND ms.patient_id = ? AND ms.scheduled_time > NOW(3)
       AND ms.status IN ('scheduled','snoozed')
       AND NOT EXISTS (SELECT 1 FROM dose_logs dl WHERE dl.schedule_id = ms.id)`,
    [row.id, row.patient_id]
  );
  return result.affectedRows;
}

export async function getMedication(patientId, medicationId) {
  const [[row]] = await pool.execute(`${SELECT} WHERE m.id=? AND m.patient_id=?`, [medicationId, patientId]);
  return row ? medication(row) : null;
}

export function validateMedicationPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'Invalid request body');
  const keys = Object.keys(body);
  const forbidden = keys.filter((key) => !EDITABLE.has(key) && !CONTROL.has(key));
  if (forbidden.length) return fail(400, 'Forbidden medication fields', `Patients cannot change: ${forbidden.join(', ')}`);
  if (!('expected_updated_at' in body)) return fail(400, 'expected_updated_at is required');
  if (Number.isNaN(Date.parse(body.expected_updated_at))) return fail(400, 'expected_updated_at must be an ISO date-time');
  if (!keys.some((key) => EDITABLE.has(key))) return fail(400, 'No editable medication fields provided');
  const value = {};
  if ('dosage_instruction' in body) {
    if (body.dosage_instruction !== null && typeof body.dosage_instruction !== 'string') return fail(400, 'dosage_instruction must be text or null');
    const dosage = body.dosage_instruction?.trim() || null;
    if (dosage && dosage.length > 1000) return fail(400, 'dosage_instruction is too long');
    value.dosage_instruction = dosage;
  }
  if ('frequency' in body) {
    if (typeof body.frequency !== 'string' || !body.frequency.trim()) return fail(400, 'frequency must be non-empty text');
    if (body.frequency.length > 255) return fail(400, 'frequency is too long');
    const code = parseFrequency(body.frequency);
    if (code === 'CONSULT') return fail(400, 'frequency is not supported; pharmacist review is required');
    value.frequency = body.frequency.trim();
    value.frequency_code = code;
  }
  if ('is_prn' in body) {
    if (typeof body.is_prn !== 'boolean') return fail(400, 'is_prn must be boolean');
    value.is_prn = body.is_prn ? 1 : 0;
  }
  for (const key of ['start_date', 'end_date']) {
    if (key in body) {
      if (body[key] !== null && (typeof body[key] !== 'string' || !validDate(body[key]))) return fail(400, `${key} must be YYYY-MM-DD or null`);
      value[key] = body[key];
    }
  }
  return { value, expected: body.expected_updated_at };
}

export async function updateMedication(patientId, medicationId, parsed) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.execute(`${SELECT} WHERE m.id=? AND m.patient_id=? FOR UPDATE`, [medicationId, patientId]);
    if (!row) { await conn.rollback(); return fail(404, 'Medication not found'); }
    if (!expectedMatches(parsed.expected, row.updated_at)) { await conn.rollback(); return fail(409, 'Medication changed since it was loaded', 'Reload the medication and try again.'); }
    if (row.source !== 'OTC_SELF') {
      await conn.rollback();
      return fail(403, 'Pharmacist review required', 'Validated prescription dosage and frequency cannot be changed by a patient. Contact a pharmacist for clinical changes.');
    }
    if (['completed', 'cancelled'].includes(row.status)) { await conn.rollback(); return fail(409, 'Stopped medications cannot be edited'); }
    if (parsed.value.frequency_code && row.max_daily_doses != null && dosesPerDay(parsed.value.frequency_code) > Number(row.max_daily_doses)) {
      await conn.rollback();
      return fail(400, 'frequency exceeds formulary maximum daily doses');
    }
    const nextStart = 'start_date' in parsed.value ? parsed.value.start_date : row.start_date;
    const nextEnd = 'end_date' in parsed.value ? parsed.value.end_date : row.end_date;
    if (nextStart && nextEnd && String(nextEnd).slice(0, 10) < String(nextStart).slice(0, 10)) { await conn.rollback(); return fail(400, 'end_date must not be before start_date'); }
    const timingChanged = ['frequency', 'is_prn', 'start_date', 'end_date'].some((key) => key in parsed.value);
    const before = auditSnapshot(row);
    const entries = Object.entries(parsed.value);
    await conn.execute(`UPDATE medications SET ${entries.map(([key]) => `${key}=?`).join(', ')}, updated_at=NOW(3) WHERE id=?`, [...entries.map(([, value]) => value), row.id]);
    const invalidated = timingChanged ? await invalidateFuture(conn, row) : 0;
    const [[updated]] = await conn.execute(`${SELECT} WHERE m.id=? AND m.patient_id=?`, [row.id, patientId]);
    await insertAudit(conn, row, patientId, 'updated', before, auditSnapshot(updated));
    if (timingChanged) await createPatientNotification({ patientId, type: 'schedule_changed', eventKey: `medication:${row.id}:changed:${uuidv4()}`, metadata: { medication_id: row.id }, executor: conn });
    await conn.commit();
    return { medication: medication(updated), schedule_reconfirmation_required: timingChanged, future_schedules_invalidated: invalidated };
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export async function stopMedication(patientId, medicationId, expected) {
  if (!expected || Number.isNaN(Date.parse(expected))) return fail(400, 'expected_updated_at is required and must be an ISO date-time');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.execute(`${SELECT} WHERE m.id=? AND m.patient_id=? FOR UPDATE`, [medicationId, patientId]);
    if (!row) { await conn.rollback(); return fail(404, 'Medication not found'); }
    if (['completed', 'cancelled'].includes(row.status)) { await conn.commit(); return { medication: medication(row), already_stopped: true, future_schedules_invalidated: 0 }; }
    if (!expectedMatches(expected, row.updated_at)) { await conn.rollback(); return fail(409, 'Medication changed since it was loaded', 'Reload the medication and try again.'); }
    const nextStatus = row.status === 'active' ? 'completed' : 'cancelled';
    const before = auditSnapshot(row);
    await conn.execute('UPDATE medications SET status=?, updated_at=NOW(3) WHERE id=?', [nextStatus, row.id]);
    const invalidated = await invalidateFuture(conn, row);
    const [[updated]] = await conn.execute(`${SELECT} WHERE m.id=? AND m.patient_id=?`, [row.id, patientId]);
    await insertAudit(conn, row, patientId, nextStatus === 'completed' ? 'stopped' : 'cancelled', before, auditSnapshot(updated));
    await conn.commit();
    return { medication: medication(updated), already_stopped: false, future_schedules_invalidated: invalidated };
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

export function parseHistoryQuery(query = {}) {
  const rawLimit = String(query.limit ?? '20');
  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100) return fail(400, 'limit must be between 1 and 100');
  if (query.event_type && !EVENTS.has(query.event_type)) return fail(400, 'Unsupported event_type');
  if (query.status && !STATUSES.has(query.status)) return fail(400, 'Unsupported status');
  let cursor = null;
  if (query.cursor) try {
    const decoded = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(decoded) || decoded.length !== 2 || Number.isNaN(Date.parse(decoded[0])) || typeof decoded[1] !== 'string') throw new Error();
    cursor = { time: new Date(decoded[0]), id: decoded[1] };
  } catch { return fail(400, 'Invalid cursor'); }
  return { value: { limit: Number(rawLimit), eventType: query.event_type, status: query.status, cursor } };
}

export async function listMedicationHistory(patientId, options) {
  const where = ['patient_id=?']; const params = [patientId];
  if (options.eventType) { where.push('event_type=?'); params.push(options.eventType); }
  if (options.status) { where.push("JSON_UNQUOTE(JSON_EXTRACT(after_info, '$.status'))=?"); params.push(options.status); }
  if (options.cursor) { where.push('(event_time < ? OR (event_time = ? AND id < ?))'); params.push(options.cursor.time, options.cursor.time, options.cursor.id); }
  const [rows] = await pool.execute(`SELECT id, medication_id, actor_id, actor_role, event_type, before_info, after_info, event_time FROM medication_history WHERE ${where.join(' AND ')} ORDER BY event_time DESC, id DESC LIMIT ${options.limit + 1}`, params);
  const page = rows.slice(0, options.limit); const hasMore = rows.length > options.limit;
  return { history: page, pagination: { limit: options.limit, has_more: hasMore, next_cursor: hasMore ? Buffer.from(JSON.stringify([new Date(page.at(-1).event_time).toISOString(), page.at(-1).id])).toString('base64url') : null } };
}
