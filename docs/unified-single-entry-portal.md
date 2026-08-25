# Unified single-entry portal

PharMate exposes one login page at `/login` and one credential endpoint at
`POST /api/auth/login`. The API verifies the account and returns the access
token, rotating refresh token, profile, and database-backed role. The client
uses `client/src/config/roleRoutes.js` to redirect that verified role:

- patient: `/patient/today`
- caregiver: `/caregiver/overview`
- pharmacist: `/pharmacist/verification-queue`
- admin: `/admin/dashboard`

`ProtectedRoute` prevents cross-role navigation in React. Every server router
also applies `requireAuth` and `requireRole`, which is the authoritative access
control boundary.

Patient and caregiver experiences retain their centered mobile shells and
labeled bottom navigation. Pharmacist and admin routes retain full-width
desktop workspaces and side navigation in the same React application.

## Caregiver pairing

1. The patient calls `POST /api/patient/caregiver-link-code`.
2. The server revokes older unused codes and returns one formatted code such as
   `K7M-9Q2`. It is single-use and expires in 15 minutes.
3. Only an HMAC-SHA-256 digest is stored in `invite_codes`.
4. The caregiver chooses a relationship and submits the code to
   `POST /api/caregiver/link`.
5. A database transaction locks and claims the invite, records the relationship,
   restores or creates the link, and writes an audit event.
6. `GET /api/caregiver/events` maintains an authenticated server-sent event
   stream. Linking and dose-status changes refresh the caregiver dashboard.

For horizontally scaled deployments, replace the in-process event fan-out with
Redis Pub/Sub while keeping the same SSE endpoint and client contract.
