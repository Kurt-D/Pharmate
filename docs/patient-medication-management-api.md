# Patient medication management API

All endpoints require `Authorization: Bearer <access token>` for a patient account. Resources belonging to another patient return `404`.

## Get one medication

`GET /api/patient/medications/:id` returns the patient's medication, including `updated_at`. Use that value for the next mutation.

## Edit an OTC medication

`PATCH /api/patient/medications/:id`

```json
{
  "expected_updated_at": "2026-08-18T13:00:00.123Z",
  "frequency": "BID",
  "dosage_instruction": "Take with food",
  "is_prn": false,
  "start_date": "2026-08-18",
  "end_date": "2026-08-25"
}
```

Fields are optional except `expected_updated_at`; at least one editable field is required. Dates use `YYYY-MM-DD`. Unsupported frequencies return `400`. Fields outside the allowlist return `400`. Prescription-source medication edits return `403` with a pharmacist-review explanation. A stale `expected_updated_at` returns `409`.

Timing changes return `schedule_reconfirmation_required: true`, invalidate only future unacted entries, and create a `schedule_changed` inbox notification. The frontend should fetch/propose the schedule and ask the patient to confirm it again.

## Stop or cancel

`POST /api/patient/medications/:id/stop`

```json
{ "expected_updated_at": "2026-08-18T13:00:00.123Z" }
```

Active medications become `completed`; pending medications become `cancelled`. Repeating the request returns `200` with `already_stopped: true`. Historical schedules and dose logs are preserved. Stale active/pending mutations return `409`.

## History

`GET /api/patient/medications/history?limit=20&event_type=updated&status=active&cursor=<opaque>`

`limit` is 1–100. Safe `event_type` values are `updated`, `stopped`, and `cancelled`; status values are `pending_validation`, `pending_drug`, `active`, `completed`, and `cancelled`. The response contains `history` and `pagination` (`limit`, `has_more`, `next_cursor`). Pass `next_cursor` unchanged to fetch the next page. Audit snapshots contain only editable scheduling fields and status—never images, PII, secrets, or prescription decision details.

The existing `GET /api/patient/medications` contract is unchanged.
