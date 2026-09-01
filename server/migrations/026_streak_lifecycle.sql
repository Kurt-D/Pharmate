-- Server-owned adherence streak lifecycle and idempotent daily evaluation.
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
    'caregiver_update'
  ) NOT NULL;

ALTER TABLE patient_notifications
  ADD COLUMN push_sent_at DATETIME(3) NULL AFTER read_at,
  ADD KEY idx_notification_pending_push (patient_id, type, push_sent_at);

CREATE TABLE IF NOT EXISTS patient_streaks (
  patient_id          CHAR(36) NOT NULL,
  current_days        INT UNSIGNED NOT NULL DEFAULT 0,
  priority_tokens     INT UNSIGNED NOT NULL DEFAULT 0,
  last_completed_date DATE NULL,
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                      ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (patient_id),
  CONSTRAINT fk_streak_patient FOREIGN KEY (patient_id)
    REFERENCES patients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_streak_days (
  patient_id      CHAR(36) NOT NULL,
  dose_date       DATE NOT NULL,
  result          ENUM('complete', 'broken') NOT NULL,
  scheduled_count INT UNSIGNED NOT NULL,
  taken_count      INT UNSIGNED NOT NULL,
  streak_after     INT UNSIGNED NOT NULL,
  tokens_awarded   INT UNSIGNED NOT NULL DEFAULT 0,
  processed_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (patient_id, dose_date),
  KEY idx_streak_day_result (dose_date, result),
  CONSTRAINT fk_streak_day_patient FOREIGN KEY (patient_id)
    REFERENCES patients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
