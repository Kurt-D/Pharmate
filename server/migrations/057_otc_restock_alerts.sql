CREATE TABLE IF NOT EXISTS patient_otc_restock_alerts (
  id          CHAR(36) NOT NULL,
  patient_id  CHAR(36) NOT NULL,
  drug_id     CHAR(36) NOT NULL,
  notified_at DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_patient_otc_restock_alert (patient_id, drug_id),
  KEY idx_otc_restock_pending (drug_id, notified_at),
  CONSTRAINT fk_otc_restock_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT fk_otc_restock_drug FOREIGN KEY (drug_id) REFERENCES drug_reference (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE patient_notifications
  MODIFY COLUMN type ENUM(
    'dose_reminder','dose_missed','schedule_confirmed','schedule_changed',
    'prescription_approved','prescription_rejected','prescription_needs_clearer',
    'streak_warning','streak_reset','reward_earned','caregiver_update',
    'appointment_update','counseling_summary_ready','otc_back_in_stock'
  ) NOT NULL;
