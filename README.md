# PharMate

A community-based telepharmacy platform whose foregrounded innovation is a
**deterministic, auditable, rules-based schedule suggestion engine (no AI/ML)**.

See [`PharMate_Development_Plan.md`](./PharMate_Development_Plan.md) for the full
sprint-ready development plan, scope, and constraints.

## Inquiry privacy

Ask Your Pharmacist stores inquiry subjects and messages centrally in MySQL.
The optional feature requires the patient's explicit, versioned consent;
withdrawing consent stops new inquiries and messages without deleting existing
history. A patient code is pseudonymous, and free text may identify its author.
Local conversation labels are separate from the server-stored transcripts.

The application policy at `/privacy#inquiries` matches the
[inquiry privacy contract](docs/INQUIRY_PRIVACY_POLICY.md). The
[paper amendment](docs/PAPER_INQUIRY_PRIVACY_AMENDMENT.md) supplies replacement
methodology, consent, and limitations text; the original manuscript is not
present in this repository. Do not describe this implementation as device-only
history, anonymous messaging, or automatic deletion on completion.

## Stack

- **Frontend:** React + Bootstrap (Vite) — PWA for pharmacist/admin/caregiver,
  Capacitor sideloaded APK for patients (Android 8.0+ / minSdk 26)
- **Backend:** Node.js + Express
- **Database:** MySQL 8
- **Reminders:** FCM + Capacitor Local Notifications (two-layer)

## Repository layout

```
pharmate/
├── client/    ← React frontend (Vite)
├── server/    ← Node/Express backend
└── README.md
```

## Getting started

### Client

```bash
cd client
npm install
npm run dev
```

### Server

```bash
cd server
npm install
npm run dev
```
