-- Professional governance is intentionally separate from general user accounts.
-- These fields are the small, patient-safe profile surface administered by staff.
CREATE TABLE IF NOT EXISTS pharmacist_professional_profiles (
  pharmacist_id CHAR(36) NOT NULL,
  professional_title VARCHAR(120) NULL,
  specialization VARCHAR(160) NULL,
  languages VARCHAR(255) NULL,
  biography VARCHAR(1000) NULL,
  patient_visible TINYINT(1) NOT NULL DEFAULT 0,
  chat_available TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (pharmacist_id),
  CONSTRAINT fk_pharmacist_professional_profile
    FOREIGN KEY (pharmacist_id) REFERENCES pharmacists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_pharmacists_license_expiry
  ON pharmacists (license_status, license_expires_on);
