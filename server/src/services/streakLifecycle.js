import { pool } from '../db/connection.js';
import { createPatientNotification } from './patientNotifications.js';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TAKEN = new Set(['taken', 'taken_late']);

export function manilaDayKey(instant = new Date()) {
  const shifted = new Date(new Date(instant).getTime() + MANILA_OFFSET_MS);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function shiftDay(dayKey, days) {
  const midnight = new Date(`${dayKey}T00:00:00.000Z`);
  return manilaDayKey(new Date(midnight.getTime() + days * DAY_MS - MANILA_OFFSET_MS));
}

function utcBounds(dayKey) {
  const start = new Date(new Date(`${dayKey}T00:00:00.000Z`).getTime() - MANILA_OFFSET_MS);
  return [start, new Date(start.getTime() + DAY_MS)];
}

function rewardForDay(days) {
  if (days === 3 || days === 6) return 1;
  if (days === 7) return 2;
  return 0;
}

async function ensureStreak(patientId, executor = pool) {
  await executor.execute('INSERT IGNORE INTO patient_streaks (patient_id) VALUES (?)', [patientId]);
}

async function daySummary(patientId, dayKey, executor = pool) {
  const [start, end] = utcBounds(dayKey);
  const [rows] = await executor.execute(
    `SELECT status, COUNT(*) AS count
     FROM medication_schedules
     WHERE patient_id = ? AND is_confirmed = 1 AND is_prn_slot = 0
       AND scheduled_time >= ? AND scheduled_time < ?
     GROUP BY status`,
    [patientId, start, end]
  );
  const counts = Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
  const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
  const taken = [...TAKEN].reduce((sum, status) => sum + Number(counts[status] || 0), 0);
  const missed = Number(counts.missed || 0);
  return { total, taken, missed, pending: Math.max(0, total - taken - missed) };
}

/** Evaluate one calendar day exactly once after it becomes complete or broken. */
export async function evaluateStreakDay(patientId, dayKey, now = new Date()) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensureStreak(patientId, connection);
    // Lock the patient's lifecycle row before checking the day result so two
    // open UI surfaces cannot award or reset the same day concurrently.
    const [[streak]] = await connection.execute(
      'SELECT * FROM patient_streaks WHERE patient_id = ? FOR UPDATE',
      [patientId]
    );
    const [[existing]] = await connection.execute(
      'SELECT * FROM patient_streak_days WHERE patient_id = ? AND dose_date = ?',
      [patientId, dayKey]
    );
    if (existing) {
      await connection.commit();
      return { processed: false, ...existing };
    }

    const summary = await daySummary(patientId, dayKey, connection);
    if (summary.total === 0 || summary.pending > 0) {
      await connection.rollback();
      return { processed: false, pending: summary.pending, summary };
    }

    const complete = summary.taken === summary.total && summary.missed === 0;
    const yesterday = shiftDay(dayKey, -1);
    const continued = streak.last_completed_date
      ? manilaDayKey(streak.last_completed_date) === yesterday
      : false;
    const nextDays = complete ? (continued ? Number(streak.current_days) + 1 : 1) : 0;
    const tokens = complete ? rewardForDay(nextDays) : 0;

    await connection.execute(
      `INSERT INTO patient_streak_days
       (patient_id, dose_date, result, scheduled_count, taken_count, streak_after, tokens_awarded, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        dayKey,
        complete ? 'complete' : 'broken',
        summary.total,
        summary.taken,
        nextDays,
        tokens,
        now,
      ]
    );
    await connection.execute(
      `UPDATE patient_streaks
       SET current_days = ?, priority_tokens = priority_tokens + ?,
           last_completed_date = ?, updated_at = ?
       WHERE patient_id = ?`,
      [nextDays, tokens, complete ? dayKey : null, now, patientId]
    );

    if (tokens > 0) {
      await createPatientNotification({
        patientId,
        type: 'reward_earned',
        eventKey: `streak-reward:${patientId}:${dayKey}`,
        title: 'Priority Token reward earned',
        message: `You completed a ${nextDays}-day streak and earned ${tokens} Priority Token${tokens === 1 ? '' : 's'}.`,
        metadata: { screen: 'StreakDetails', tokens, streak_days: nextDays },
        executor: connection,
      });
    } else if (!complete) {
      await createPatientNotification({
        patientId,
        type: 'streak_reset',
        eventKey: `streak-reset:${patientId}:${dayKey}`,
        title: 'Your streak has reset',
        message: "Take all of today's scheduled doses to begin Day 1 again.",
        metadata: { screen: 'MedicationList', streak_days: 0 },
        executor: connection,
      });
    }
    await connection.commit();
    return { processed: true, result: complete ? 'complete' : 'broken', nextDays, tokens, summary };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getStreakStatus(patientId, now = new Date()) {
  const today = manilaDayKey(now);
  const yesterday = shiftDay(today, -1);
  await evaluateStreakDay(patientId, yesterday, now);
  await evaluateStreakDay(patientId, today, now);
  await ensureStreak(patientId);

  const [summary, [[streak]], [[yesterdayResult]], [[reward]]] = await Promise.all([
    daySummary(patientId, today),
    pool.execute('SELECT * FROM patient_streaks WHERE patient_id = ?', [patientId]),
    pool.execute('SELECT result FROM patient_streak_days WHERE patient_id = ? AND dose_date = ?', [
      patientId,
      yesterday,
    ]),
    pool.execute(
      `SELECT COUNT(*) AS count FROM patient_notifications
       WHERE patient_id = ? AND type = 'reward_earned' AND read_at IS NULL`,
      [patientId]
    ),
  ]);

  const manilaHour = new Date(now.getTime() + MANILA_OFFSET_MS).getUTCHours();
  const rewardReady = Number(reward?.count || 0) > 0;
  let state = 'active';
  if (rewardReady) state = 'reward_ready';
  else if (summary.total > 0 && summary.taken === summary.total) state = 'safe';
  else if (manilaHour >= 18 && summary.pending > 0 && Number(streak.current_days) > 0)
    state = 'at_risk';
  else if (yesterdayResult?.result === 'broken') state = 'broken';

  return {
    state,
    current_days: Number(streak.current_days),
    priority_tokens: Number(streak.priority_tokens),
    reward_ready: rewardReady,
    today: summary,
    generated_at: new Date(now).toISOString(),
  };
}

export async function listPatientsForStreakJob() {
  const [rows] = await pool.execute(
    `SELECT p.id, p.fcm_token, COALESCE(ps.current_days, 0) AS current_days
     FROM patients p LEFT JOIN patient_streaks ps ON ps.patient_id = p.id`
  );
  return rows;
}
