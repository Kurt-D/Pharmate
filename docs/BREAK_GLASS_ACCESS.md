# Break-glass emergency access

## Current decision: not enabled

PharMate does not currently support emergency clinical care, emergency
dispensing, or an on-call escalation workflow requiring staff to bypass ordinary
permissions. A break-glass button would therefore create a high-risk access
path without a demonstrated safety need. It is deliberately **not implemented
or enabled**.

Normal role-based access, MFA for staff, patient-consent controls, and audit
logging remain the only access paths. This is not a backdoor: no hidden route,
shared emergency credential, permanent elevated role, or undocumented support
account is permitted.

## Preconditions before enabling it

The privacy officer, clinical lead, and system owner must approve all of the
following in writing:

1. A defined emergency use case where delayed ordinary access poses a concrete
   risk and a less-privileged workflow cannot meet the need.
2. Named staff roles eligible to invoke it, a duty roster, and emergency
   contact/escalation path.
3. A minimum necessary data scope and a short expiry (maximum 30 minutes).
4. Privacy/legal review, patient-notice wording, and jurisdiction-specific
   recordkeeping requirements.
5. Independent testing of revocation, alert delivery, audit integrity, and
   incident review.

## Required design if later approved

- Require the staff member's current MFA session and a structured, mandatory
  reason. Password-only access is insufficient.
- Grant access only to the named patient and only the explicitly approved
  emergency data/actions. Do not change staff roles or grant account-wide
  access.
- Issue a one-time server-side grant with a maximum 30-minute expiry. It cannot
  be renewed automatically and is revoked on logout, account disablement, or
  patient context change.
- Send immediate alerts to the designated administrators/security channel and,
  where appropriate, the privacy officer.
- Create a tamper-evident audit event at request, grant, every protected read or
  action, expiry/revocation, and supervisor review. Record actor, role, patient
  pseudonymous ID, reason code, request ID, IP, timestamp, scope, outcome, and
  reviewer decision—never patient content, credentials, or tokens.
- Require review within one business day. Unreviewed events escalate to the
  privacy officer.
- Include break-glass grants in off-server audit export, retention holds,
  security monitoring, and incident response exercises.

## Prohibited shortcuts

- No universal "super admin" account.
- No static bypass URL, hidden frontend flag, or environment-variable bypass.
- No shared staff login, support password, or ability to edit audit history.
- No client-side-only authorization decision.

Any future implementation must be introduced as a separate security-reviewed
change with database migrations, server-enforced authorization, automated tests,
and a tabletop exercise before release.
