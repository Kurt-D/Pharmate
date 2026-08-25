/**
 * Dose logging + adherence service (Sprint 6 — UC-05/06/07, D-C, D-F).
 *
 * Closes the patient loop: log a dose (taken / late / snoozed), sweep overdue
 * doses to MISSED (the 30-minute rule), reflow the rest of the day after a late
 * intake (ENG §8), and flush an offline outbox idempotently on reconnect.
 *
 * Timezone discipline: adherence delays are computed from ABSOLUTE instants
 * (mysql2 reads scheduled_time back as a Date via the +08:00 pool), never from
 * SQL NOW() — the CI MySQL container runs in UTC, so comparing a Manila
 * wall-clock column to NOW() would be 8 hours off.
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { classifyByDelay } from '../../engine/doseStatus.js';
import { reflowRemaining } from '../../engine/index.js';
import { idealSlots } from '../../engine/intervals.js';
import { parseClock } from '../../engine/time.js';
import { raiseMissedAlerts } from './alerts.js';
import { createPatientNotification } from './patientNotifications.js';
import { publishPatientAdherence } from './caregiverEvents.js';

const VALID_METHODS = ['fcm', 'local', 'manual', 'ocr'];
const MANILA_OFFSET_MS = 8 * 3600 * 1000;

/** Minute-of-day (Asia/Manila) of an absolute instant. */
function manilaMinuteOfDay(date) {
  const d = new Date(date.getTime() + MANILA_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** The patient's current confirmed day plan (latest version for each medicine). */
export async function todayDoses(patientId) {
  const [rows] = await pool.execute(
    `SELECT ms.id AS schedule_id, ms.medication_id, ms.scheduled_time, ms.status,
            ms.generated_reason, m.drug_name_raw
     FROM medication_schedules ms
     JOIN medications m ON m.id = ms.medication_id
     WHERE ms.patient_id = ?
       AND ms.schedule_version = (
         SELECT COALESCE(MAX(schedule_version), 0)
         FROM medication_schedules
         WHERE patient_id = ? AND medication_id = ms.medication_id
       )
     ORDER BY ms.scheduled_time ASC`,
    [patientId, patientId]
  );
  return rows.map((r) => ({
    schedule_id: r.schedule_id,
    medication_id: r.medication_id,
    drug_name: r.drug_name_raw,
    scheduled_time: r.scheduled_time,
    status: r.status,
    reason: r.generated_reason,
  }));
}

/**
 * Log a dose. Timing decides the status (D-C) unless the action is an explicit
 * snooze. Append-only and idempotent on the client-supplied log id (offline
 * outbox dedup, D-F). A late intake returns a reflow suggestion (ENG §8).
 */
export async function logDose(patientId, scheduleId, opts = {}) {
  const { logged_at, method = 'manual', notes = null, log_id, action = 'take' } = opts;

  const [rows] = await pool.execute(
    `SELECT ms.id, ms.medication_id, ms.scheduled_time, ms.status, m.frequency_code
     FROM medication_schedules ms
     JOIN medications m ON m.id = ms.medication_id
     WHERE ms.id = ? AND ms.patient_id = ?`,
    [scheduleId, patientId]
  );
  const sched = rows[0];
  if (!sched) return { error: 'not_found' };

  const loggedAt = logged_at ? new Date(logged_at) : new Date();
  let status;
  if (action === 'snooze') {
    status = 'snoozed';
  } else {
    const delayMin = (loggedAt.getTime() - new Date(sched.scheduled_time).getTime()) / 60000;
    status = classifyByDelay(delayMin); // taken | taken_late | missed
  }

  const confirmationMethod = VALID_METHODS.includes(method) ? method : 'manual';
  const logId = log_id || uuidv4();

  // Append-only; a re-sent log id is a no-op (idempotent offline flush).
  await pool.execute(
    `INSERT INTO dose_logs
       (id, schedule_id, patient_id, logged_at, confirmation_method, status, notes, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE id = id`,
    [logId, scheduleId, patientId, loggedAt, confirmationMethod, status, notes]
  );

  // Reflect on the schedule row. 'snoozed' is not terminal; timing statuses are.
  await pool.execute(`UPDATE medication_schedules SET status = ? WHERE id = ?`, [
    status,
    scheduleId,
  ]);

  let reflow = null;
  if (status === 'taken_late') {
    reflow = await reflowSuggestion(patientId, sched.frequency_code, loggedAt);
  }
  await publishPatientAdherence(patientId, {
    schedule_id: scheduleId,
    status,
    logged_at: loggedAt.toISOString(),
  });
  return { status, log_id: logId, reflow };
}

/**
 * Suggested reflow of the rest of the day after a late intake (ENG §8). Returns
 * the recomputed remaining times for the patient to re-confirm (we never silently
 * mutate confirmed doses — the patient owns confirmation, ENG §6). Only interval
 * drugs reflow; anchored/PRN return null.
 */
async function reflowSuggestion(patientId, frequencyCode, loggedAt) {
  const [aRows] = await pool.execute(
    `SELECT sleep_anchor FROM patient_anchors WHERE patient_id = ?`,
    [patientId]
  );
  const sleepAnchor = aRows[0]?.sleep_anchor ?? '22:00:00';
  const info = idealSlots(frequencyCode, { sleep: String(sleepAnchor).slice(0, 5) });
  if (info.kind !== 'interval') return null;

  const { kept, dropped } = reflowRemaining({
    intervalHours: info.intervalMin / 60,
    takenTimeMin: manilaMinuteOfDay(loggedAt),
    sleepAnchorMin: parseClock(String(sleepAnchor).slice(0, 5)),
  });
  return { kept, dropped };
}

/**
 * Sweep overdue doses to MISSED (the 30-minute rule). A scheduled dose more than
 * 30 minutes past its time with no taken log is MISSED. Logging within the 2-hour
 * window can still convert it to TAKEN_LATE (that path runs through logDose); past
 * that it is immutable.
 * @returns {Promise<number>} count marked missed
 */
export async function sweepMissed(now = new Date()) {
  const [rows] = await pool.execute(
    `SELECT ms.id, ms.patient_id, ms.scheduled_time, m.drug_name_raw
     FROM medication_schedules ms
     JOIN medications m ON m.id = ms.medication_id
     WHERE ms.status = 'scheduled'`
  );
  let missed = 0;
  for (const r of rows) {
    const delayMin = (now.getTime() - new Date(r.scheduled_time).getTime()) / 60000;
    if (delayMin > 30) {
      const conn = await pool.getConnection();
      let changed = false;
      try {
        await conn.beginTransaction();
        const [res] = await conn.execute(
          `UPDATE medication_schedules SET status = 'missed' WHERE id = ? AND status = 'scheduled'`,
          [r.id]
        );
        changed = res.affectedRows > 0;
        if (changed) {
          await createPatientNotification({
            patientId: r.patient_id,
            type: 'dose_missed',
            eventKey: `dose-missed:${r.id}`,
            medicineName: r.drug_name_raw,
            metadata: { schedule_id: r.id },
            executor: conn,
          });
        }
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
      if (changed) {
        missed++;
        // UC-08: alert caregivers (or flag the pharmacist if none) on the missed dose.
        await raiseMissedAlerts(r.patient_id, r.id);
        await publishPatientAdherence(r.patient_id, {
          schedule_id: r.id,
          status: 'missed',
          scheduled_time: r.scheduled_time,
          medicine_name: r.drug_name_raw,
        });
      }
    }
  }
  return missed;
}

/**
 * Flush an offline outbox (D-F). Idempotent: each log carries a client-generated
 * id; already-present ids are counted as duplicates and skipped. Last-write-wins
 * is inherent — a dose's terminal status is a pure function of its timing.
 */
export async function syncLogs(patientId, logs) {
  let applied = 0;
  let duplicates = 0;
  for (const log of logs) {
    if (!log.log_id || !log.schedule_id) continue;
    const [existing] = await pool.execute(`SELECT id FROM dose_logs WHERE id = ?`, [log.log_id]);
    if (existing.length > 0) {
      duplicates++;
      continue;
    }
    const r = await logDose(patientId, log.schedule_id, {
      ...log,
      method: log.method || 'local',
    });
    if (!r.error) applied++;
  }
  return { applied, duplicates };
}
