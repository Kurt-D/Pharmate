import { pool } from '../db/connection.js';
import { sendPush } from './notifications.js';
import { createPatientNotification } from './patientNotifications.js';
import { publishUser } from './realtimeEvents.js';
import { getStreakStatus, listPatientsForStreakJob, manilaDayKey } from './streakLifecycle.js';

async function sendLifecyclePush(patient, notification) {
  if (!patient.fcm_token || !notification) return false;
  const result = await sendPush(patient.fcm_token, {
    title: notification.title,
    body: notification.message,
    highPriority: true,
    data: {
      type: notification.type,
      notification_id: notification.id,
      screen: notification.metadata?.screen || 'Today',
    },
  });
  if (result.ok) {
    await pool.execute('UPDATE patient_notifications SET push_sent_at = NOW(3) WHERE id = ?', [
      notification.id,
    ]);
  }
  return result.ok;
}

async function pendingLifecycleNotification(patientId, types) {
  const placeholders = types.map(() => '?').join(',');
  const [[row]] = await pool.execute(
    `SELECT id, type, title, message, metadata
     FROM patient_notifications
     WHERE patient_id = ? AND type IN (${placeholders}) AND push_sent_at IS NULL
     ORDER BY created_at ASC LIMIT 1`,
    [patientId, ...types]
  );
  if (row && typeof row.metadata === 'string') row.metadata = JSON.parse(row.metadata);
  return row || null;
}

/** 20:00 gentle and 22:30 urgent warning dispatch. */
export async function dispatchStreakWarnings(level, now = new Date()) {
  const patients = await listPatientsForStreakJob();
  const day = manilaDayKey(now);
  let created = 0;
  let sent = 0;
  for (const patient of patients) {
    const status = await getStreakStatus(patient.id, now);
    if (status.current_days < 1 || status.today.pending < 1) continue;
    const urgent = level === 'urgent';
    const message = urgent
      ? `Urgent: ${status.today.pending} dose${status.today.pending === 1 ? '' : 's'} remain. Complete them before midnight to keep your ${status.current_days}-day streak.`
      : `Keep your ${status.current_days}-day streak. You have ${status.today.pending} dose${status.today.pending === 1 ? '' : 's'} left today.`;
    const result = await createPatientNotification({
      patientId: patient.id,
      type: 'streak_warning',
      eventKey: `streak-warning:${patient.id}:${day}:${level}`,
      title: urgent ? 'Your streak is at risk' : 'Keep your streak going',
      message,
      metadata: {
        screen: 'MedicationList',
        streak_days: status.current_days,
        warning_level: level,
        dose_count: status.today.pending,
      },
    });
    if (!result.created) continue;
    created++;
    publishUser(patient.id, 'notification-updated', { reason: 'streak-warning', status });
    const notification = await pendingLifecycleNotification(patient.id, ['streak_warning']);
    if (await sendLifecyclePush(patient, notification)) sent++;
  }
  return { created, sent };
}

/** 08:00 reconciliation, reset/recovery notice, and milestone push. */
export async function dispatchMorningStreakLifecycle(now = new Date()) {
  const patients = await listPatientsForStreakJob();
  let sent = 0;
  for (const patient of patients) {
    await getStreakStatus(patient.id, now);
    const notification = await pendingLifecycleNotification(patient.id, [
      'streak_reset',
      'reward_earned',
    ]);
    if (notification) {
      publishUser(patient.id, 'notification-updated', {
        reason: notification.type,
        notification,
      });
    }
    if (await sendLifecyclePush(patient, notification)) sent++;
  }
  return { evaluated: patients.length, sent };
}
