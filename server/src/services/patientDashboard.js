import { pool } from '../db/connection.js';

export const DASHBOARD_TIMEZONE = 'Asia/Manila';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TAKEN_STATUSES = new Set(['taken', 'taken_late']);

function startOfManilaDay(instant) {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MS);
  return (
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
    MANILA_OFFSET_MS
  );
}

function summarize(rows) {
  const eligibleDoses = rows.length;
  const taken = rows.filter((dose) => dose.status === 'taken').length;
  const takenLate = rows.filter((dose) => dose.status === 'taken_late').length;
  const missed = rows.filter((dose) => dose.status === 'missed').length;

  return {
    eligible_doses: eligibleDoses,
    taken,
    taken_late: takenLate,
    missed,
    adherence_percentage:
      eligibleDoses === 0 ? null : ((taken + takenLate) / eligibleDoses) * 100,
  };
}

function serializeDose(row) {
  return {
    schedule_id: row.schedule_id,
    medicine_name: row.medicine_name,
    dosage_instruction: row.dosage_instruction,
    scheduled_time: row.scheduled_time,
    status: row.status,
  };
}

/** Build the dashboard response from one patient's already-scoped dose rows. */
export function calculatePatientDashboard(rows, now = new Date()) {
  const generatedAt = new Date(now);
  const nowMs = generatedAt.getTime();
  const todayStart = startOfManilaDay(generatedAt);
  const tomorrowStart = todayStart + DAY_MS;
  const sevenDayStart = todayStart - 6 * DAY_MS;

  const arrived = rows.filter((dose) => new Date(dose.scheduled_time).getTime() <= nowMs);
  const todayRows = arrived.filter((dose) => {
    const time = new Date(dose.scheduled_time).getTime();
    return time >= todayStart && time < tomorrowStart;
  });
  const sevenDayRows = arrived.filter((dose) => {
    const time = new Date(dose.scheduled_time).getTime();
    return time >= sevenDayStart && time < tomorrowStart;
  });
  const future = rows
    .filter(
      (dose) =>
        new Date(dose.scheduled_time).getTime() > nowMs &&
        ['scheduled', 'snoozed'].includes(dose.status)
    )
    .sort(
      (a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime()
    );

  const newestFirst = [...arrived].sort(
    (a, b) => new Date(b.scheduled_time).getTime() - new Date(a.scheduled_time).getTime()
  );
  let currentDoseStreak = 0;
  for (const dose of newestFirst) {
    if (!TAKEN_STATUSES.has(dose.status)) break;
    currentDoseStreak++;
  }

  return {
    next_dose: future.length === 0 ? null : serializeDose(future[0]),
    upcoming_doses: future.slice(0, 3).map(serializeDose),
    today: summarize(todayRows),
    seven_days: summarize(sevenDayRows),
    current_dose_streak: currentDoseStreak,
    generated_at: generatedAt.toISOString(),
    timezone: DASHBOARD_TIMEZONE,
  };
}

/** Fetch and calculate a dashboard. The patient id always comes from the JWT route boundary. */
export async function getPatientDashboard(patientId, now = new Date()) {
  const [rows] = await pool.execute(
    `SELECT ms.id AS schedule_id, ms.scheduled_time, ms.status,
            m.drug_name_raw AS medicine_name, m.dosage_instruction
     FROM medication_schedules ms
     JOIN medications m
       ON m.id = ms.medication_id
      AND m.patient_id = ms.patient_id
     WHERE ms.patient_id = ?
       AND ms.is_confirmed = 1
     ORDER BY ms.scheduled_time ASC`,
    [patientId]
  );

  return calculatePatientDashboard(rows, now);
}
