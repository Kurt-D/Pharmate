CREATE TABLE IF NOT EXISTS patient_safety_profiles (
  patient_id CHAR(36) NOT NULL,
  date_of_birth DATE NULL,
  weight_kg DECIMAL(5,2) NULL,
  allergies_enc TEXT NULL,
  conditions_enc TEXT NULL,
  current_medicines_enc TEXT NULL,
  kidney_status ENUM('YES','NO','UNSURE','UNANSWERED') NOT NULL DEFAULT 'UNANSWERED',
  liver_status ENUM('YES','NO','UNSURE','UNANSWERED') NOT NULL DEFAULT 'UNANSWERED',
  pregnancy_status ENUM('PREGNANT','BREASTFEEDING','NEITHER','NOT_APPLICABLE','UNSURE','UNANSWERED') NOT NULL DEFAULT 'UNANSWERED',
  caregiver_alerts TINYINT(1) NOT NULL DEFAULT 0,
  profile_completed TINYINT(1) NOT NULL DEFAULT 0,
  consented_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (patient_id),
  CONSTRAINT fk_safety_profile_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO patient_safety_profiles (patient_id)
SELECT id FROM patients;
