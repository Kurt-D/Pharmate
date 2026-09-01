-- Patient-entered corrections to taken-dose times remain fully auditable.
-- The original value is copied here before dose_logs is corrected.
CREATE TABLE IF NOT EXISTS dose_log_corrections (
  id                  CHAR(36)     NOT NULL DEFAULT (UUID()),
  dose_log_id         CHAR(36)     NOT NULL,
  schedule_id         CHAR(36)     NOT NULL,
  patient_id          CHAR(36)     NOT NULL,
  previous_logged_at  DATETIME(3)  NOT NULL,
  corrected_logged_at DATETIME(3)  NOT NULL,
  previous_status     ENUM('taken','taken_late') NOT NULL,
  corrected_status    ENUM('taken','taken_late') NOT NULL,
  reason              VARCHAR(255) NOT NULL,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_dose_correction_patient (patient_id, created_at),
  KEY idx_dose_correction_log (dose_log_id),
  CONSTRAINT fk_dose_correction_log FOREIGN KEY (dose_log_id) REFERENCES dose_logs (id) ON DELETE CASCADE,
  CONSTRAINT fk_dose_correction_schedule FOREIGN KEY (schedule_id) REFERENCES medication_schedules (id) ON DELETE CASCADE,
  CONSTRAINT fk_dose_correction_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
