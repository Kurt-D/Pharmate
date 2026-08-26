-- Medication management is an explicit, patient-controlled caregiver permission.
-- Existing links remain view-only until the patient enables access.

ALTER TABLE caregiver_patients
  ADD COLUMN can_manage_medications TINYINT(1) NOT NULL DEFAULT 0 AFTER relationship;
