# PharMate System Walkthrough Script

## Scenario

**Characters:** Roberta Garcia (patient), Ana Garcia (caregiver and Roberta’s daughter), Dr. Reyes (pharmacist), and Alex (administrator).

Roberta is 58 and takes Losartan 50 mg every morning for high blood pressure. She sometimes forgets doses, finds printed labels difficult to read, and needs Ana to help only when Roberta authorizes it. This walkthrough follows her maintenance medicine from registration through monitoring and support.

## Opening: Project Scope

**Presenter:**

“Good day. This is PharMate, a telepharmacy medication-management system. Our goal is to help patients take medicines safely and on time while connecting patients, authorized caregivers, pharmacists, and administrators in one role-based platform.”

“Our Gantt chart shows the project sequence: account and role access; pharmacy selection; medication submission and validation; smart scheduling; reminders and voice prompts; OCR confirmation; dose logging; caregiver alerts; inquiries, refills and delivery; then administration, reports, testing, and deployment.”

“Our summarized Use Case Diagram has ten use cases: account access, pharmacy selection, medication validation, smart scheduling, reminders, OCR confirmation, logging, caregiver alerts, pharmacy services, and administration.”

## Scene 1: Patient Account and Accessible Setup

**On screen:** Login page, Create Account, Patient Safety Profile, accessibility settings.

**Presenter:**

“Roberta creates a patient account. PharMate verifies her details, identifies her role, and opens the patient dashboard. During the Safety Profile, Roberta provides relevant information such as allergies, high blood pressure, and her current medicine, Losartan 50 mg. She may update this later.”

“Because Roberta needs a simple daily routine, she can use the large, simple interface and turn on voice assistance. This addresses the problem that complex systems are difficult for elderly users.”

**Matrix link:** P10 → R10; UC-01 Account and Role Access.

## Scene 2: Pharmacy and Pharmacist Selection

**On screen:** Pharmacy directory and pharmacist selection.

**Presenter:**

“Roberta opens the pharmacy directory. She can search verified branches, see relevant branch information, and choose her preferred pharmacy and pharmacist. That selection is saved to her profile for future inquiries, refill requests, and follow-up.”

**Matrix link:** P7 → R7; UC-02 Pharmacy and Pharmacist Directory/Selection.

## Scene 3: Medication Submission and Pharmacist Validation

**On screen:** Add Medicine, prescription upload/manual medicine details, pharmacist Prescription Validation queue.

**Presenter:**

“Roberta adds Losartan 50 mg tablet as her maintenance medicine. She sets it for 8:00 AM every day. For a prescription medicine, she uploads the prescription. The pharmacist receives the submission in the Prescription Validation queue.”

“Dr. Reyes opens the submission, reviews the prescription information, and can approve it, reject it with a reason, or request a clearer photo. Completed decisions stay in Review History, where the pharmacist can open the record, view the medicine and decision information, and correct the medicine details or review note when needed.”

“This protects patients from incorrect medicine records and supports pharmacist review before an Rx medicine is used in care.”

**Matrix link:** P3 → R3; UC-03 Medication Submission and Pharmacist Validation.

## Scene 4: Smart Schedule and Interval Recommendations

**On screen:** Medication schedule editor, recommended times, calendar, editable dates and reminder times.

**Presenter:**

“After validation, PharMate prepares a medication schedule. It uses the available medicine information to recommend reasonable intervals and identify possible overlap with the patient’s existing medicines.”

“Roberta can still choose dates and edit reminder times for a manual schedule. The calendar makes every chosen day visible. The purpose is to help prevent duplicate doses and unsafe spacing, especially when more than one medicine is involved.”

**Matrix link:** P4 → R4; UC-04 Smart Medication Schedule and Interval Recommendation.

## Scene 5: Reminder, Voice Prompt, and Dose Logging

**On screen:** Patient home page, voice reminder card, Mark as Taken, Scan Medicine, Snooze for 5 minutes, dose history.

**Presenter:**

“At 8:00 AM, Roberta receives an active reminder for Losartan 50 mg. The card clearly tells her which medicine is due. She can hear the reminder, mark the dose as taken, scan the medicine, or snooze for five minutes.”

“When Roberta marks Losartan as taken, PharMate records the date and time in her dose history. The summary then shows taken, upcoming, and missed doses. A streak celebration can reward her first and every newly completed streak day.”

“If Roberta does not record her Losartan dose after the missed-dose window, PharMate changes it to Missed. The overdue reminder becomes red, states the medicine name and dosage, and offers Log Dose Now or Scan Medicine. If she took it late, it is recorded as a late dose instead of being silently ignored.”

**Matrix links:** P1 → R1; P2 → R2; UC-05 Automated Reminder and Voice Prompt; UC-07 Dose Logging and Adherence Tracking.

## Scene 6: Medicine Scan and Manual Confirmation

**On screen:** Scan Medicine Label camera, detected medicine fields, confirmation.

**Presenter:**

“Before logging, Roberta may scan the Losartan label. PharMate reads the label and compares the medicine against the saved schedule. The patient can see the detected name, strength, and formulation before confirming.”

“If the image is unclear, Roberta can choose another photo or enter the label details manually. Manual confirmation keeps the patient in control instead of blocking a valid schedule.”

**Matrix link:** P3 → R3; UC-06 OCR Dose Confirmation and Manual Fallback.

