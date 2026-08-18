/** Preference-aware, privacy-safe online reminder dispatch. */
import { pool } from '../db/connection.js';
import { sendPush } from './notifications.js';
import { createPatientNotification } from './patientNotifications.js';

const MAX_LEAD_MIN = 60;
const GRACE_MIN = 15;
const GENERIC_PHRASE = 'It is time for your medicine.';

export async function dueReminders(
  now = new Date(),
  { graceMin = GRACE_MIN, maxLeadMin = MAX_LEAD_MIN } = {}
) {
  const from = new Date(now.getTime() - graceMin * 60000);
  const to = new Date(now.getTime() + maxLeadMin * 60000);
  const [rows] = await pool.execute(
    `SELECT ms.id AS schedule_id, ms.patient_id, ms.scheduled_time,
            m.drug_name_raw AS drug_name, p.fcm_token,
            COALESCE(pp.voice_enabled, 1) AS voice_enabled,
            COALESCE(pp.voice_detail, 'private') AS voice_detail,
            COALESCE(pp.vibration_enabled, 1) AS vibration_enabled,
            COALESCE(pp.reminder_lead_minutes, 0) AS reminder_lead_minutes,
            COALESCE(pp.lock_screen_detail, 'private') AS lock_screen_detail,
            COALESCE(pp.timezone, 'Asia/Manila') AS timezone
     FROM medication_schedules ms
     JOIN medications m ON m.id = ms.medication_id
     JOIN patients p ON p.id = ms.patient_id
     LEFT JOIN patient_preferences pp ON pp.patient_id = ms.patient_id
     WHERE ms.status = 'scheduled'
       AND ms.reminder_sent_at IS NULL
       AND ms.is_prn_slot = 0
       AND COALESCE(pp.reminders_enabled, 1) = 1
       AND ms.scheduled_time >= ?
       AND ms.scheduled_time <= ?
     ORDER BY ms.scheduled_time ASC`,
    [from, to]
  );
  return rows.filter(
    (row) =>
      new Date(row.scheduled_time).getTime() <=
      now.getTime() + Number(row.reminder_lead_minutes) * 60000
  );
}

function localClock(date, timezone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(date));
}

export function buildReminderPayload(reminder) {
  const body =
    reminder.lock_screen_detail === 'medicine_name'
      ? `It is time to take ${reminder.drug_name}.`
      : GENERIC_PHRASE;
  const data = {
    type: 'dose_reminder',
    schedule_id: reminder.schedule_id,
    scheduled_time: new Date(reminder.scheduled_time).toISOString(),
    local_time: localClock(reminder.scheduled_time, reminder.timezone),
    timezone: reminder.timezone,
    vibration_enabled: Boolean(reminder.vibration_enabled),
    voice_enabled: Boolean(reminder.voice_enabled),
  };
  if (reminder.voice_enabled) {
    data.voice_text =
      reminder.voice_detail === 'medicine_name'
        ? `It is time to take ${reminder.drug_name}.`
        : GENERIC_PHRASE;
  }
  return { title: 'Medication reminder', body, data };
}

async function markReminded(scheduleId, at) {
  await pool.execute(
    `UPDATE medication_schedules SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL`,
    [at, scheduleId]
  );
}

async function clearStaleToken(patientId, token) {
  await pool.execute(`UPDATE patients SET fcm_token = NULL WHERE id = ? AND fcm_token = ?`, [
    patientId,
    token,
  ]);
}

export async function dispatchReminders(now = new Date()) {
  const doses = await dueReminders(now);
  const summary = { due: doses.length, sent: 0, no_token: 0, skipped: 0, stale: 0 };
  for (const dose of doses) {
    await createPatientNotification({
      patientId: dose.patient_id,
      type: 'dose_reminder',
      eventKey: `dose-reminder:${dose.schedule_id}`,
      medicineName: dose.drug_name,
      metadata: { schedule_id: dose.schedule_id },
    });
    if (dose.fcm_token) {
      const result = await sendPush(dose.fcm_token, buildReminderPayload(dose));
      if (result.ok) summary.sent++;
      else if (result.stale) {
        summary.stale++;
        await clearStaleToken(dose.patient_id, dose.fcm_token);
      } else summary.skipped++;
    } else {
      summary.no_token++;
    }
    await markReminded(dose.schedule_id, now);
  }
  return summary;
}
