import { getPatientMedicationSchedule } from './medicationSchedule.js';

export const DASHBOARD_TIMEZONE = 'Asia/Manila';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TAKEN_STATUSES = new Set(['taken', 'taken_late']);

function normalizedStatus(row, nowMs) {
  const status = String(row.status || '').toUpperCase();
  if (['UPCOMING', 'DUE', 'TAKEN', 'MISSED'].includes(status)) return status;
  if (['TAKEN', 'TAKEN_LATE'].includes(status)) return 'TAKEN';
  if (status === 'MISSED') return 'MISSED';
  return new Date(row.scheduled_at || row.scheduled_time).getTime() > nowMs ? 'UPCOMING' : 'DUE';
}

function startOfManilaDay(instant) {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MS);
  return (
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
    MANILA_OFFSET_MS
  );
}

function summarize(rows) {
  const eligibleDoses = rows.length;
  const taken = rows.filter((dose) => String(dose.status).toUpperCase() === 'TAKEN').length;
  const takenLate = rows.filter(
    (dose) => String(dose.status).toLowerCase() === 'taken_late'
  ).length;
  const missed = rows.filter((dose) => String(dose.status).toUpperCase() === 'MISSED').length;

  return {
    eligible_doses: eligibleDoses,
    taken,
    taken_late: takenLate,
    missed,
    adherence_percentage: eligibleDoses === 0 ? null : ((taken + takenLate) / eligibleDoses) * 100,
  };
}

function serializeDose(row) {
  return { ...row };
}

/** Build the dashboard response from one patient's already-scoped dose rows. */
export function calculatePatientDashboard(rows, now = new Date()) {
  const generatedAt = new Date(now);
  const nowMs = generatedAt.getTime();
  const todayStart = startOfManilaDay(generatedAt);
  const tomorrowStart = todayStart + DAY_MS;
  const sevenDayStart = todayStart - 6 * DAY_MS;

  const normalized = rows.map((dose) => ({ ...dose, status: normalizedStatus(dose, nowMs) }));
  const arrived = normalized.filter(
    (dose) => new Date(dose.scheduled_at || dose.scheduled_time).getTime() <= nowMs
  );
  const todayRows = arrived.filter((dose) => {
    const time = new Date(dose.scheduled_time).getTime();
    return time >= todayStart && time < tomorrowStart;
  });
  const sevenDayRows = arrived.filter((dose) => {
    const time = new Date(dose.scheduled_time).getTime();
    return time >= sevenDayStart && time < tomorrowStart;
  });
  const future = normalized
    .filter((dose) => new Date(dose.scheduled_time).getTime() > nowMs && dose.status === 'UPCOMING')
    .sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());

  const newestFirst = [...arrived].sort(
    (a, b) => new Date(b.scheduled_time).getTime() - new Date(a.scheduled_time).getTime()
  );
  let currentDoseStreak = 0;
  for (const dose of newestFirst) {
    if (dose.status !== 'TAKEN' && !TAKEN_STATUSES.has(String(dose.status).toLowerCase())) break;
    currentDoseStreak++;
  }

  return {
    doses: normalized.map(serializeDose),
    upcoming: normalized.filter((dose) => dose.status === 'UPCOMING').map(serializeDose),
    due: normalized.filter((dose) => dose.status === 'DUE').map(serializeDose),
    taken: normalized.filter((dose) => dose.status === 'TAKEN').map(serializeDose),
    missed: normalized.filter((dose) => dose.status === 'MISSED').map(serializeDose),
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
export async function getPatientDashboard(patientId, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const schedule = await getPatientMedicationSchedule(patientId, { now, date: options.date });
  return {
    ...calculatePatientDashboard(schedule.doses, now),
    date: schedule.start_date,
    timezone: schedule.timezone,
  };
}
