/**
 * Cron dispatcher (feature #4) — the long-awaited node-cron bootstrap the sweep
 * and purge jobs referenced. Starts the periodic pipeline in a running server:
 *
 *   every minute      → dispatchReminders()  push due-dose reminders (online layer)
 *   every 5 minutes   → sweepMissed()        mark >30-min-overdue doses missed (D-C)
 *   daily 03:15 Manila→ purge retained read notifications and prescription photos
 *
 * Ticks are serialized per job (a slow run skips its next overlap) and never
 * throw out — a failure is logged and the next tick tries again. Disable entirely
 * with CRON_ENABLED=false (e.g. when running a separate worker process).
 */
import cron from 'node-cron';
import { dispatchReminders } from '../services/reminders.js';
import { pushConfigured } from '../services/notifications.js';
import { sweepMissed } from '../services/doses.js';
import { purgeExpiredPhotos } from '../services/prescription.js';
import { purgeReadNotifications } from '../services/patientNotifications.js';

const MANILA_TZ = 'Asia/Manila';

/** Wrap a job so overlapping ticks are skipped and errors never escape the timer. */
function guard(name, fn) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (err) {
      console.error(`[cron:${name}] failed:`, err.message);
    } finally {
      running = false;
    }
  };
}

export function startScheduler() {
  if (process.env.CRON_ENABLED === 'false') {
    console.log('[cron] disabled (CRON_ENABLED=false)');
    return [];
  }

  console.log(
    `[cron] starting — reminders every minute (FCM ${pushConfigured() ? 'on' : 'off, local-only'}), ` +
      `missed-sweep every 5 min`
  );

  const tasks = [
    cron.schedule(
      '* * * * *',
      guard('reminders', async () => {
        const s = await dispatchReminders();
        if (s.due > 0) {
          console.log(
            `[cron:reminders] due=${s.due} sent=${s.sent} no_token=${s.no_token} stale=${s.stale} skipped=${s.skipped}`
          );
        }
      })
    ),
    cron.schedule(
      '*/5 * * * *',
      guard('sweep-missed', async () => {
        const n = await sweepMissed();
        if (n > 0) console.log(`[cron:sweep-missed] marked ${n} dose(s) missed`);
      })
    ),
    cron.schedule(
      '15 3 * * *',
      guard('purge-retained-data', async () => {
        await purgeExpiredPhotos();
        await purgeReadNotifications();
      }),
      {
        timezone: MANILA_TZ,
      }
    ),
  ];

  return tasks;
}
