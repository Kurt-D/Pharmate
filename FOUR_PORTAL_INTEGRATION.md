# PharMate four-portal integration matrix

All routes below require the existing JWT middleware. Socket.IO rooms are derived
from the authenticated database user; clients cannot select another identity.

| Portal | Screen | Control | API / event | Server permission | Persisted result |
|---|---|---|---|---|---|
| Patient | Medications | Add verified medicine | `POST /api/patient/medications`, `MEDICATION_CREATED` | Own patient record | `medications`, audit event, caregiver notification |
| Patient | Automated schedule | Generate / save | `POST /api/medications/generate-schedule`, `POST /api/medications/save-reminders`, `SCHEDULE_CONFIRMED` | Own patient record; verified formulary rules | `medications`, `medication_schedules`, audit event |
| Patient | Today | Taken / late / snooze | `POST /api/patient/doses/:id/log`, `DOSE_STATUS_CHANGED`, `ADHERENCE_UPDATED` | Schedule belongs to patient; idempotency enforced | dose log, schedule status, streak and alerts |
| Patient | Profile | Create caregiver code | `POST /api/patient/invite` | Own patient record | Hashed, expiring, single-use invite |
| Patient | Profile | Approve / reject caregiver | `POST /api/patient/caregiver-requests/:id/decision`, `CAREGIVER_LINK_UPDATED` | Pending request belongs to patient | Link status, link audit, portal notification |
| Patient | Profile | Medication permission / revoke | `PATCH /api/patient/caregivers/:id/permissions`, `DELETE /api/patient/caregivers/:id` | Active link belongs to patient | Permission or revoked status, audit event |
| Caregiver | Connect | Submit patient code | `POST /api/caregiver/link`, `CAREGIVER_LINK_UPDATED` | Signed-in caregiver; valid unused invite | Pending request awaiting patient decision |
| Caregiver | Dashboard | View adherence | `GET /api/caregiver/patients/:code/today`, `DOSE_STATUS_CHANGED` | Active caregiver link | Live patient schedule state, no mock fallback |
| Caregiver | Medication | Add / edit / stop / schedule | Caregiver medication and schedule routes, medication events | Active link plus `can_manage_medications` | Same patient medication and schedule tables |
| Caregiver | Orders / inquiry | Submit request | Caregiver refill, delivery, inquiry routes | Active caregiver link | Shared order or inquiry record |
| Pharmacist | Dashboard | Open clinical queue | `GET /api/pharmacist/summary` plus domain events | Pharmacist role | Live database counts; no sample patients or counters |
| Pharmacist | Validation | Claim / decide prescription | Pharmacist validation routes, `PRESCRIPTION_STATUS_CHANGED` | Pharmacist role and validation claim rules | Decision, patient medication state, audit event |
| Pharmacist | Inquiries | Accept / reply / close | Pharmacist inquiry routes, `INQUIRY_UPDATED` | Assigned pharmacist | Shared thread and message history, audit event |
| Pharmacist | Orders | Change status | `POST /api/pharmacist/orders/:kind/:id/status`, `ORDER_STATUS_CHANGED` | Pharmacist role; valid status | Shared order status, patient/caregiver notification |
| Pharmacist | Formulary | Curate request | `POST /api/pharmacist/pending-drugs/:id/curate`, `FORMULARY_UPDATED` | Pharmacist role | Verified formulary resolution |
| Admin | Users | Activate / deactivate | `PUT /api/admin/users/:id/active`, `ACCOUNT_STATUS_CHANGED` | Admin role | User status and audit event |
| Admin | Medicines | Create / edit / availability / delete | Admin medicine routes, `FORMULARY_UPDATED` | Admin role; in-use medicines cannot be deleted | Shared formulary and inventory, audit event |
| Admin | Orders | Advance fulfilment status | `POST /api/admin/orders/:kind/:id/status`, `ORDER_STATUS_CHANGED` | Admin role; transition allow-list | Shared order status and audit event |
| Admin | Alerts | Review operations | `GET /api/admin/alerts` | Admin role | Database-backed operational view |
| Admin | Security | Review audit activity | `GET /api/admin/audit-events` | Admin role | Privacy-safe immutable activity feed |
| All roles | Notification bell | List / read one / read all | `/api/notifications`, `NOTIFICATION_CREATED` | Notification `user_id` must equal JWT subject | MySQL unread state and action navigation |

## Reliability and privacy contract

- Socket.IO is the primary live transport; the existing SSE, focus refetch, and
  polling paths remain as recovery fallbacks.
- Events are published after successful writes and contain identifiers or status
  only. Protected details are fetched again through authorized REST routes.
- Caregiver patient rooms are granted only for active links loaded from MySQL.
- Patient names, diagnoses, password material, reset credentials, and prescription
  files are not included in cross-portal event payloads.
