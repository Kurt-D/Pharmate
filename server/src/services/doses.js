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
import { publishDoseActivity } from './realtimeEvents.js';

const VALID_METHODS = ['fcm', 'local', 'manual', 'ocr'];
const MANILA_OFFSET_MS = 8 * 3600 * 1000;

function manilaDayKey(value = new Date()) {
  const shifted = new Date(new Date(value).getTime() + MANILA_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

function dayBounds(dayKey) {
  const start = new Date(`${dayKey}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

const CALENDAR_STATUSES = {
  all: null,
  upcoming: ['scheduled', 'snoozed'],
  missed: ['missed'],
  taken: ['taken', 'taken_late'],
};

function serializeDose(r) {
  return {
    schedule_id: r.schedule_id,
    medication_id: r.medication_id,
    drug_name: r.drug_name_raw,
    scheduled_time: r.scheduled_time,
    logged_at: r.logged_at ?? null,
    status: r.status,
    reason: r.generated_reason,
    dosage_instruction: r.dosage_instruction ?? null,
    strength: r.strength_value
      ? `${Number(r.strength_value)} ${r.strength_unit || ''}`.trim()
      : null,
    dosage_form: r.dosage_form_snapshot ?? null,
  };
}

async function emitDoseActivity(patientId, scheduleId, status, loggedAt) {
  try {
    await publishDoseActivity(patientId, scheduleId, status, loggedAt);
  } catch (error) {
    // Live delivery is best-effort: a temporary stream failure must never undo
    // or misreport a dose that was already safely stored in MySQL.
    if (process.env.NODE_ENV !== 'test') {
      console.error('[realtime] dose update could not be published:', error.message);
    }
  }
}

/** Minute-of-day (Asia/Manila) of an absolute instant. */
function manilaMinuteOfDay(date) {
  const d = new Date(date.getTime() + MANILA_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** The patient's current confirmed day plan (latest version for each medicine). */
export async function todayDoses(patientId) {
  const { start, end } = dayBounds(manilaDayKey());
  const [rows] = await pool.execute(
    `SELECT ms.id AS schedule_id, ms.medication_id, ms.scheduled_time, ms.status,
            ms.generated_reason, m.drug_name_raw, m.dosage_instruction,
            m.strength_value, m.strength_unit, m.dosage_form_snapshot,
            (SELECT dl.logged_at FROM dose_logs dl
              WHERE dl.schedule_id=ms.id AND dl.status IN ('taken','taken_late')
              ORDER BY dl.created_at DESC LIMIT 1) AS logged_at
       FROM medication_schedules ms
       JOIN medications m ON m.id=ms.medication_id
      WHERE ms.patient_id=? AND (
        (ms.status IN ('scheduled','snoozed') AND ms.scheduled_time>=?
          AND ms.schedule_version=(SELECT COALESCE(MAX(schedule_version),0)
            FROM medication_schedules WHERE patient_id=? AND medication_id=ms.medication_id))
        OR
        (ms.status IN ('taken','taken_late','missed')
          AND ms.scheduled_time>=? AND ms.scheduled_time<?)
      )
      ORDER BY ms.scheduled_time ASC`,
    [patientId, start, patientId, start, end]
  );
  return rows.map(serializeDose);
}

/** Dose history for one Manila calendar day, optionally narrowed by UI status. */
export async function dosesForDate(patientId, date, status = 'all') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return { error: 'invalid_date' };
  }
  if (!Object.hasOwn(CALENDAR_STATUSES, status)) return { error: 'invalid_status' };
  const { start, end } = dayBounds(date);
  const selectedStatuses = CALENDAR_STATUSES[status];
  const statusClause = selectedStatuses
    ? ` AND ms.status IN (${selectedStatuses.map(() => '?').join(',')})`
    : '';
  const [rows] = await pool.execute(
    `SELECT ms.id AS schedule_id, ms.medication_id, ms.scheduled_time, ms.status,
            ms.generated_reason, m.drug_name_raw, m.dosage_instruction,
            m.strength_value, m.strength_unit, m.dosage_form_snapshot,
            (SELECT dl.logged_at
               FROM dose_logs dl
              WHERE dl.schedule_id = ms.id AND dl.status IN ('taken','taken_late')
              ORDER BY dl.created_at DESC LIMIT 1) AS logged_at
     FROM medication_schedules ms
     JOIN medications m ON m.id = ms.medication_id
     WHERE ms.patient_id = ?
       AND ms.scheduled_time >= ? AND ms.scheduled_time < ?
       AND (ms.status IN ('taken','taken_late','missed') OR ms.schedule_version = (
         SELECT COALESCE(MAX(schedule_version), 0)
         FROM medication_schedules
         WHERE patient_id = ? AND medication_id = ms.medication_id
       ))
       ${statusClause}
     ORDER BY ms.scheduled_time ASC`,
    [patientId, start, end, patientId, ...(selectedStatuses || [])]
  );
  return rows.map(serializeDose);
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
  await emitDoseActivity(patientId, scheduleId, status, loggedAt);
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
        await emitDoseActivity(r.patient_id, r.id, 'missed', now);
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
