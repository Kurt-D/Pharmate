import { pool } from '../db/connection.js';

export const DEFAULT_TIMEZONE = 'Asia/Manila';
export const DEFAULT_DUE_WINDOW_MINUTES = 30;

const TERMINAL_TAKEN = new Set(['taken', 'taken_late']);

function localDateKey(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Resolve a local midnight to an instant without assuming the database/session
// timezone. The second pass handles offsets on either side of a DST transition.
function zonedMidnight(date, timeZone) {
  const nominalUtc = Date.parse(`${date}T00:00:00Z`);
  const offsetAt = (instant) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const get = (type) => Number(parts.find((part) => part.type === type)?.value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - instant;
  };
  let result = nominalUtc - offsetAt(nominalUtc);
  result = nominalUtc - offsetAt(result);
  return new Date(result);
}

export function dateRangeBounds(startDate, endDate, timeZone = DEFAULT_TIMEZONE) {
  const start = zonedMidnight(startDate, timeZone);
  const endLocal = new Date(`${endDate}T00:00:00Z`);
  endLocal.setUTCDate(endLocal.getUTCDate() + 1);
  const end = zonedMidnight(endLocal.toISOString().slice(0, 10), timeZone);
  return { start, end };
}

export function computeDoseStatus(row, now = new Date(), dueWindowMinutes = DEFAULT_DUE_WINDOW_MINUTES) {
  if (row.taken_at || TERMINAL_TAKEN.has(String(row.stored_status).toLowerCase())) return 'TAKEN';
  if (String(row.stored_status).toLowerCase() === 'missed') return 'MISSED';
  const scheduled = new Date(row.scheduled_at).getTime();
  const current = new Date(now).getTime();
  if (current < scheduled) return 'UPCOMING';
  if (current <= scheduled + dueWindowMinutes * 60_000) return 'DUE';
  return 'MISSED';
}

function doseValue(row) {
  if (row.dosage_instruction) return row.dosage_instruction;
  if (row.strength_value == null) return null;
  return `${Number(row.strength_value)} ${row.strength_unit || ''}`.trim();
}

export function serializeMedicationDose(row, now = new Date(), dueWindowMinutes) {
  const status = computeDoseStatus(row, now, dueWindowMinutes);
  return {
    dose_id: row.dose_id,
    schedule_id: row.dose_id,
    medication_id: row.medication_id,
    medication_name: row.medication_name,
    drug_name: row.medication_name,
    medicine_name: row.medication_name,
    dose: doseValue(row),
    dosage_instruction: row.dosage_instruction ?? null,
    scheduled_at: row.scheduled_at,
    scheduled_time: row.scheduled_at,
    status,
    taken_at: row.taken_at ?? null,
    logged_at: row.taken_at ?? null,
    schedule_status: row.schedule_status || 'APPROVED',
    schedule_type: row.schedule_type ?? null,
    frequency: row.frequency ?? null,
    interval_hours: row.interval_hours == null ? null : Number(row.interval_hours),
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    instructions: row.dosage_instruction ?? row.label_direction ?? null,
    generated_reason: row.generated_reason ?? null,
    reason: row.generated_reason ?? null,
  };
}

/** One read model used by dashboard, medication page, and calendar/history. */
export async function getPatientMedicationSchedule(patientId, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const [[preference]] = await pool.execute(
    `SELECT COALESCE(timezone, ?) AS timezone FROM patient_preferences WHERE patient_id = ?`,
    [DEFAULT_TIMEZONE, patientId]
  );
  const timeZone = options.timeZone || preference?.timezone || DEFAULT_TIMEZONE;
  const startDate = options.startDate || options.date || localDateKey(now, timeZone);
  const endDate = options.endDate || options.date || startDate;
  const { start, end } = dateRangeBounds(startDate, endDate, timeZone);
  const [rows] = await pool.execute(
    `SELECT ms.id AS dose_id, ms.medication_id, ms.scheduled_time AS scheduled_at,
            ms.status AS stored_status, ms.generated_reason,
            m.drug_name_raw AS medication_name, m.dosage_instruction, m.label_direction,
            m.strength_value, m.strength_unit, m.frequency, m.schedule_type,
            m.interval_hours, m.start_date, m.end_date, m.schedule_status,
            (SELECT dl.logged_at FROM dose_logs dl
              WHERE dl.schedule_id = ms.id AND dl.status IN ('taken','taken_late')
              ORDER BY dl.created_at DESC LIMIT 1) AS taken_at
       FROM medication_schedules ms
       JOIN medications m ON m.id = ms.medication_id AND m.patient_id = ms.patient_id
      WHERE ms.patient_id = ?
        AND ms.scheduled_time >= ? AND ms.scheduled_time < ?
        AND (ms.status IN ('taken','taken_late','missed') OR (
          m.schedule_status = 'APPROVED' AND ms.is_confirmed = 1 AND
          ms.schedule_version = (SELECT COALESCE(MAX(ms2.schedule_version), 0)
            FROM medication_schedules ms2
            WHERE ms2.patient_id = ms.patient_id AND ms2.medication_id = ms.medication_id)
        ))
      ORDER BY ms.scheduled_time ASC, ms.id ASC`,
    [patientId, start, end]
  );
  return {
    patient_id: patientId,
    date: options.date || null,
    start_date: startDate,
    end_date: endDate,
    timezone: timeZone,
    doses: rows.map((row) => serializeMedicationDose(row, now, options.dueWindowMinutes)),
  };
}
