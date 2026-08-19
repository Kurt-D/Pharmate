/**
 * Missed-dose alerts (Sprint 7, UC-08).
 *
 * When a dose is marked missed, raise an alert. Linked caregivers each get a
 * 'caregiver'-channel alert; if the patient has no caregiver, a single
 * 'pharmacist'-channel alert flags the dashboard for follow-up (no-caregiver
 * mode). Alerts store only foreign keys — surfacing joins to patient_code, so no
 * name/condition/PII is ever exposed.
 */
import { pool } from '../db/connection.js';

/** Raise alerts for a newly-missed dose. Caregivers if linked, else pharmacist flag. */
export async function raiseMissedAlerts(patientId, scheduleId) {
  const [cgs] = await pool.execute(
    "SELECT caregiver_id FROM caregiver_patients WHERE patient_id = ? AND status = 'active'",
    [patientId]
  );

  if (cgs.length > 0) {
    const [[preferences]] = await pool.execute(
      `SELECT caregiver_missed_alerts_enabled FROM patient_preferences WHERE patient_id = ?`,
      [patientId]
    );
    if (preferences && !preferences.caregiver_missed_alerts_enabled) return 0;
    for (const c of cgs) {
      await pool.execute(
        `INSERT INTO caregiver_alerts (id, patient_id, schedule_id, caregiver_id, channel)
         VALUES (UUID(), ?, ?, ?, 'caregiver')`,
        [patientId, scheduleId, c.caregiver_id]
      );
    }
    return cgs.length;
  } else {
    await pool.execute(
      `INSERT INTO caregiver_alerts (id, patient_id, schedule_id, caregiver_id, channel)
       VALUES (UUID(), ?, ?, NULL, 'pharmacist')`,
      [patientId, scheduleId]
    );
    return 1;
  }
}

/** Alerts for one caregiver's patients — patient_code only, no PII. */
export async function caregiverAlerts(caregiverId) {
  const [rows] = await pool.execute(
    `SELECT ca.id, ca.status, ca.created_at, p.patient_code,
            m.drug_name_raw AS drug_name, ms.scheduled_time
     FROM caregiver_alerts ca
     JOIN caregiver_patients cp
       ON cp.patient_id = ca.patient_id AND cp.caregiver_id = ca.caregiver_id
     JOIN patients p ON p.id = ca.patient_id
     LEFT JOIN medication_schedules ms ON ms.id = ca.schedule_id
     LEFT JOIN medications m ON m.id = ms.medication_id
     WHERE ca.caregiver_id = ? AND ca.channel = 'caregiver' AND cp.status = 'active'
     ORDER BY ca.created_at DESC`,
    [caregiverId]
  );
  return rows;
}

/** No-caregiver follow-up flags for the pharmacist dashboard — patient_code only. */
export async function pharmacistFollowups() {
  const [rows] = await pool.execute(
    `SELECT ca.id, ca.status, ca.created_at, p.patient_code,
            m.drug_name_raw AS drug_name, ms.scheduled_time
     FROM caregiver_alerts ca
     JOIN patients p ON p.id = ca.patient_id
     LEFT JOIN medication_schedules ms ON ms.id = ca.schedule_id
     LEFT JOIN medications m ON m.id = ms.medication_id
     WHERE ca.channel = 'pharmacist' AND ca.status = 'unseen'
     ORDER BY ca.created_at DESC`
  );
  return rows;
}
