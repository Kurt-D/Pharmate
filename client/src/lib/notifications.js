/**
 * Dose reminders — client side of the two-layer mechanism (feature #4).
 *
 * Layer 2 (offline fallback): Capacitor Local Notifications. From the confirmed
 * plan the device schedules its own notifications, so reminders fire even with no
 * network and no server — the guarantee the online FCM push (layer 1) rides on
 * top of. Only runs on the native APK; on web it degrades to a no-op.
 *
 * Voice prompt: the Web Speech API (speechSynthesis) speaks the medicine name
 * when a reminder arrives while the app is open. This works in the browser AND
 * the Android WebView, so it's the one piece verifiable outside a device.
 *
 * Everything here is defensive: a missing plugin, denied permission, or a browser
 * without speech must never throw into the calling page.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';

const isNative = Capacitor.isNativePlatform();

/** Deterministic 31-bit int id from a schedule UUID (LocalNotifications need int ids). */
function notifId(scheduleId) {
  let h = 0;
  for (let i = 0; i < scheduleId.length; i++) h = (Math.imul(31, h) + scheduleId.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

/** Speak text aloud (voice prompt). Returns false where speech is unavailable. */
export function speak(text) {
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; // a touch slower — senior-accessible
    window.speechSynthesis.cancel(); // never stack utterances
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

/** True once we can post local notifications on the device. */
export async function ensurePermission() {
  if (!isNative) return false;
  try {
    const p = await LocalNotifications.checkPermissions();
    if (p.display === 'granted') return true;
    const r = await LocalNotifications.requestPermissions();
    return r.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * (Re)schedule local notifications for the patient's upcoming confirmed doses.
 * Replaces any previously scheduled set so a re-confirmed plan doesn't double-fire.
 * @param {Array<{schedule_id:string, drug_name:string, scheduled_time:string, status:string}>} doses
 */
export async function scheduleDoseReminders(doses = []) {
  if (!isNative) return { supported: false, scheduled: 0 };
  if (!(await ensurePermission())) return { supported: true, permission: false, scheduled: 0 };

  const now = Date.now();
  const upcoming = doses.filter(
    (d) => d.status === 'scheduled' && new Date(d.scheduled_time).getTime() > now
  );

  try {
    // Clear our previously-scheduled notifications first (avoid duplicates).
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
    if (upcoming.length) {
      await LocalNotifications.schedule({
        notifications: upcoming.map((d) => ({
          id: notifId(d.schedule_id),
          title: 'Time for your medicine',
          body: d.drug_name,
          schedule: { at: new Date(d.scheduled_time) },
          extra: { type: 'dose_reminder', schedule_id: d.schedule_id, drug_name: d.drug_name },
        })),
      });
    }
    return { supported: true, permission: true, scheduled: upcoming.length };
  } catch {
    return { supported: true, permission: true, scheduled: 0, error: true };
  }
}

/**
 * Speak the medicine name when a scheduled notification fires with the app open
 * (foreground voice prompt). Returns an unsubscribe fn. No-op off-device.
 */
export async function initReminderVoice() {
  if (!isNative) return () => {};
  try {
    const handle = await LocalNotifications.addListener('localNotificationReceived', (n) => {
      const name = n?.extra?.drug_name;
      if (name) speak(`Time to take your ${name}`);
    });
    return () => handle.remove();
  } catch {
    return () => {};
  }
}

/**
 * Register this device's FCM token for online reminders (layer 1). The token
 * itself comes from the native push plugin; this just persists it server-side.
 */
export async function registerDeviceToken(token, api) {
  if (!token) return;
  try {
    await api('/api/patient/device-token', { method: 'PUT', body: { token } });
  } catch {
    /* best-effort — the local-notification fallback still covers reminders */
  }
}

/**
 * Register the device for ONLINE FCM push (layer 1). Requests permission, asks
 * the OS/FCM for this device's token, and persists it via registerDeviceToken so
 * the server dispatcher can reach it. No-op off-device. Safe to call on every
 * patient session — the token is idempotent server-side (one row per patient).
 */
export async function registerPush(api) {
  if (!isNative) return { supported: false };
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return { supported: true, permission: false };

    // Listeners must be attached before register() so the token isn't missed.
    await PushNotifications.removeAllListeners();
    PushNotifications.addListener('registration', (token) => {
      registerDeviceToken(token.value, api);
    });
    PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] registration failed', err?.error ?? err);
    });
    await PushNotifications.register();
    return { supported: true, permission: true };
  } catch (e) {
    return { supported: true, error: String(e) };
  }
}
