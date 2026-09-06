# Inquiry privacy policy and implementation contract

Policy version: **2026-09-06**. This notice covers the optional **Ask Your
Pharmacist** inquiry feature. The same notice is available in the application at
`/privacy#inquiries` and before a patient enables inquiries. It is separate from
account registration and from other patient preferences.

## What is stored and why

PharMate sends submitted inquiry subjects and messages to its backend and stores
them centrally in MySQL. Thread records include the patient account identifier,
branch, requested and assigned pharmacist, subject, priority, status, and
timestamps. Message records include the message text, sender role, thread
identifier, and timestamp. These records support pharmacist responses and
consultation history across sessions and devices. Inquiry history is **not
stored only on the patient's device**.

The patient identifier displayed to pharmacists is a patient code. This is a
pseudonym, not anonymity: PharMate can associate the code with the patient
account, and a subject or message can itself disclose a name, condition, medicine,
or other identifying information. Patients should include information needed for
their question and avoid unnecessary identifiers.

Inquiry subjects and message text are stored as plaintext at the application
database layer. They are not covered by the application's AES-encrypted patient
profile columns, and the application does not provide end-to-end encryption for
inquiries. Encryption of a deployment's network connections, disks, or backups
must be verified for that deployment; this notice does not certify those
controls.

## Who can see an inquiry

| Recipient | Application access |
| --- | --- |
| Patient who owns the inquiry | Own inquiry list and message history, including completed conversations. |
| Pharmacists eligible for the selected branch or requested pharmacist queue | Before assignment, a preview containing the subject, patient code, priority, status, dates, and message-count metadata; the subject may contain sensitive information. With no branch or pharmacist restriction, eligible pharmacists across branches can see the request. |
| Assigned pharmacist | Conversation messages and the assigned inquiry's history. |
| Actively linked caregiver | Can submit an inquiry on the patient's behalf only when the patient has already enabled inquiries; this permission does not provide a caregiver transcript-reading endpoint. |
| Administrator portal | No inquiry transcript-reading API. Operational counts and audit activity are distinct from transcript access. |
| Service database operators and people with database/backup access | Centrally stored records can be accessible through infrastructure privileges, independently of portal roles. |

Other patients and unassigned pharmacists cannot read a transcript through the
inquiry API. Application role restrictions must not be described as a guarantee
that only two people can ever access the centrally stored data.

## Enabling inquiries and withdrawing consent

Inquiries are optional. Before creating an inquiry or adding messages, the
patient must explicitly accept the current inquiry policy while signed in. The
server records the accepted policy version and timestamp for that patient.
Registration, a caregiver link, pre-existing inquiry history, and consent to a
different feature do not count as inquiry consent. Existing accounts are not
automatically opted in when this policy is introduced or updated.

The patient can withdraw inquiry consent from the inquiry screen. Withdrawal
stops new inquiry submissions, caregiver submissions on that patient's behalf,
and new patient or pharmacist messages. Previously stored inquiry history remains
available to the patient and assigned pharmacist. The patient can still complete
an existing inquiry. Enabling the feature again requires an explicit acceptance
of the then-current policy. Consent and withdrawal events remain recorded for
audit history.

## Retention and deletion

The current implementation retains inquiry threads, messages, and consent
history indefinitely: it has no automatic inquiry purge schedule or configured
retention deadline. Completing or closing a conversation makes it read-only;
it does not delete the subject or messages. Withdrawing consent, signing out,
clearing browser data, or uninstalling the app does not erase the server records
or any database backups.

There is no self-service inquiry erasure endpoint in this release. Patients can
contact their pharmacy branch about a conversation or stored-record request. A
request to the service operator would need a separately managed review and
deletion process; the software does not yet implement or promise that process,
a response time, or backup erasure. An operational retention and erasure policy
remains necessary before representing those capabilities as available.

## What remains on the device

The client fetches inquiry history from the server and keeps displayed messages
in application memory while the screen is open. It does not implement a
persistent offline transcript cache. Loading uncached history or sending a
message requires a server connection.

Optional conversation labels are saved in browser/app local storage under the
signed-in patient's account namespace. These labels are local display
customizations, not the message history. A label can contain sensitive text if a
patient types it there. Clearing site/app data removes local labels without
removing centrally stored conversations. Account scoping limits accidental
mixing of labels between signed-in accounts; it is not encryption against people
with access to the device or browser storage.

## Consent API

These endpoints require a signed-in patient access token. Caregivers and staff
cannot accept or withdraw inquiry consent for a patient.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/patient/inquiry-consent` | Returns the current policy version and the patient's consent status. Does not grant consent. |
| `POST /api/patient/inquiry-consent` | Accepts `{ "accepted": true, "policy_version": "2026-09-06" }`; records affirmative consent to the current version. |
| `DELETE /api/patient/inquiry-consent` | Withdraws inquiry consent. Does not delete inquiries or consent audit history. |

Successful calls return `consented`, `policy_version`, `accepted_at`, and
`revoked_at`. Timestamps are `null` when no corresponding event has occurred.
A missing, false, or outdated acceptance returns HTTP `403` with
`error: "inquiry_consent_required"`. Inquiry/message writes without current
consent use the same error code and a readable explanation. Consent retries do
not create duplicate acceptance or withdrawal events.

The consent requirement is enforced on the server, not solely by a browser
checkbox. A request without current affirmative consent is rejected before a new
inquiry or message is persisted. Historical reads and closure remain separate
from permission to add new content.

## Implementation traceability

| Claim | Implementation to inspect |
| --- | --- |
| Versioned notice shared by public policy and patient consent UI | `shared/inquiryPrivacy.mjs`; public `/privacy#inquiries` page; patient Ask screen. |
| Central subject/message persistence and transcript access restrictions | `server/src/services/inquiry.js`; `inquiry_threads` and `inquiry_messages`; patient/pharmacist inquiry routes. |
| Patient-only consent and caregiver enforcement | `server/src/services/inquiryConsent.js`; patient inquiry-consent routes; inquiry service checks; caregiver inquiry route. |
| Consent audit and new-thread policy snapshots, without legacy opt-in | `server/migrations/048_inquiry_privacy_consent.sql`; patient consent columns; `inquiry_consent_events`; `inquiry_threads.consent_policy_version` and `consent_accepted_at`. |
| Retention after closure | Inquiry service `closeThread` updates status and closing timestamp; it does not delete messages. |
| Patient-specific local labels, in-memory transcript display | `client/src/pages/patient/AskRedesign.jsx` and its local-label storage helper. |
| Selected profile columns encrypted; inquiry text not included | `server/src/utils/crypto.js`, inquiry inserts, and [security notes](security.md). |
| Text not broadcast in inquiry update notifications | `server/src/services/domainEvents.js`; identifiers and update metadata trigger authenticated history fetches. |

## Scope of assurance

This document describes the implemented inquiry data flow. It is not a legal
compliance certification, a security audit, or evidence that an operator's backup,
retention, or data-subject request procedures have been implemented. A research
paper must describe this central-storage model and its limitations. Ready-to-use
replacement text is provided in
[the paper amendment](PAPER_INQUIRY_PRIVACY_AMENDMENT.md).
