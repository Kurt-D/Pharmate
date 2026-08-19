# Patient-controlled caregiver linking API

All endpoints require `Authorization: Bearer <access token>`. Patient endpoints
return `403` to non-patients; caregiver endpoints return `403` to non-caregivers.
Dates are JSON ISO-8601 timestamps.

## Patient endpoints

### `POST /api/patient/invite`

Creates a cryptographically random, single-use invite that expires after 24
hours. Response `201`:

```json
{ "id": "invite-uuid", "code": "one-time-secret", "expires_at": "timestamp" }
```

Show or share `code` immediately. The server stores only its SHA-256 hash, so it
cannot be retrieved later. Creating another invite does not revoke earlier ones.

### `GET /api/patient/invites`

Lists only this patient's unused, unrevoked, unexpired invites. The raw code is
intentionally absent. Response `200`:

```json
[{ "id": "invite-uuid", "created_at": "timestamp", "expires_at": "timestamp", "status": "active" }]
```

### `DELETE /api/patient/invites/:id`

Revokes this patient's unused invite immediately. Returns `204`, or `404` when
the invite does not exist, is no longer revocable, or belongs to another patient.

### `GET /api/patient/caregivers`

Lists active links only. Response `200`:

```json
[{ "id": "link-uuid", "email": "caregiver@example.com", "linked_at": "timestamp", "status": "active" }]
```

### `DELETE /api/patient/caregivers/:linkId`

Revokes this patient's active caregiver link immediately. Returns `204`, or
`404` when the link is absent, already revoked, or owned by another patient.

## Caregiver redemption

### `POST /api/caregiver/link`

Body: `{ "code": "one-time-secret" }`. Returns `201` with
`{ "message": "Linked to patient" }`. It never returns an internal patient ID.
Invalid or revoked codes return `404`, expired codes return `410`, and used codes
or an already-active link return `409`. Redemption locks and conditionally
claims the invite in one database transaction, so only one concurrent request
can succeed.

Revoked links are retained for audit history but disappear from ordinary
caregiver APIs. Revocation immediately blocks patient listing, medicines,
orders, refills, deliveries, inquiries, existing alerts, and future alerts.
