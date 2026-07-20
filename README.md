# PharMate

A community-based telepharmacy platform whose foregrounded innovation is a
**deterministic, auditable, rules-based schedule suggestion engine (no AI/ML)**.

See [`PharMate_Development_Plan.md`](./PharMate_Development_Plan.md) for the full
sprint-ready development plan, scope, and constraints.

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
