-- Existing inquiry history remains on the server. Do not infer consent for
-- existing patients or backfill consent snapshots on earlier conversations.
ALTER TABLE patients
  ADD COLUMN inquiry_consent_policy_version VARCHAR(40) NULL,
  ADD COLUMN inquiry_consent_accepted_at DATETIME(3) NULL,
  ADD COLUMN inquiry_consent_revoked_at DATETIME(3) NULL;

CREATE TABLE inquiry_consent_events (
  id CHAR(36) NOT NULL,
  patient_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  action ENUM('ACCEPTED','WITHDRAWN') NOT NULL,
  policy_version VARCHAR(40) NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_inquiry_consent_patient (patient_id,occurred_at),
  CONSTRAINT fk_inquiry_consent_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_inquiry_consent_actor FOREIGN KEY (actor_user_id)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE inquiry_threads
  ADD COLUMN consent_policy_version VARCHAR(40) NULL,
  ADD COLUMN consent_accepted_at DATETIME(3) NULL;
