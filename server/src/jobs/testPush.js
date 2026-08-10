/**
 * FCM test-push CLI (feature #4 — the online layer's manual proof).
 *
 *   npm run push:test              → validate the service-account credential
 *                                    (dry-run, sends nothing; confirms the server
 *                                    can authenticate to FCM).
 *   npm run push:test -- <token>   → send a real push to that device FCM token
 *                                    (the Sprint-1 exit-gate: one push on a phone).
 *
 * Get <token> from the app: the patient logs in on the APK, which registers its
 * FCM token via PUT /api/patient/device-token — read it from the patients table.
 */
import 'dotenv/config';
import { pushConfigured, validateCredential, sendPush } from '../services/notifications.js';

const token = process.argv[2];

if (!pushConfigured()) {
  console.error(
    'FCM is not configured. Set FCM_SERVICE_ACCOUNT_KEY_PATH in server/.env to your ' +
      'service-account JSON (e.g. ./firebase-service-account.json).'
  );
  process.exit(1);
}

if (!token) {
  console.log('No token given — validating the service-account credential (dry run)…');
  const res = await validateCredential();
  if (res.ok) {
    console.log(`✅ FCM credential works. Project: ${res.projectId ?? '(unknown)'}`);
    console.log('   Server can authenticate to FCM. Provide a device token to send a real push:');
    console.log('   npm run push:test -- <device-fcm-token>');
    process.exit(0);
  }
  console.error(`❌ Credential check failed: ${res.reason}`);
  process.exit(1);
}

console.log(`Sending test push to token ${token.slice(0, 12)}…`);
const res = await sendPush(token, {
  title: 'PharMate',
  body: 'Test push — if you see this, online reminders work 🎉',
  data: { type: 'test' },
});
if (res.ok) {
  console.log('✅ Push sent. Check the device.');
  process.exit(0);
}
console.error('❌ Push failed:', res.error || res.skipped, res.stale ? '(token is stale)' : '');
process.exit(1);
