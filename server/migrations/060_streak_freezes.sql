-- Two automatic streak freezes may preserve a broken adherence day each week.
ALTER TABLE patient_streak_days
  MODIFY COLUMN result ENUM('complete', 'broken', 'frozen') NOT NULL;

CREATE TABLE IF NOT EXISTS patient_streak_freezes (
  patient_id CHAR(36) NOT NULL,
  dose_date DATE NOT NULL,
  week_key DATE NOT NULL,
  used_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (patient_id, dose_date),
  KEY idx_streak_freeze_week (patient_id, week_key),
  CONSTRAINT fk_streak_freeze_patient FOREIGN KEY (patient_id)
    REFERENCES patients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
