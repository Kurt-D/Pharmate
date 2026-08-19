# Patient notification inbox API

All endpoints require a valid patient access token. Notification objects never include the
internal patient ID.

## Endpoints

`GET /api/patient/notifications?limit=20&cursor=...&type=dose_reminder&unread_only=true`

Returns newest first:

```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "dose_reminder",
      "title": "Medication reminder",
      "message": "It is time to take your medicine.",
      "metadata": { "schedule_id": "uuid" },
      "created_at": "2026-08-18T12:00:00.000Z",
      "read_at": null
    }
  ],
  "pagination": { "limit": 20, "has_more": false, "next_cursor": null },
  "unread_count": 1
}
```

`limit` defaults to 20 and must be 1–100. `cursor` is opaque and must be returned unchanged.
`type` accepts one of the event types below. `unread_only` accepts only `true` or `false`.

`GET /api/patient/notifications/unread-count` returns `{ "unread_count": 1 }`.

`PATCH /api/patient/notifications/:id/read` returns the updated notification. Repeating it is
safe and returns the original `read_at`. A missing or another patient's ID returns 404.

`POST /api/patient/notifications/read-all` returns `{ "marked_read": 3 }` and affects only the
authenticated patient.

## Backend event contract

Supported types are `dose_reminder`, `dose_missed`, `schedule_confirmed`, `schedule_changed`,
`prescription_approved`, `prescription_rejected`, and `prescription_needs_clearer`.

Every producer supplies a stable `event_key`; the database uniquely indexes it, so retries do
not create duplicates. Metadata is backend-generated and allowlisted to `schedule_id`,
`schedule_version`, `medication_id`, and `prescription_id`. It never contains medicine names,
images, addresses, conditions, tokens, free-form decision reasons, or other PII. Medicine names
may appear in the message only when `lock_screen_detail` is explicitly `medicine_name`.

Read notifications are retained for 90 days by default and purged daily. The server setting is
`NOTIFICATION_RETENTION_DAYS`; unread notifications are not age-purged.
