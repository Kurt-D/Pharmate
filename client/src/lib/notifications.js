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

function preferredSpeechVoice(voices, accessibility) {
  const languagePattern =
    accessibility.speechLanguage === 'fil' ? /^(fil|tl)(-|_)/i : /^en(-|_)/i;
  const languageVoices = voices.filter((voice) => languagePattern.test(voice.lang));
  const choices = languageVoices.length ? languageVoices : voices;
  const selected = accessibility.speechVoice || 'female-1';
  const wantsMale = selected.startsWith('male');
  const genderPattern = wantsMale
    ? /\bmale\b|david|mark|james|daniel|george|ryan|guy|alex/i
    : /\bfemale\b|zira|samantha|aria|jenny|susan|hazel|serena|ava|maria/i;
  const matching = choices.filter((voice) => genderPattern.test(voice.name));
  const voiceIndex = selected.endsWith('-2') ? 1 : 0;
  return matching[voiceIndex] || matching[0] || choices[voiceIndex] || choices[0] || null;
}

/** Deterministic 31-bit int id from a schedule UUID (LocalNotifications need int ids). */
function notifId(scheduleId) {
  let h = 0;
  for (let i = 0; i < scheduleId.length; i++) h = (Math.imul(31, h) + scheduleId.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

/**
 * Speak text aloud (voice prompt). Returns false where speech is unavailable.
 * Optional lifecycle callbacks let reminder UIs stay in sync with the actual
 * utterance instead of playing a decorative animation on their own timer.
 */
export function speak(text, { onStart, onEnd, onError } = {}) {
  try {
    let accessibility = {};
    try {
      accessibility = JSON.parse(localStorage.getItem('pm_senior_accessibility') || '{}');
    } catch {
      accessibility = {};
    }
    if (accessibility.ttsEnabled === false) {
      onError?.();
      return false;
    }
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) {
      onError?.();
      return false;
    }
    // Message templates and medicine names can meet at a word boundary. Normalize
    // repeated words before they reach the speech engine (for example, "your your").
    const spokenText = String(text)
      .replace(/\b(your|the|a|an)\s+\1\b/gi, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const u = new SpeechSynthesisUtterance(spokenText);
    // A measured pace, neutral pitch, and full volume make medicine prompts
    // easier to understand for older adults without sounding robotic.
    u.rate =
      accessibility.speechRate === 'veryFast'
        ? 1.4
        : accessibility.speechRate === 'fast'
        ? 1.2
        : accessibility.speechRate === 'normal'
          ? 1
          : 0.75;
    u.pitch = 0.95;
    u.volume = 1;
    u.lang = accessibility.speechLanguage === 'fil' ? 'fil-PH' : 'en-US';
    u.onstart = () => onStart?.();
    u.onend = () => onEnd?.();
    u.onerror = () => onError?.();
    const play = () => {
      const preferredVoice = preferredSpeechVoice(
        window.speechSynthesis.getVoices(),
        accessibility
      );
      if (preferredVoice) u.voice = preferredVoice;
      window.speechSynthesis.cancel(); // never stack utterances
      window.speechSynthesis.speak(u);
    };
    // Some browsers load the installed voices a moment after the page. Waiting
    // briefly means Filipino prompts can use the actual Filipino device voice
    // instead of being spoken immediately by the English fallback voice.
    if (window.speechSynthesis.getVoices().length === 0) {
      window.setTimeout(play, 180);
    } else {
      play();
    }
    return true;
  } catch {
    onError?.();
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
 * Schedule caregiver-facing dose alerts on the native device. These alerts are
 * stored by Android/iOS, so they can appear even after PharMate is closed.
 * Patient reminders are left untouched; only prior caregiver alerts are replaced.
 */
export async function scheduleCaregiverDoseAlerts(doses = [], patientLabel = 'Linked patient') {
  if (!isNative) return { supported: false, scheduled: 0 };
  if (!(await ensurePermission())) return { supported: true, permission: false, scheduled: 0 };
  const now = Date.now();
  const upcoming = doses.filter(
    (dose) =>
      dose.status === 'upcoming' &&
      dose.scheduledTime &&
      new Date(dose.scheduledTime).getTime() > now
  );
  try {
    const pending = await LocalNotifications.getPending();
    const caregiverAlerts = pending.notifications.filter(
      (notification) => notification.extra?.type === 'caregiver_dose_alert'
    );
    if (caregiverAlerts.length) {
      await LocalNotifications.cancel({
        notifications: caregiverAlerts.map((notification) => ({ id: notification.id })),
      });
    }
    if (upcoming.length) {
      await LocalNotifications.schedule({
        notifications: upcoming.map((dose) => ({
          id: notifId(`caregiver:${dose.id}`),
          title: `${patientLabel} has a dose due`,
          body: `${dose.medicine} is scheduled now. Open PharMate to send a reminder.`,
          schedule: { at: new Date(dose.scheduledTime), allowWhileIdle: true },
          extra: {
            type: 'caregiver_dose_alert',
            schedule_id: dose.id,
            drug_name: dose.medicine,
          },
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
