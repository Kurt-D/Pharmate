/**
 * Prescription lifecycle service (Sprint 5, UC-03, D-K).
 *
 * Ties the redacted-photo upload to the pharmacist validation decision and the
 * 7-day purge. Kept in one place so the patient upload path, the pharmacist
 * decision path, and the purge job stay consistent.
 *
 * The pharmacist's role ends at validation — there are NO scheduling controls
 * here. On approval the medication flips to `active`, which is all the engine
 * needs; the patient generates and confirms the schedule separately (ENG §6).
 */
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { UPLOADS_DIR } from '../middleware/upload.js';

const PURGE_DAYS = 7;

/** Record an uploaded redacted photo against a patient's RX medication. */
export async function attachPhoto(patientId, medicationId, storedFilename) {
  const [medRows] = await pool.execute(
    `SELECT id, source, status FROM medications WHERE id = ? AND patient_id = ?`,
    [medicationId, patientId]
  );
  const med = medRows[0];
  if (!med) return { error: 'not_found' };
  if (med.source !== 'RX_VALIDATED') return { error: 'not_rx' };
  if (med.status !== 'pending_validation') return { error: 'not_pending' };

  const photoId = uuidv4();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO prescription_photos (id, medication_id, redacted_path, status)
       VALUES (?, ?, ?, 'pending')`,
      [photoId, medicationId, storedFilename]
    );
    await conn.execute(`UPDATE medications SET prescription_photo_id = ? WHERE id = ?`, [
      photoId,
      medicationId,
    ]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { photoId };
}

/** The pharmacist validation queue — pending photos, patient shown by code only. */
export async function pendingValidations() {
  const [rows] = await pool.execute(
    `SELECT pp.id, pp.medication_id, pp.status, pp.created_at,
            m.drug_name_raw, m.frequency, m.dosage_instruction,
            p.patient_code
     FROM prescription_photos pp
     JOIN medications m ON m.id = pp.medication_id
     JOIN patients p ON p.id = m.patient_id
     WHERE pp.status = 'pending'
     ORDER BY pp.created_at ASC`
  );
  return rows;
}

/** Absolute path of a photo's redacted file, guarded against traversal. */
export async function photoFilePath(photoId) {
  const [rows] = await pool.execute(`SELECT redacted_path FROM prescription_photos WHERE id = ?`, [
    photoId,
  ]);
  const rel = rows[0]?.redacted_path;
  if (!rel) return null;
  const abs = path.resolve(UPLOADS_DIR, path.basename(rel));
  if (!abs.startsWith(UPLOADS_DIR)) return null; // defense-in-depth
  return abs;
}

/**
 * Record a validation decision (TC-04).
 *   approve       → photo approved, medication → active (schedulable)
 *   reject        → photo rejected with reason, medication stays pending so the
 *                   patient can resubmit or visit a branch
 *   needs_clearer → photo flagged, medication stays pending for a clearer resubmit
 * On any decision, purge_at is set to decision + 7 days (D-K).
 */
export async function decideValidation(pharmacistId, photoId, action, reason) {
  const VALID = ['approve', 'reject', 'needs_clearer'];
  if (!VALID.includes(action)) return { error: 'bad_action' };
  if ((action === 'reject' || action === 'needs_clearer') && !String(reason ?? '').trim()) {
    return { error: 'reason_required' };
  }

  const [rows] = await pool.execute(
    `SELECT pp.id, pp.status, pp.medication_id
     FROM prescription_photos pp WHERE pp.id = ?`,
    [photoId]
  );
  const photo = rows[0];
  if (!photo) return { error: 'not_found' };
  if (photo.status !== 'pending') return { error: 'already_decided' };

  const statusMap = { approve: 'approved', reject: 'rejected', needs_clearer: 'needs_clearer' };
  const photoStatus = statusMap[action];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE prescription_photos
         SET status = ?, decision_reason = ?, pharmacist_id = ?,
             decision_at = NOW(3), purge_at = DATE_ADD(NOW(3), INTERVAL ? DAY)
       WHERE id = ?`,
      [photoStatus, reason ?? null, pharmacistId, PURGE_DAYS, photoId]
    );

    if (action === 'approve') {
      await conn.execute(
        `UPDATE medications
           SET status = 'active', pharmacist_id = ?, validated_at = NOW(3)
         WHERE id = ?`,
        [pharmacistId, photo.medication_id]
      );
      // PART 2: approving a prescription for a patient who declared a chronic
      // condition at enrollment verifies that condition — priority_flag flips
      // true. This is DERIVED from the validation the pharmacist already does;
      // there is no severity picker anywhere (PART 4, flag 2).
      await conn.execute(
        `UPDATE patients p
           JOIN medications m ON m.patient_id = p.id
            SET p.priority_flag = 1
          WHERE m.id = ? AND p.medical_condition_enc IS NOT NULL`,
        [photo.medication_id]
      );
    }
    // reject / needs_clearer: medication stays 'pending_validation' so the
    // patient can upload a clearer photo (TC-04 resubmission path).

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { status: photoStatus, medication_id: photo.medication_id };
}

/**
 * Purge redacted images whose retention window has elapsed (D-K). Deletes the
 * file from disk and nulls redacted_path; the decision metadata row is retained.
 * @returns {Promise<number>} number of photos purged
 */
export async function purgeExpiredPhotos(now = new Date()) {
  const [rows] = await pool.execute(
    `SELECT id, redacted_path FROM prescription_photos
     WHERE redacted_path IS NOT NULL AND purge_at IS NOT NULL AND purge_at < ?`,
    [now]
  );
  let purged = 0;
  for (const row of rows) {
    const abs = path.resolve(UPLOADS_DIR, path.basename(row.redacted_path));
    try {
      if (abs.startsWith(UPLOADS_DIR) && fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch {
      // best-effort file removal; still clear the DB pointer below
    }
    await pool.execute(`UPDATE prescription_photos SET redacted_path = NULL WHERE id = ?`, [
      row.id,
    ]);
    purged++;
  }
  return purged;
}
