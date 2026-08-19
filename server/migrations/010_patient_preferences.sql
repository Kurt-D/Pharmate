-- Patient-owned reminder, voice, and privacy preferences.
-- Stores settings only: no device identifiers, medication data, or other PII.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS patient_preferences (
  patient_id                      CHAR(36) NOT NULL,
  reminders_enabled               TINYINT(1) NOT NULL DEFAULT 1,
  voice_enabled                   TINYINT(1) NOT NULL DEFAULT 1,
  voice_detail                    ENUM('private','medicine_name') NOT NULL DEFAULT 'private',
  vibration_enabled               TINYINT(1) NOT NULL DEFAULT 1,
  reminder_lead_minutes           TINYINT UNSIGNED NOT NULL DEFAULT 0,
  caregiver_missed_alerts_enabled TINYINT(1) NOT NULL DEFAULT 1,
  lock_screen_detail              ENUM('private','medicine_name') NOT NULL DEFAULT 'private',
  timezone                        VARCHAR(64) NOT NULL DEFAULT 'Asia/Manila',
  created_at                      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at                      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (patient_id),
  CONSTRAINT chk_preferences_lead CHECK (reminder_lead_minutes BETWEEN 0 AND 60),
  CONSTRAINT fk_preferences_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO patient_preferences (patient_id) SELECT id FROM patients;
