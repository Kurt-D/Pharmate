/**
 * Reminder dispatch (feature #4) — the server half of the two-layer mechanism.
 *
 * A cron tick calls dispatchReminders() every minute. It finds confirmed doses
 * coming due that haven't been reminded yet, pushes an FCM notification to the
 * patient's registered device, and stamps the dose so it's never reminded twice
 * (idempotent — see migration 008's reminder_sent_at).
 *
 * The ONLINE push is best-effort: if the patient has no device token or FCM is
 * unconfigured, the device's Capacitor local-notification fallback (scheduled at
 * confirm time from the same plan) still fires offline. So every due dose is
 * stamped once regardless of send outcome — the online layer never blocks and
 * never retries; the offline layer is the guarantee.
 *
 * Timezone discipline: scheduled_time is an absolute instant (read back as a Date
 * via the +08:00 pool), so the window is computed against the JS clock — never
 * SQL NOW(), which would be 8h off on a UTC server. Mirrors services/doses.js.
 */
import { pool } from '../db/connection.js';
import { sendPush } from './notifications.js';

// Fire a reminder from its due time up to LEAD_MIN early, and still catch a dose
// whose time slipped past within GRACE_MIN (e.g. the job was delayed). GRACE_MIN
// stays well under the 30-minute missed-sweep so a dose is reminded before it can
// be marked missed.
const LEAD_MIN = 1;
const GRACE_MIN = 15;

/**
 * Confirmed, not-yet-reminded doses whose time falls in [now-grace, now+lead].
 * PRN slots carry no fixed time to remind against and are excluded.
 */
export async function dueReminders(
  now = new Date(),
  { leadMin = LEAD_MIN, graceMin = GRACE_MIN } = {}
) {
  const from = new Date(now.getTime() - graceMin * 60000);
  const to = new Date(now.getTime() + leadMin * 60000);
  const [rows] = await pool.execute(
    `SELECT ms.id AS schedule_id, ms.patient_id, ms.scheduled_time,
            m.drug_name_raw AS drug_name,
            p.fcm_token, p.patient_code
     FROM medication_schedules ms
     JOIN medications m ON m.id = ms.medication_id
     JOIN patients p    ON p.id = ms.patient_id
     WHERE ms.status = 'scheduled'
       AND ms.reminder_sent_at IS NULL
       AND ms.is_prn_slot = 0
       AND ms.scheduled_time >= ?
       AND ms.scheduled_time <= ?
     ORDER BY ms.scheduled_time ASC`,
    [from, to]
  );
  return rows;
}

/** 'HH:MM' (Asia/Manila) label for a due-dose instant, for the notification body. */
function manilaClock(date) {
  const d = new Date(new Date(date).getTime() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Stamp a dose as reminded so the next scan skips it (idempotent dispatch). */
async function markReminded(scheduleId, at) {
  await pool.execute(
    `UPDATE medication_schedules SET reminder_sent_at = ? WHERE id = ? AND reminder_sent_at IS NULL`,
    [at, scheduleId]
  );
}

/** Drop a device token FCM reported as unregistered/invalid. */
async function clearStaleToken(patientId, token) {
  await pool.execute(`UPDATE patients SET fcm_token = NULL WHERE id = ? AND fcm_token = ?`, [
    patientId,
    token,
  ]);
}

/**
 * Send reminders for every due dose. Returns a summary for logging/tests.
 * @returns {Promise<{due:number, sent:number, no_token:number, skipped:number, stale:number}>}
 */
export async function dispatchReminders(now = new Date()) {
  const doses = await dueReminders(now);
  const summary = { due: doses.length, sent: 0, no_token: 0, skipped: 0, stale: 0 };

  for (const d of doses) {
    if (d.fcm_token) {
      const res = await sendPush(d.fcm_token, {
        title: 'Time for your medicine',
        body: `${d.drug_name} — ${manilaClock(d.scheduled_time)}`,
        data: { type: 'dose_reminder', schedule_id: d.schedule_id },
      });
      if (res.ok) summary.sent++;
      else if (res.stale) {
        summary.stale++;
        await clearStaleToken(d.patient_id, d.fcm_token);
      } else summary.skipped++;
    } else {
      // No online token: the device's local-notification fallback covers this.
      summary.no_token++;
    }
    // Stamp once regardless of online outcome — the offline layer is the guarantee.
    await markReminded(d.schedule_id, now);
  }

  return summary;
}
