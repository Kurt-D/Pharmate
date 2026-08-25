-- Unified portal caregiver pairing metadata.
-- Invite secrets remain hashed; readable codes are returned only once.

ALTER TABLE caregiver_patients
  ADD COLUMN relationship VARCHAR(50) NOT NULL DEFAULT 'Caregiver' AFTER patient_id;

ALTER TABLE invite_codes
  ADD COLUMN used_by_caregiver_id CHAR(36) NULL AFTER used_at,
  ADD CONSTRAINT fk_invite_used_by_caregiver
    FOREIGN KEY (used_by_caregiver_id) REFERENCES caregivers(id) ON DELETE SET NULL;

