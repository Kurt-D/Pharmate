# Patient preferences and reminder payload

These backend-only endpoints let the signed-in patient control their own reminder, voice, and privacy choices. Both endpoints require a patient access token; caregivers and staff receive `403`.

## Endpoints

`GET /api/patient/preferences` returns the patient's complete preferences object.

`PUT /api/patient/preferences` accepts one or more fields and returns the complete updated object. It is a safe partial update: fields left out keep their current values. Unknown fields and loosely typed values such as `"true"` are rejected with `400`.

```json
{
  "reminders_enabled": true,
  "voice_enabled": true,
  "voice_detail": "private",
  "vibration_enabled": true,
  "reminder_lead_minutes": 0,
  "caregiver_missed_alerts_enabled": true,
  "lock_screen_detail": "private",
  "timezone": "Asia/Manila"
}
```

`voice_detail` and `lock_screen_detail` accept `private` or `medicine_name`. Lead time is an integer from 0 through 60. Timezone must be a supported IANA name, for example `Asia/Manila`, `Asia/Tokyo`, or `UTC`.

## Push reminder contract

The backend sends an FCM notification object plus string-converted data values. Conceptually, the payload is:

```json
{
  "title": "Medication reminder",
  "body": "It is time for your medicine.",
  "data": {
    "type": "dose_reminder",
    "schedule_id": "uuid",
    "scheduled_time": "2026-08-18T02:00:00.000Z",
    "local_time": "10:00",
    "timezone": "Asia/Manila",
    "vibration_enabled": true,
    "voice_enabled": true,
    "voice_text": "It is time for your medicine."
  }
}
```

- With private lock-screen detail, `body` is generic. With explicit `medicine_name` opt-in, it may name the medicine.
- With private voice detail, `voice_text` is generic. With explicit `medicine_name` opt-in, it may name the medicine.
- When voice is disabled, `voice_enabled` is false and `voice_text` is omitted.
- When reminders are disabled, the backend generates no push reminder.
- `reminder_lead_minutes` moves dispatch earlier by the chosen number of minutes.
- `vibration_enabled` is an instruction for the mobile app. The backend does not and cannot change physical alarm or media volume.
- `scheduled_time` is an absolute UTC timestamp; use `timezone`/`local_time` for patient-facing display.

The mobile app should treat missing fields conservatively and should never infer medicine-name consent from any setting other than the relevant explicit `medicine_name` value.
