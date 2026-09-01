/**
 * Push-notification transport — the ONLINE layer of the two-layer reminder
 * mechanism (feature #4). Wraps Firebase Cloud Messaging.
 *
 * Design constraints:
 *   - NEVER throws to the caller. Reminder dispatch must not crash because a
 *     device token is stale or FCM is unreachable; every failure is a value.
 *   - Degrades gracefully when unconfigured. Local dev and CI have no service
 *     account, so `send()` returns { ok:false, skipped:'not_configured' } and
 *     the dispatcher simply relies on the device's local-notification fallback.
 *
 * Configuration (any one enables FCM):
 *   FCM_SERVICE_ACCOUNT           inline service-account JSON
 *   FCM_SERVICE_ACCOUNT_KEY_PATH  path to a service-account JSON file
 *   GOOGLE_APPLICATION_CREDENTIALS  (firebase-admin picks this up natively)
 */
import fs from 'node:fs';

let messagingPromise; // memoized init; undefined until first send()

/**
 * Resolve firebase-admin's messaging(), or null when unconfigured. Memoized so a
 * misconfiguration is logged once, not on every dose. Dynamic import keeps the
 * heavy dependency out of the hot path when FCM is off.
 */
async function getMessaging() {
  if (messagingPromise !== undefined) return messagingPromise;

  messagingPromise = (async () => {
    const inline = process.env.FCM_SERVICE_ACCOUNT;
    const filePath = process.env.FCM_SERVICE_ACCOUNT_KEY_PATH;
    const adc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!inline && !filePath && !adc) return null; // not configured — silent

    try {
      const [appModule, messagingModule] = await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/messaging'),
      ]);
      const { applicationDefault, cert, getApps, initializeApp } = appModule;
      const { getMessaging: getFirebaseMessaging } = messagingModule;

      let app = getApps()[0];
      if (!app) {
        let credential;
        if (inline) {
          credential = cert(JSON.parse(inline));
        } else if (filePath) {
          credential = cert(JSON.parse(fs.readFileSync(filePath, 'utf8')));
        } else {
          credential = applicationDefault();
        }
        app = initializeApp({ credential });
      }
      return getFirebaseMessaging(app);
    } catch (err) {
      console.error('[notifications] FCM init failed, disabling push:', err.message);
      return null;
    }
  })();

  return messagingPromise;
}

/** True when a service account is configured (used by the dispatcher for logging). */
export function pushConfigured() {
  return Boolean(
    process.env.FCM_SERVICE_ACCOUNT ||
    process.env.FCM_SERVICE_ACCOUNT_KEY_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

/**
 * Send one data+notification push to a device token.
 * @returns {Promise<{ok:boolean, skipped?:string, error?:string, stale?:boolean}>}
 *   stale=true marks an unregistered/invalid token the caller should clear.
 */
export async function sendPush(token, { title, body, data = {}, highPriority = false } = {}) {
  if (!token) return { ok: false, skipped: 'no_token' };

  const messaging = await getMessaging();
  if (!messaging) return { ok: false, skipped: 'not_configured' };

  try {
    // Data values must be strings for FCM.
    const strData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
    const message = { token, notification: { title, body }, data: strData };
    if (highPriority) {
      message.android = {
        priority: 'high',
        notification: { priority: 'high', defaultSound: true },
      };
      message.apns = { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } };
    }
    await messaging.send(message);
    return { ok: true };
  } catch (err) {
    // messaging/registration-token-not-registered → the app was uninstalled or
    // the token rotated; tell the caller so it can drop the dead token.
    const stale =
      err.code === 'messaging/registration-token-not-registered' ||
      err.code === 'messaging/invalid-registration-token';
    return { ok: false, error: err.message, stale };
  }
}

/**
 * Validate the FCM credential end-to-end WITHOUT a real device — a dry-run send
 * to a throwaway token. Google authenticates the service account first (proving
 * the credential is good) and only then rejects the bogus token, so any
 * `messaging/*` error means we got past auth → creds work. An auth/credential
 * error (or anything not under `messaging/`) means the service account is bad.
 * Diagnostic only; sends nothing to anyone.
 * @returns {Promise<{ok:boolean, reason?:string, projectId?:string}>}
 */
export async function validateCredential() {
  const messaging = await getMessaging();
  if (!messaging) return { ok: false, reason: 'not_configured' };
  try {
    await messaging.send(
      { token: 'pharmate-credential-probe', notification: { title: 't', body: 'b' } },
      true // dryRun — validate only, deliver nothing
    );
    return { ok: true }; // (unexpected: a bogus token shouldn't validate)
  } catch (err) {
    const code = err.code || '';
    if (code.startsWith('messaging/')) {
      return { ok: true, projectId: messaging.app.options.projectId };
    }
    return { ok: false, reason: code || err.message };
  }
}

/** Reset memoized state — test seam only. */
export function _resetForTest() {
  messagingPromise = undefined;
}
