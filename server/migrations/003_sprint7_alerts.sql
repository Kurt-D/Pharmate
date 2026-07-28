-- PharMate Migration 003 — Sprint 7 caregiver / follow-up alerts (UC-08)
--
-- A missed dose raises an alert. If the patient has linked caregivers, one
-- 'caregiver'-channel alert is raised per caregiver. If they have none,
-- one 'pharmacist'-channel alert is raised so the pharmacist dashboard can flag
-- the patient for follow-up (no-caregiver mode).
--
-- Privacy: this table stores only foreign keys. Every API that surfaces an alert
-- joins to patients.patient_code — a name/condition is never exposed (TC-05,
-- caregiver alerts carry no PII).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS caregiver_alerts (
  id           CHAR(36)    NOT NULL DEFAULT (UUID()),
  patient_id   CHAR(36)    NOT NULL,
  schedule_id  CHAR(36),                        -- the missed dose (NULL-safe)
  caregiver_id CHAR(36),                        -- NULL for pharmacist-channel alerts
  channel      ENUM('caregiver','pharmacist') NOT NULL,
  alert_type   ENUM('missed_dose') NOT NULL DEFAULT 'missed_dose',
  status       ENUM('unseen','seen','resolved') NOT NULL DEFAULT 'unseen',
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_alert_caregiver (caregiver_id, status),
  KEY idx_alert_channel   (channel, status),
  CONSTRAINT fk_alert_patient   FOREIGN KEY (patient_id)   REFERENCES patients             (id) ON DELETE CASCADE,
  CONSTRAINT fk_alert_schedule  FOREIGN KEY (schedule_id)  REFERENCES medication_schedules (id) ON DELETE SET NULL,
  CONSTRAINT fk_alert_caregiver FOREIGN KEY (caregiver_id) REFERENCES caregivers           (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
