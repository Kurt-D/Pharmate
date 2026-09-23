-- Extend the existing role-neutral notification inbox. These fields describe
-- an authorized domain event; they never contain credentials or clinical notes.
ALTER TABLE portal_notifications
  ADD COLUMN category VARCHAR(40) NULL AFTER type,
  ADD COLUMN priority ENUM('INFO','ATTENTION','URGENT') NOT NULL DEFAULT 'INFO' AFTER body,
  ADD COLUMN resource_type VARCHAR(50) NULL AFTER priority,
  ADD COLUMN resource_id VARCHAR(100) NULL AFTER resource_type,
  ADD COLUMN resolved_at DATETIME(3) NULL AFTER read_at;

CREATE INDEX idx_portal_notification_attention
  ON portal_notifications (user_id, category, resolved_at, created_at);

ALTER TABLE patient_notifications
  MODIFY COLUMN type ENUM(
    'dose_reminder','dose_missed','schedule_confirmed','schedule_changed',
    'prescription_approved','prescription_rejected','prescription_needs_clearer',
    'streak_warning','streak_reset','reward_earned','caregiver_update',
    'appointment_update','counseling_summary_ready','otc_back_in_stock',
    'order_update'
  ) NOT NULL;