## Scene 7: Caregiver Authorization and Missed-Dose Support

**On screen:** Patient Profile → Caregiver Access → Generate Code; caregiver Join/Enter Code; caregiver dashboard.

**Presenter:**

“A caregiver is optional. Roberta can use the full PharMate system independently: reminders, voice prompts, label scanning, dose logging, schedule guidance, pharmacist inquiries, and adherence history are all available without a caregiver.”

“Roberta chooses to add Ana because extra family support will help her stay consistent. Roberta generates a single-use caregiver code. Ana creates a caregiver account and enters only Roberta’s code. The connection is not automatic and Ana cannot see other patients.”

“Once Roberta authorizes the link, Ana can view Roberta’s relevant schedule and adherence information. She can see today’s dose progress, upcoming reminders, and missed-dose alerts. If Roberta misses a dose, Ana receives a privacy-safe notification and can send a supportive check-in.”

“This support can help Roberta maintain her adherence streak. Roberta still records her own dose, so she remains in control. Ana’s role is to encourage, remind, and notice when follow-up may be helpful—not to take over Roberta’s account or make decisions for her.”

“If Roberta does not add a caregiver, nothing is lost: PharMate continues to guide her through the red overdue reminder, voice guidance, medicine scan, dose logging, history, and pharmacist support. If no caregiver is linked, PharMate flags the missed dose for pharmacist follow-up instead.”

**Matrix links:** P8 → R8; P12 → R12; UC-08 Caregiver Alerts and No-Caregiver Mode.

## Scene 8: Ask a Pharmacist, Refill, and Pharmacy Services

**On screen:** Ask a Pharmacist, conversation thread, Pharmacy Shop, refill/delivery request, order tracking.

**Presenter:**

“Roberta has a question about taking Losartan with breakfast. She opens Ask a Pharmacist, selects her preferred pharmacy, and sends an inquiry. Dr. Reyes receives it, replies, and the communication remains in the inquiry history.”

“Roberta can also browse the OTC shop, request a refill or delivery where available, and track the request status. This keeps medication-related communication and pharmacy services connected.”

**Matrix links:** P6 → R6; P7 → R7; P12 → R12; UC-09 Medication Inquiry, Refill and Delivery Request.

## Scene 9: Pharmacist Workspace

**On screen:** Pharmacist dashboard, patient list, patient record, missed-dose alerts, inquiry queue, prescription history.

**Presenter:**

“On the pharmacist side, Dr. Reyes sees only the patients connected to the active workflow. The patient record uses a patient code to limit unnecessary identity exposure. He can review medication records, adherence, missed-dose alerts, pharmacist notes, and patient inquiries.”

“The Prescription Validation screen separates Awaiting Verification from Review History. A pharmacist can click a completed approved or rejected review to see its medicine information, decision, directions, and note, then make an audited correction if needed.”

“This provides continuity of care without giving every role unrestricted access to patient information.”

**Matrix links:** P6 → R6; P11 → R11; P12 → R12; UC-03, UC-07, UC-08, and UC-09.

## Scene 10: Admin Management, Privacy, and Reports

**On screen:** Admin Dashboard, User Management, pharmacist credential approval, system alerts, anonymized reports.

**Presenter:**

“Alex, the administrator, manages role access, pharmacy records, pharmacist credentials, and system alerts. A pharmacist must have a verified credential before making clinical review decisions.”

“In User Management, deleting a user immediately removes the account from the active user list and invalidates the user’s sessions, preventing further system access. Related health and audit records remain protected for accountability.”

“The admin dashboard uses role controls and anonymized operational reporting. The project’s privacy requirement is to protect sensitive patient information and anonymize data used for system-wide analytics. Sensitive privacy claims should be presented as implementation targets and verified through security testing before production deployment.”

**Matrix links:** P5 → R5; P11 → R11; P12 → R12; UC-10 Back-End and Admin Management.

## Scene 11: Offline Use and Synchronization

**On screen:** Temporarily disable network, mark a dose as taken, reconnect, show updated history.

**Presenter:**

“To demonstrate offline support, we temporarily disconnect the network. Roberta can still record her Losartan dose. PharMate stores it locally and shows that it will synchronize. When the connection returns, the record is synchronized with the server and appears in the dose history.”

**Matrix link:** P9 → R9; UC-07 Dose Logging and Adherence Tracking.

## Closing: Problem-Requirements Matrix Summary

**On screen:** Present the matrix while narrating the summary below.

**Presenter:**

“In summary, PharMate addresses missed doses with scheduled reminders and logging; incorrect or duplicate medicine use with medicine information, OCR confirmation, and interval checks; care gaps through pharmacist inquiries and authorized caregiver alerts; and limited pharmacy access through directory, OTC, refill, delivery, and tracking features.”

“Caregiver participation is a bonus support option, not a condition for patient care. A patient can use PharMate independently, while an authorized caregiver can provide additional encouragement and missed-dose support that may help the patient maintain an adherence streak.”

“The matrix also guides our remaining verification work: security and encryption controls, anonymized analytics, reliable offline synchronization, high-risk prioritization, and complete end-to-end testing. Our Gantt chart places testing and bug fixing before final deployment so each use case can be demonstrated and validated.”

“This is PharMate: a connected medication journey in which the patient remains in control, caregivers receive access only with authorization, pharmacists provide clinical follow-up, and administrators manage the platform securely.”
