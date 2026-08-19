ALTER TABLE prescription_photos
  ADD COLUMN claimed_by CHAR(36) NULL AFTER pharmacist_id,
  ADD COLUMN claim_expires_at DATETIME(3) NULL AFTER claimed_by,
  ADD KEY idx_photo_pending_claim (status, claim_expires_at),
  ADD CONSTRAINT fk_photo_claimed_by FOREIGN KEY (claimed_by) REFERENCES pharmacists (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS prescription_validation_audit (
  id CHAR(36) NOT NULL,
  prescription_id CHAR(36) NOT NULL,
  medication_id CHAR(36) NOT NULL,
  pharmacist_id CHAR(36) NOT NULL,
  event_type ENUM('claimed','released','claim_expired','reclaimed','approved','rejected','needs_clearer') NOT NULL,
  reason VARCHAR(500) NULL,
  event_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_validation_audit_photo (prescription_id, event_time ASC, id ASC),
  CONSTRAINT fk_validation_audit_photo FOREIGN KEY (prescription_id) REFERENCES prescription_photos (id) ON DELETE CASCADE,
  CONSTRAINT fk_validation_audit_medication FOREIGN KEY (medication_id) REFERENCES medications (id) ON DELETE CASCADE,
  CONSTRAINT fk_validation_audit_pharmacist FOREIGN KEY (pharmacist_id) REFERENCES pharmacists (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
