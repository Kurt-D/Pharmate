# PharMate data-retention policy

**Status:** proposed operational policy; legal/privacy approval is required before deletion is enabled in production. This is not legal advice. The privacy officer must reconcile these periods with applicable Philippine health-record, pharmacy, tax, employment, and contractual obligations, and place a legal hold whenever a complaint, investigation, claim, or safety review requires it.

## Principles

- Keep only the data needed for care, safety, security, and legal duties.
- Keep production, backups, exports, and replicas on the same lifecycle.
- A legal hold pauses deletion for relevant records and backups.
- Purge logs contain record counts and minimal identifiers only—never messages, prescriptions, passwords, or tokens.
- Production deletion needs a tested restore, current backup, privacy-officer approval, and system-owner approval.

## Proposed schedule

| Data class | Retention | Disposition |
| --- | --- | --- |
| Prescription images | 7 days after pharmacist decision (`purge_at`) | Delete object and create minimal purge audit event. |
| Open prescription images | Until decision, then 7 days | Alert on stale pending work; never silently delete it. |
| Inquiry messages | 90 days after thread closure | Delete messages first; keep minimal thread lifecycle record. |
| Caregiver links and link audit | Active lifetime; 7 years after revocation | Pseudonymize non-required fields when permitted. |
| Patient/portal notifications | Read: 90 days; unread: 1 year | Delete notification text and metadata. |
| Audit/security records | 7 years minimum | Keep tamper-evident and off-server copy; normal app account never deletes. |
| Encrypted backups | Daily: 35 days; monthly: 12 months | Enforce S3 lifecycle; preserve holds. |
| Disabled/deleted accounts | Disable immediately; 7 years minimum linkage/audit | Pseudonymize non-required profile fields after approval. |
| Security artifacts | Refresh families: 30 days after expiry/revocation; OTP/reset: 24 hours after expiry; rate counters: 24 hours after expiry | Automatically purge operational artifacts. |

Clinical and account periods are proposed baselines, not confirmation of statutory retention. Do not enable routine deletion for those rows until the privacy officer documents the approved jurisdiction-specific period.

## Operational controls

1. Run `npm run retention:report` weekly. It is read-only and identifies eligible records.
2. Send count-only output to the central operations/security logs.
3. Before a purge change, verify an encrypted backup and the recovery runbook.
4. Use a dedicated scheduled-job account with only needed deletion privileges. The ordinary app account must not delete audit records.
5. Test deletion in an isolated restored environment, reconcile database/file counts, then obtain written production approval.
6. Review annually and after changes to data collection, law, backup provider, or incident response.

## Holds and requests

The privacy officer owns a hold register recording scope, reason, approver, start/review date, and release decision. Purge jobs exclude held records. Verified privacy/access/deletion requests must be checked across database, uploads, backups, and exports, then recorded in audit logs.

## Current implementation boundary

`prescription_photos.purge_at` already supports post-decision image lifecycle. The included report script intentionally never deletes database rows or files. This prevents accidental loss until retention periods, S3 lifecycle, and legal-hold process are formally approved.
