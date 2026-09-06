# Paper amendment: inquiry data flow and privacy

Prepared against inquiry policy version **2026-09-06**.

The original manuscript was not found in this repository. Consequently, its
exact wording and page references have not been edited. The replacement passages
below are ready to insert wherever the paper describes inquiry architecture,
privacy, consent, retention, and limitations. They describe the implementation,
not measured research results or a finding of legal compliance.

## Replacement methodology: inquiry architecture

PharMate implements Ask Your Pharmacist as a centrally stored consultation
service. After a patient explicitly enables the optional inquiry feature,
submitted subjects and messages are transmitted to the backend and stored in
MySQL with thread identifiers, the patient account association, branch and
pharmacist routing, sender roles, priority, status, and timestamps. The patient
and assigned pharmacist retrieve the conversation through authenticated,
role-restricted API requests. Completing a conversation changes it to read-only
consultation history; it does not remove the stored messages. The client displays
retrieved transcripts in application memory and does not maintain a persistent
offline transcript cache. Patient-customized conversation labels are stored
locally under the patient's account namespace and are distinct from the
centrally retained conversation history.

## Replacement privacy and consent statement

The application displays the same inquiry privacy notice on its public privacy
page and at the point where a patient enables inquiries. The implemented policy
version is 2026-09-06. Inquiry use requires affirmative, versioned consent
recorded by the backend; account registration and existing inquiry records do
not imply acceptance. A linked caregiver may submit an inquiry for a patient
only when that patient has already consented. Withdrawal blocks new inquiries
and new patient or pharmacist messages but preserves access to previously stored
history for the patient and assigned pharmacist. Consent acceptance and
withdrawal remain auditable. This distinction between ending future
participation and deleting existing records is disclosed before acceptance.

## Replacement access and confidentiality statement

Pharmacists are shown a patient code rather than the patient's structured name
field. The code is pseudonymous because the system can associate it with the
patient account. Inquiry subjects and message text may independently identify
the patient. Eligible pharmacists can view a queue preview containing the
subject, patient code, priority, dates, status, and message-count metadata before
assignment. If neither a branch nor a pharmacist restricts the request, eligible
pharmacists across branches can see that preview. Transcript access is restricted
to the owning patient and assigned pharmacist through the application API.
Caregiver and administrator portals have no inquiry transcript-reading API, but
operators with database or backup access may access centrally retained records.
Inquiry text is not encrypted by the application's patient-profile field
encryption and the inquiry system does not provide end-to-end encryption.
Deployment-specific transport, storage, and backup protections require separate
verification.

## Replacement limitations and retention statement

The implemented inquiry history is centrally retained rather than stored only
on the patient's device. The current software has no automatic inquiry purge,
defined retention deadline, or self-service inquiry erasure endpoint. Inquiry
and consent records therefore remain indefinitely unless a separately managed
operator process removes them. Closing a conversation, withdrawing consent,
clearing local app data, or uninstalling the app does not erase the server
history or backups. An operational retention schedule, deletion and backup
procedures, and independent privacy and security review remain outside the
capabilities demonstrated by this implementation. No claim of anonymity,
end-to-end encryption, complete erasure, or regulatory compliance is established
by these software controls alone.

## Manuscript consistency checklist

- Replace claims that inquiry history is stored only on the device or is never
  stored centrally with the central-storage description above.
- Replace "anonymous inquiries" with "inquiries displayed under a patient
  code (pseudonymous)" and retain the free-text and queue-preview qualifications.
- Replace "close and purge" or deletion-on-completion claims with "complete and
  retain read-only consultation history."
- Distinguish local conversation labels from message history in diagrams,
  storage tables, and offline-use descriptions.
- Show the backend database in the inquiry data-flow diagram, and include
  pre-assignment queue metadata and the versioned consent record.
- Use the same withdrawal and retention language in methodology, participant
  information, consent materials, privacy policy, and study limitations. Do not
  backdate consent or assert that legacy records had this new consent.
- Report privacy/security test results only after the corresponding tests are
  run. This amendment itself supplies no participant testing or legal review.

The versioned application notice and technical contract are documented in
[INQUIRY_PRIVACY_POLICY.md](INQUIRY_PRIVACY_POLICY.md).
