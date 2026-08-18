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
- Refresh tokens: opaque 80-character random values with a 30-day TTL; only their SHA-256 hashes are stored in `refresh_tokens`.
- `JWT_SECRET` and `JWT_REFRESH_SECRET` are required to be different and at least 64 characters. The refresh secret is reserved for cryptographically separated refresh-token operations.
- On logout or suspicious activity, call `DELETE /api/auth/logout` to revoke the refresh token.

## API boundary controls

- Browser origins are read from the comma-separated `CORS_ORIGINS` environment variable. In non-production environments, `http://localhost:5173` and `http://127.0.0.1:5173` are additionally allowed. Requests without an `Origin` header, such as native apps and server-to-server clients, remain allowed.
- JSON request bodies default to a `32kb` maximum, configurable with `JSON_BODY_LIMIT`.
- Registration is limited to 5 requests per IP per hour. Login is limited to 20 requests per IP per 15 minutes, with a stricter 5-failure limit per IP and normalized email. Refresh is limited to 30 requests per IP per 15 minutes. Caregiver invite redemption is limited to 10 requests per IP per 15 minutes, with a 5-failure limit per IP and caregiver account.
- Limited responses use HTTP `429`, include `Retry-After` and rate-limit headers, and return a generic JSON error.

## Startup configuration validation

The server refuses to start unless `DB_HOST`, `DB_NAME`, `DB_USER`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `AES_KEY` are present. JWT secrets must be separate and at least 64 characters. `AES_KEY` must be exactly 64 hexadecimal characters. Validation errors name invalid settings but never include their values.

## Prescription Photo Lifecycle (D-K)

- The unredacted original **never leaves the patient device**.
- The redacted image is stored in `UPLOADS_DIR` (app-private; not web-accessible).
- A cron job checks for `prescription_photos` where `purge_at <= NOW()` and deletes the file + nulls `redacted_path`.
- Metadata (decision, timestamp, pharmacist, medication records) is retained indefinitely.

## Staff-facing views

All API responses destined for pharmacist, admin, or caregiver roles are serialized through a role-aware serializer that **omits PII columns**. A CI test (`test:grep-pii`) verifies that no seeded plaintext name appears in any staff-role response body.
