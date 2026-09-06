-- Native Google ML Kit OCR validation telemetry plus virtual follow-up and
-- pharmacist-reviewed post-dispensing counseling workflows.

ALTER TABLE patient_notifications
  MODIFY COLUMN type ENUM(
    'dose_reminder',
    'dose_missed',
    'schedule_confirmed',
    'schedule_changed',
    'prescription_approved',
    'prescription_rejected',
    'prescription_needs_clearer',
    'streak_warning',
    'streak_reset',
    'reward_earned',
    'caregiver_update',
    'appointment_update',
    'counseling_summary_ready'
  ) NOT NULL;

CREATE TABLE IF NOT EXISTS ocr_scan_evaluations (
  id CHAR(36) NOT NULL,
  patient_id CHAR(36) NOT NULL,
  purpose ENUM('MEDICINE_LABEL','PRESCRIPTION') NOT NULL DEFAULT 'MEDICINE_LABEL',
  engine VARCHAR(80) NOT NULL DEFAULT 'GOOGLE_ML_KIT_TEXT_RECOGNITION_V2',
  engine_version VARCHAR(40) NOT NULL,
  sample_country CHAR(2) NOT NULL DEFAULT 'PH',
  sample_code VARCHAR(80) NULL,
  device_platform VARCHAR(40) NOT NULL,
  device_model VARCHAR(120) NULL,
  app_version VARCHAR(40) NULL,
  offline_mode TINYINT(1) NOT NULL DEFAULT 0,
  processing_ms INT UNSIGNED NULL,
  image_quality ENUM('GOOD','BLURRY','INCOMPLETE','LOW_LIGHT','TOO_SMALL','UNKNOWN')
    NOT NULL DEFAULT 'UNKNOWN',
  image_quality_score DECIMAL(5,4) NULL,
  field_confidence DECIMAL(5,4) NULL,
  confidence_threshold DECIMAL(5,4) NOT NULL DEFAULT 0.7500,
  outcome ENUM('ACCEPTED','MANUAL_REVIEW','RECAPTURE_REQUIRED','UNAVAILABLE') NOT NULL,
  detected_name VARCHAR(255) NULL,
  detected_strength VARCHAR(100) NULL,
  detected_formulation VARCHAR(100) NULL,
  confirmed_name VARCHAR(255) NULL,
  confirmed_strength VARCHAR(100) NULL,
  confirmed_formulation VARCHAR(100) NULL,
  name_accuracy_pct DECIMAL(5,2) NULL,
  strength_accuracy_pct DECIMAL(5,2) NULL,
  formulation_accuracy_pct DECIMAL(5,2) NULL,
  field_accuracy_pct DECIMAL(5,2) NULL,
  manual_correction_used TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ocr_evaluation_created (created_at),
  KEY idx_ocr_evaluation_quality (image_quality,outcome),
  KEY idx_ocr_evaluation_device (device_platform,device_model),
  CONSTRAINT fk_ocr_evaluation_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS counseling_appointments (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  patient_id CHAR(36) NOT NULL,
  branch_id CHAR(36) NOT NULL,
  pharmacist_id CHAR(36) NULL,
  topic ENUM('POST_DISPENSING','MEDICATION_REVIEW','MISSED_DOSE','SIDE_EFFECT_CONCERN','OTHER')
    NOT NULL DEFAULT 'POST_DISPENSING',
  modality ENUM('VIDEO','AUDIO','PHONE') NOT NULL DEFAULT 'VIDEO',
  scheduled_start_at DATETIME(3) NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Manila',
  meeting_url VARCHAR(1000) NULL,
  session_instructions VARCHAR(500) NULL,
  status ENUM('REQUESTED','CONFIRMED','COMPLETED','DECLINED','CANCELLED')
    NOT NULL DEFAULT 'REQUESTED',
  decision_reason VARCHAR(500) NULL,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  confirmed_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_counseling_patient (patient_id,scheduled_start_at),
  KEY idx_counseling_pharmacist (pharmacist_id,scheduled_start_at,status),
  KEY idx_counseling_branch (branch_id,status,scheduled_start_at),
  CONSTRAINT fk_counseling_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_counseling_branch FOREIGN KEY (branch_id)
    REFERENCES pharmacy_branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_counseling_pharmacist FOREIGN KEY (pharmacist_id)
    REFERENCES pharmacists(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS counseling_summaries (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  appointment_id CHAR(36) NOT NULL,
  patient_id CHAR(36) NOT NULL,
  pharmacist_id CHAR(36) NOT NULL,
  template_version VARCHAR(40) NOT NULL DEFAULT 'COUNSELING_V1',
  status ENUM('DRAFT','PUBLISHED','RETRACTED') NOT NULL DEFAULT 'DRAFT',
  summary_text TEXT NOT NULL,
  source_snapshot_json JSON NOT NULL,
  reviewer_license_number VARCHAR(100) NULL,
  reviewer_license_jurisdiction VARCHAR(100) NULL,
  reviewer_license_expires_on DATE NULL,
  generated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  published_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_counseling_summary_appointment (appointment_id),
  KEY idx_counseling_summary_patient (patient_id,status,published_at),
  CONSTRAINT fk_counseling_summary_appointment FOREIGN KEY (appointment_id)
    REFERENCES counseling_appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_counseling_summary_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_counseling_summary_pharmacist FOREIGN KEY (pharmacist_id)
    REFERENCES pharmacists(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS counseling_summary_revisions (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  summary_id CHAR(36) NOT NULL,
  version INT UNSIGNED NOT NULL,
  action ENUM('GENERATED','EDITED','PUBLISHED','RETRACTED') NOT NULL,
  summary_text TEXT NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_counseling_summary_version (summary_id,version),
  CONSTRAINT fk_counseling_revision_summary FOREIGN KEY (summary_id)
    REFERENCES counseling_summaries(id) ON DELETE CASCADE,
  CONSTRAINT fk_counseling_revision_actor FOREIGN KEY (actor_user_id)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
