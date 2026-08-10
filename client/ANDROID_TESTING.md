# Testing PharMate on an Android phone (debug APK)

The web client is wrapped as a Capacitor Android app (`android/`). Everything is
pre-wired except the actual compile, which needs the Android SDK on this machine.

> **This is a local device-testing profile, not the pilot build.** The APK here
> talks to a dev PC over plain HTTP on the LAN. The production/pilot build
> (`npm run build`, deployed to the VPS behind Nginx + HTTPS) is completely
> separate: it leaves `VITE_API_BASE` unset and calls the API same-origin. Never
> ship the LAN/HTTP build as the pilot.

## What's already done (locally — `android/` and `.env.lantest` are gitignored)

- `android/` native project generated (`npx cap add android`).
- Backend URL supplied by a **dedicated device profile**, `.env.lantest`
  (`VITE_API_BASE=http://10.15.79.229:3000`), read only by `npm run build:device`
  — the production build never sees it.
- Plain-HTTP to the PC allowed for testing via
  [`network_security_config.xml`](android/app/src/main/res/xml/network_security_config.xml)
  (scoped to that IP + localhost; the rest of the app stays HTTPS-only).
- `POST_NOTIFICATIONS` permission added for on-device dose reminders (Android 13+).
- Device bundle built and synced (`npm run build:device && npx cap sync android`).

## One-time setup on this PC

1. **Install Android Studio** — https://developer.android.com/studio
   It brings the Android SDK **and** a compatible JDK 17 (the system Java here is
   18, which some Gradle plugins reject — Studio's bundled JDK avoids that). On
   first launch let it finish "SDK Components Setup".

## On your phone

2. Enable **Developer Options** (Settings → About phone → tap _Build number_ 7×),
   then turn on **USB debugging**. Connect the phone by USB and accept the
   "Allow USB debugging?" prompt.
3. Put the phone on the **same Wi-Fi** as this PC.

## Build & run

4. Start the backend so the app has an API to talk to:
   ```bash
   cd C:\Projects\Pharmate\server && npm run dev
   ```
   Allow **inbound port 3000** through Windows Firewall the first time (Windows
   will prompt, or add the rule manually). Confirm from the phone's browser:
   open `http://10.15.79.229:3000/api/health` — you should see a JSON response.
5. Open the Android project in Studio and press **Run ▶** with the phone selected:
   ```bash
   cd C:\Projects\Pharmate\client && npx cap open android
   ```
   Studio installs and launches the app on the phone. (First Gradle sync
   downloads dependencies — a few minutes.)

### Command-line alternative (once the SDK is installed)

```bash
cd C:\Projects\Pharmate\client\android && ./gradlew assembleDebug
```

APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`; install with
`adb install -r app-debug.apk`.

## When your PC's IP changes (new network)

The IP is compiled into the bundle, so re-point and rebuild:

1. Update `VITE_API_BASE` in `.env.lantest` **and** the `<domain>` in
   `network_security_config.xml`.
2. `npm run build:device && npx cap sync android`, then re-run from Studio.

## What works in this build

- Full app over the LAN (login, meds, schedule, doses, orders, inquiries…).
- **Offline dose reminders** — Capacitor local notifications from the confirmed
  plan; fire with no network.
- **Voice prompt** — speaks the medicine name when a reminder arrives.

**Not yet:** online FCM push (layer 1). That needs a Firebase project +
`google-services.json` + the push-notifications plugin — a follow-up. Until then
the on-device local notifications cover reminders.
