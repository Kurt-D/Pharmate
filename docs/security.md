# PharMate Security Notes

## PII Encryption (D-H)

Fields encrypted at rest with AES-256-GCM (app layer):

- `patients.full_name_enc`
- `patients.contact_num_enc`
- `patients.address_enc`
- `patients.medical_condition_enc`
- `delivery_requests.delivery_address_enc`

**Encoding format:** `base64(12-byte IV):base64(16-byte auth tag):base64(ciphertext)`  
**Key:** 32-byte key, stored in the `AES_KEY` environment variable — never in the repo.

### Key rotation procedure (single-key epoch during pilot)

1. Generate a new 32-byte key: `openssl rand -hex 32`
2. Set the new key as `AES_KEY_NEW` in the environment alongside the old `AES_KEY`.
3. Run the rotation migration script (to be written before the first key rotation):
   - Read each encrypted row with the old key.
   - Re-encrypt the plaintext with the new key.
   - Write back the new ciphertext.
   - Swap `AES_KEY` ← `AES_KEY_NEW` in `.env`; remove `AES_KEY_NEW`.
4. Restart PM2.

The pilot runs a single key epoch. A rotation only applies if the key is suspected compromised.

## JWT Tokens (D-G)

- Access tokens: 15-minute TTL, signed with `JWT_SECRET`.
- Refresh tokens: 30-day TTL, signed with `JWT_REFRESH_SECRET` (separate secret), hashed and stored in `refresh_tokens`.
- On logout or suspicious activity, call `DELETE /api/auth/logout` to revoke the refresh token.

## Prescription Photo Lifecycle (D-K)

- The unredacted original **never leaves the patient device**.
- The redacted image is stored in `UPLOADS_DIR` (app-private; not web-accessible).
- A cron job checks for `prescription_photos` where `purge_at <= NOW()` and deletes the file + nulls `redacted_path`.
- Metadata (decision, timestamp, pharmacist, medication records) is retained indefinitely.

## Staff-facing views

All API responses destined for pharmacist, admin, or caregiver roles are serialized through a role-aware serializer that **omits PII columns**. A CI test (`test:grep-pii`) verifies that no seeded plaintext name appears in any staff-role response body.
