-- Secure, patient-controlled caregiver linking.
-- Existing plaintext invites are converted to SHA-256 hashes, then erased.

ALTER TABLE invite_codes
  ADD COLUMN token_hash CHAR(64) NULL AFTER code,
  ADD COLUMN revoked_at DATETIME(3) NULL AFTER used_at;

UPDATE invite_codes
SET token_hash = SHA2(UPPER(TRIM(code)), 256)
WHERE token_hash IS NULL AND code IS NOT NULL;

ALTER TABLE invite_codes
  MODIFY COLUMN code VARCHAR(64) NULL,
  ADD UNIQUE KEY uq_invite_token_hash (token_hash),
  ADD KEY idx_invite_patient_active (patient_id, used, revoked_at, expires_at);

UPDATE invite_codes SET code = NULL WHERE token_hash IS NOT NULL;

ALTER TABLE caregiver_patients
  ADD COLUMN status ENUM('active','revoked') NOT NULL DEFAULT 'active' AFTER linked_at,
  ADD COLUMN revoked_at DATETIME(3) NULL AFTER status,
  ADD COLUMN revoked_by_patient_id CHAR(36) NULL AFTER revoked_at,
  ADD KEY idx_cp_active_patient (patient_id, status),
  ADD KEY idx_cp_active_caregiver (caregiver_id, status),
  ADD CONSTRAINT fk_cp_revoked_by_patient
    FOREIGN KEY (revoked_by_patient_id) REFERENCES patients (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS caregiver_link_audit (
  id            CHAR(36) NOT NULL DEFAULT (UUID()),
  link_id       CHAR(36) NOT NULL,
  caregiver_id  CHAR(36) NOT NULL,
  patient_id    CHAR(36) NOT NULL,
  event_type    ENUM('linked','relinked','revoked') NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  invite_id     CHAR(36) NULL,
  occurred_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_cla_link_time (link_id, occurred_at),
  KEY idx_cla_patient_time (patient_id, occurred_at),
  CONSTRAINT fk_cla_link FOREIGN KEY (link_id) REFERENCES caregiver_patients (id) ON DELETE CASCADE,
  CONSTRAINT fk_cla_caregiver FOREIGN KEY (caregiver_id) REFERENCES caregivers (id) ON DELETE CASCADE,
  CONSTRAINT fk_cla_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT fk_cla_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_cla_invite FOREIGN KEY (invite_id) REFERENCES invite_codes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO caregiver_link_audit
  (id, link_id, caregiver_id, patient_id, event_type, actor_user_id, occurred_at)
SELECT UUID(), cp.id, cp.caregiver_id, cp.patient_id, 'linked', cp.caregiver_id, cp.linked_at
FROM caregiver_patients cp
WHERE NOT EXISTS (
  SELECT 1 FROM caregiver_link_audit a WHERE a.link_id = cp.id
);
