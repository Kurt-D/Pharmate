-- Separate the shared schedule definition/approval state from individual dose
-- lifecycle rows. Existing confirmed rows predate this migration and remain
-- approved; new application writes explicitly choose a review state.
ALTER TABLE medications
  ADD COLUMN schedule_type ENUM(
    'SPECIFIC_TIMES','EVERY_N_HOURS','ONCE_DAILY','TWICE_DAILY',
    'THREE_TIMES_DAILY','SPECIFIC_DAYS','WEEKLY','AS_NEEDED'
  ) NULL AFTER frequency_code,
  ADD COLUMN schedule_times JSON NULL AFTER schedule_type,
  ADD COLUMN interval_hours SMALLINT UNSIGNED NULL AFTER schedule_times,
  ADD COLUMN interval_start_time TIME NULL AFTER interval_hours,
  ADD COLUMN schedule_days JSON NULL AFTER interval_start_time,
  ADD COLUMN schedule_status ENUM(
    'DRAFT','NEEDS_REVIEW','PENDING_APPROVAL','APPROVED','REJECTED','MODIFIED'
  ) NOT NULL DEFAULT 'APPROVED' AFTER schedule_days,
  ADD COLUMN schedule_updated_by CHAR(36) NULL AFTER schedule_status,
  ADD COLUMN schedule_updated_at DATETIME(3) NULL AFTER schedule_updated_by,
  ADD COLUMN schedule_approved_by CHAR(36) NULL AFTER schedule_updated_at,
  ADD COLUMN schedule_approved_at DATETIME(3) NULL AFTER schedule_approved_by,
  ADD CONSTRAINT fk_med_schedule_updated_by FOREIGN KEY (schedule_updated_by)
    REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_med_schedule_approved_by FOREIGN KEY (schedule_approved_by)
    REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS medication_schedule_audit (
  id             CHAR(36) NOT NULL DEFAULT (UUID()),
  medication_id  CHAR(36) NOT NULL,
  patient_id     CHAR(36) NOT NULL,
  actor_id       CHAR(36) NOT NULL,
  actor_role     ENUM('patient','caregiver','pharmacist','admin','system') NOT NULL,
  before_info    JSON NULL,
  after_info     JSON NULL,
  changed_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_schedule_audit_patient (patient_id, changed_at),
  CONSTRAINT fk_schedule_audit_medication FOREIGN KEY (medication_id)
    REFERENCES medications(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedule_audit_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedule_audit_actor FOREIGN KEY (actor_id)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A regeneration may create a new version at the same instant, but one version
-- can never contain the same medication dose twice.
ALTER TABLE medication_schedules
  ADD UNIQUE KEY uq_medication_dose_version
    (medication_id, scheduled_time, schedule_version);
