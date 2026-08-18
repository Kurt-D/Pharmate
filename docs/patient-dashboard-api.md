# Patient dashboard API

## `GET /api/patient/dashboard`

Returns a medication summary for the authenticated patient. Send the patient's access token as
`Authorization: Bearer <access-token>`. Missing authentication returns `401`; an authenticated
non-patient role returns `403`. The patient id is taken only from the verified token, so callers
cannot request another patient's dashboard.

All calendar windows use `Asia/Manila`. `today` covers the current Manila calendar day.
`seven_days` covers today and the previous six Manila calendar days. A dose becomes eligible when
its scheduled time arrives. Future doses can appear in `next_dose` and `upcoming_doses`, but never
lower adherence.

Successful response (`200`):

```json
{
  "next_dose": {
    "schedule_id": "uuid",
    "medicine_name": "Paracetamol",
    "dosage_instruction": "Take one tablet with food",
    "scheduled_time": "2026-08-18T12:00:00.000Z",
    "status": "scheduled"
  },
  "upcoming_doses": [],
  "today": {
    "eligible_doses": 2,
    "taken": 1,
    "taken_late": 0,
    "missed": 1,
    "adherence_percentage": 50
  },
  "seven_days": {
    "eligible_doses": 8,
    "taken": 5,
    "taken_late": 1,
    "missed": 2,
    "adherence_percentage": 75
  },
  "current_dose_streak": 3,
  "generated_at": "2026-08-18T10:30:00.000Z",
  "timezone": "Asia/Manila"
}
```

- `next_dose` is the earliest future scheduled/snoozed dose, or `null`.
- `upcoming_doses` contains the next zero to three future doses in chronological order.
- `adherence_percentage` is `(taken + taken_late) / eligible_doses * 100`, or `null` when
  `eligible_doses` is zero.
- `current_dose_streak` counts consecutive arrived doses with `taken` or `taken_late` status,
  working backward from the most recent arrived dose. A non-taken arrived dose breaks the streak.
- Dose objects intentionally contain only scheduling information. Patient names, conditions,
  addresses, and contact details are never returned.
