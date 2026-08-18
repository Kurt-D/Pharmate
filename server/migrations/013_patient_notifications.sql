-- Patient notification inbox. Event keys make backend event delivery idempotent.
CREATE TABLE IF NOT EXISTS patient_notifications (
  id          CHAR(36) NOT NULL,
  patient_id  CHAR(36) NOT NULL,
  type        ENUM(
    'dose_reminder',
    'dose_missed',
    'schedule_confirmed',
    'schedule_changed',
    'prescription_approved',
    'prescription_rejected',
    'prescription_needs_clearer'
  ) NOT NULL,
  title       VARCHAR(120) NOT NULL,
  message     VARCHAR(500) NOT NULL,
  metadata    JSON NULL,
  event_key   VARCHAR(255) NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  read_at     DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_patient_notification_event (event_key),
  KEY idx_notification_patient_created (patient_id, created_at DESC, id DESC),
  KEY idx_notification_patient_unread (patient_id, read_at, created_at),
  CONSTRAINT fk_notification_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
