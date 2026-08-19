import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { UPLOADS_DIR } from '../middleware/upload.js';
import { createPatientNotification } from './patientNotifications.js';
import { proposeForPrescription } from './schedule.js';

const PURGE_DAYS = 7;

export function claimLeaseMinutes(env = process.env) {
  const value = Number(env.VALIDATION_CLAIM_LEASE_MINUTES ?? 15);
  return Number.isInteger(value) && value >= 1 && value <= 1440 ? value : 15;
}

function activeClaim(row, now = new Date()) {
  return Boolean(row.claimed_by && row.claim_expires_at && new Date(row.claim_expires_at) > now);
}

async function audit(conn, photo, pharmacistId, eventType, reason = null) {
  await conn.execute(
    `INSERT INTO prescription_validation_audit
       (id, prescription_id, medication_id, pharmacist_id, event_type, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), photo.id, photo.medication_id, pharmacistId, eventType, reason]
  );
}

async function lockedPhoto(conn, photoId) {
  const [[row]] = await conn.execute(
    `SELECT pp.id, pp.status, pp.review_stage, pp.schedule_draft_json,
            pp.medication_id, pp.redacted_path, pp.claimed_by,
            pp.claim_expires_at, m.patient_id, m.drug_name_raw
     FROM prescription_photos pp JOIN medications m ON m.id=pp.medication_id
     WHERE pp.id=? FOR UPDATE`,
    [photoId]
  );
  return row;
}

export async function attachPhoto(patientId, medicationId, storedFilename, ocr = {}) {
  const [[med]] = await pool.execute(
    'SELECT id, source, status FROM medications WHERE id=? AND patient_id=?',
    [medicationId, patientId]
  );
  if (!med) return { error: 'not_found' };
  if (med.source !== 'RX_VALIDATED') return { error: 'not_rx' };
  if (med.status !== 'pending_validation') return { error: 'not_pending' };
  const draft = await proposeForPrescription(patientId, medicationId);
  const photoId = uuidv4();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO prescription_photos
         (id, medication_id, redacted_path, ocr_text, ocr_confidence,
          schedule_draft_json, review_stage, status)
       VALUES (?, ?, ?, ?, ?, ?, 'prescription', 'pending')`,
      [photoId, medicationId, storedFilename, ocr.text || null,
        Number.isFinite(Number(ocr.confidence)) ? Number(ocr.confidence) : null,
        JSON.stringify(draft)]
    );
    await conn.execute('UPDATE medications SET prescription_photo_id=? WHERE id=?', [photoId, medicationId]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  return { photoId, reviewStage: 'prescription', draft };
}

export async function pendingValidations(pharmacistId) {
  const [rows] = await pool.execute(
    `SELECT pp.id, pp.medication_id, pp.status, pp.created_at,
            CASE WHEN pp.claimed_by=? AND pp.claim_expires_at>NOW(3)
              THEN 'claimed_by_you' ELSE 'unclaimed' END AS claim_status,
            CASE WHEN pp.claimed_by=? AND pp.claim_expires_at>NOW(3)
              THEN pp.claim_expires_at ELSE NULL END AS claim_expires_at,
            pp.review_stage, pp.ocr_text, pp.ocr_confidence, pp.schedule_draft_json,
            m.drug_name_raw, m.frequency, m.dosage_instruction, p.patient_code
     FROM prescription_photos pp JOIN medications m ON m.id=pp.medication_id
     JOIN patients p ON p.id=m.patient_id
     WHERE pp.status='pending' AND
       (pp.claimed_by IS NULL OR pp.claim_expires_at<=NOW(3) OR pp.claimed_by=?)
     ORDER BY pp.created_at ASC`,
    [pharmacistId, pharmacistId, pharmacistId]
  );
  return rows;
}

export async function approvePrescriptionForSchedule(pharmacistId, photoId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const photo = await lockedPhoto(conn, photoId);
    if (!photo) { await conn.rollback(); return { error: 'not_found' }; }
    if (photo.status !== 'pending') { await conn.rollback(); return { error: 'already_decided' }; }
    const [[stage]] = await conn.execute('SELECT review_stage FROM prescription_photos WHERE id=? FOR UPDATE', [photoId]);
    if (stage.review_stage !== 'prescription') { await conn.rollback(); return { error: 'wrong_stage' }; }
    await conn.execute(
      `UPDATE prescription_photos SET review_stage='schedule', claimed_by=?,
       claim_expires_at=DATE_ADD(NOW(3), INTERVAL ? MINUTE) WHERE id=?`,
      [pharmacistId, claimLeaseMinutes(), photoId]
    );
    await audit(conn, photo, pharmacistId, 'prescription_approved');
    await conn.commit();
    return { status: 'pending', review_stage: 'schedule' };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function claimValidation(pharmacistId, photoId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const photo = await lockedPhoto(conn, photoId);
    if (!photo) { await conn.rollback(); return { error: 'not_found' }; }
    if (photo.status !== 'pending') { await conn.rollback(); return { error: 'already_decided' }; }
    const now = new Date();
    if (activeClaim(photo, now) && photo.claimed_by !== pharmacistId) {
      await conn.rollback();
      return { error: 'claimed' };
    }
    if (activeClaim(photo, now)) {
      await conn.commit();
      return { claim_status: 'claimed_by_you', claim_expires_at: photo.claim_expires_at, idempotent: true };
    }
    const priorOwner = photo.claimed_by;
    const expiresAt = new Date(now.getTime() + claimLeaseMinutes() * 60000);
    if (priorOwner) await audit(conn, photo, priorOwner, 'claim_expired');
    await conn.execute('UPDATE prescription_photos SET claimed_by=?, claim_expires_at=? WHERE id=?', [pharmacistId, expiresAt, photoId]);
    await audit(conn, photo, pharmacistId, priorOwner ? 'reclaimed' : 'claimed');
    await conn.commit();
    return { claim_status: 'claimed_by_you', claim_expires_at: expiresAt, idempotent: false };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function releaseValidation(pharmacistId, photoId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const photo = await lockedPhoto(conn, photoId);
    if (!photo) { await conn.rollback(); return { error: 'not_found' }; }
    if (photo.status !== 'pending') { await conn.rollback(); return { error: 'already_decided' }; }
    if (!activeClaim(photo) || photo.claimed_by !== pharmacistId) {
      await conn.rollback();
      return { error: 'not_owner' };
    }
    await conn.execute('UPDATE prescription_photos SET claimed_by=NULL, claim_expires_at=NULL WHERE id=?', [photoId]);
    await audit(conn, photo, pharmacistId, 'released');
    await conn.commit();
    return { claim_status: 'unclaimed' };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function photoFilePath(pharmacistId, photoId) {
  const [[row]] = await pool.execute(
    'SELECT redacted_path, status, claimed_by, claim_expires_at FROM prescription_photos WHERE id=?',
    [photoId]
  );
  if (!row) return { error: 'not_found' };
  if (row.status !== 'pending' || !row.redacted_path) return { error: 'not_available' };
  if (!activeClaim(row) || row.claimed_by !== pharmacistId) return { error: 'not_owner' };
  const abs = path.resolve(UPLOADS_DIR, path.basename(row.redacted_path));
  return abs.startsWith(UPLOADS_DIR) ? { path: abs } : { error: 'not_available' };
}

export function validateDecision(action, reason) {
  if (!['approve', 'reject', 'needs_clearer'].includes(action)) return { error: 'bad_action' };
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (['reject', 'needs_clearer'].includes(action) && !cleanReason) return { error: 'reason_required' };
  if (cleanReason.length > 500) return { error: 'reason_too_long' };
  return { value: { action, reason: cleanReason || null } };
}

export async function decideValidation(pharmacistId, photoId, action, reason, options = {}) {
  const parsed = validateDecision(action, reason);
  if (parsed.error) return parsed;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const photo = await lockedPhoto(conn, photoId);
    if (!photo) { await conn.rollback(); return { error: 'not_found' }; }
    if (photo.status !== 'pending') { await conn.rollback(); return { error: 'already_decided' }; }
    if (action === 'approve' && photo.review_stage !== 'schedule') {
      await conn.rollback();
      return { error: 'prescription_first' };
    }
    const now = new Date();
    if (activeClaim(photo, now) && photo.claimed_by !== pharmacistId) {
      await conn.rollback();
      return { error: 'claimed' };
    }
    if (!activeClaim(photo, now)) {
      if (photo.claimed_by) await audit(conn, photo, photo.claimed_by, 'claim_expired');
      const expiresAt = new Date(now.getTime() + claimLeaseMinutes() * 60000);
      await conn.execute('UPDATE prescription_photos SET claimed_by=?, claim_expires_at=? WHERE id=?', [pharmacistId, expiresAt, photoId]);
      await audit(conn, photo, pharmacistId, photo.claimed_by ? 'reclaimed' : 'claimed');
    }
    const status = { approve: 'approved', reject: 'rejected', needs_clearer: 'needs_clearer' }[action];
    await conn.execute(
      `UPDATE prescription_photos SET status=?, decision_reason=?, pharmacist_id=?, decision_at=NOW(3),
       purge_at=DATE_ADD(NOW(3), INTERVAL ? DAY), claimed_by=NULL, claim_expires_at=NULL WHERE id=?`,
      [status, parsed.value.reason, pharmacistId, PURGE_DAYS, photoId]
    );
    if (action === 'approve') {
      await conn.execute("UPDATE medications SET status='active', pharmacist_id=?, validated_at=NOW(3) WHERE id=?", [pharmacistId, photo.medication_id]);
      const draft = typeof photo.schedule_draft_json === 'string'
        ? JSON.parse(photo.schedule_draft_json)
        : photo.schedule_draft_json;
      const slots = Array.isArray(draft?.slots) ? draft.slots : [];
      if (!slots.length) {
        await conn.rollback();
        return { error: 'no_schedule' };
      }
      const [[versionRow]] = await conn.execute(
        `SELECT COALESCE(MAX(schedule_version), 0) + 1 AS next
         FROM medication_schedules WHERE patient_id=?`,
        [photo.patient_id]
      );
      for (const slot of slots) {
        await conn.execute(
          `INSERT INTO medication_schedules
             (id, medication_id, patient_id, scheduled_time, generated_reason,
              is_confirmed, is_prn_slot, schedule_version, status)
           VALUES (?, ?, ?, ?, ?, 1, 0, ?, 'scheduled')`,
          [uuidv4(), photo.medication_id, photo.patient_id, slot.scheduled_time,
            slot.generated_reason || 'pharmacist-approved generated schedule', versionRow.next]
        );
      }
      await conn.execute("UPDATE prescription_photos SET review_stage='complete' WHERE id=?", [photoId]);
      await conn.execute(
        `UPDATE patients p JOIN medications m ON m.patient_id=p.id SET p.priority_flag=1
         WHERE m.id=? AND p.medical_condition_enc IS NOT NULL`,
        [photo.medication_id]
      );
    }
    await createPatientNotification({
      patientId: photo.patient_id,
      type: { approve: 'prescription_approved', reject: 'prescription_rejected', needs_clearer: 'prescription_needs_clearer' }[action],
      eventKey: `prescription:${photo.id}:${status}`,
      medicineName: photo.drug_name_raw,
      metadata: { prescription_id: photo.id, medication_id: photo.medication_id },
      executor: conn,
    });
    await audit(
      conn,
      photo,
      pharmacistId,
      action === 'approve' ? 'schedule_approved' : status,
      parsed.value.reason ? 'Reason recorded on prescription decision' : null
    );
    if (options.failBeforeCommit) throw new Error('Injected validation transaction failure');
    await conn.commit();
    return { status, medication_id: photo.medication_id };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function validationHistory(pharmacistId, photoId) {
  const [[photo]] = await pool.execute('SELECT id FROM prescription_photos WHERE id=?', [photoId]);
  if (!photo) return null;
  const [rows] = await pool.execute(
    `SELECT id, event_type, reason, event_time,
            CASE WHEN pharmacist_id=? THEN 'you' ELSE 'another_pharmacist' END AS actor
     FROM prescription_validation_audit WHERE prescription_id=? ORDER BY event_time ASC, id ASC`,
    [pharmacistId, photoId]
  );
  return rows;
}

export async function purgeExpiredPhotos(now = new Date()) {
  const [rows] = await pool.execute(
    `SELECT id, redacted_path FROM prescription_photos
     WHERE redacted_path IS NOT NULL AND purge_at IS NOT NULL AND purge_at < ?`, [now]
  );
  let purged = 0;
  for (const row of rows) {
    const abs = path.resolve(UPLOADS_DIR, path.basename(row.redacted_path));
    try {
      if (abs.startsWith(UPLOADS_DIR) && fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {
      // Best-effort file removal; decision metadata remains.
    }
    await pool.execute('UPDATE prescription_photos SET redacted_path=NULL WHERE id=?', [row.id]);
    purged++;
  }
  return purged;
}
