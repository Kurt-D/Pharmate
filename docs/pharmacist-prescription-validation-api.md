# Pharmacist prescription validation API

All endpoints require a pharmacist bearer token. Patients, caregivers, and administrators receive `403`.

The claim lease defaults to 15 minutes and is configured server-side with `VALIDATION_CLAIM_LEASE_MINUTES` (1–1440). Lease timestamps are UTC ISO date-times in JSON.

## Validation queue

`GET /api/pharmacist/validations`

Returns pending validations that are either unclaimed, expired, or claimed by the authenticated pharmacist. Items actively claimed by another pharmacist are omitted. Each item includes the pseudonymous `patient_code`, medication review fields, and:

- `claim_status`: `unclaimed` or `claimed_by_you`
- `claim_expires_at`: lease expiry for the caller's claim, otherwise `null`

No pharmacist identity or patient PII is returned.

## Claim

`POST /api/pharmacist/validations/:id/claim`

Atomically acquires an available validation. A repeated owner request returns `200` with `idempotent: true` and does not extend the lease. An active competing claim returns `409` with a generic availability message. An expired claim can be acquired by another pharmacist.

Successful response:

```json
{
  "claim_status": "claimed_by_you",
  "claim_expires_at": "2026-08-18T14:15:00.000Z",
  "idempotent": false
}
```

## Release claim

`DELETE /api/pharmacist/validations/:id/claim`

Only the owner of an active lease can release it. Success returns `{ "claim_status": "unclaimed" }`. Non-owner, unclaimed, or expired cases return the generic `409` availability response.

## Retrieve redacted photo

`GET /api/pharmacist/validations/:id/photo`

Only the active claim owner can retrieve the client-redacted image. A non-owner receives `409`; an unavailable, decided, purged, or unknown photo returns `404`.

## Decide

`POST /api/pharmacist/validate`

```json
{
  "photo_id": "uuid",
  "action": "approve",
  "reason": null
}
```

Actions remain `approve`, `reject`, and `needs_clearer`. Reject and needs-clearer require a trimmed reason of 1–500 characters. Approve does not require a reason.

The claim owner may decide. For backward compatibility, a decision on an unclaimed or expired item atomically acquires it and decides it within the same transaction. A live claim owned by someone else returns `409`. A decided item returns `409`.

The decision, medication status, derived patient priority (when applicable), patient notification, and audit event commit atomically. Exactly one competing decision can succeed.

## Audit history

`GET /api/pharmacist/validations/:id/history`

Returns `{ "history": [...] }` in chronological order. Events are `claimed`, `released`, `claim_expired`, `reclaimed`, `approved`, `rejected`, or `needs_clearer`. Each event contains its ID, event type, a generic privacy-safe indication that a reason was recorded when applicable, event time, and `actor` (`you` or `another_pharmacist`). The clinical decision reason remains on the prescription record for the patient workflow; it is not copied into the audit trail. History never returns pharmacist IDs or names, patient identity/condition/address, medication details, images, secrets, or tokens.

## Common errors

- `400`: invalid action, missing reason, or reason over 500 characters
- `403`: authenticated user is not a pharmacist
- `404`: validation/photo does not exist or photo is unavailable
- `409`: actively owned elsewhere or already decided
