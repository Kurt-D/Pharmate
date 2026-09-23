-- Order events are persisted in the patient notification inbox.
ALTER TABLE patient_notifications
  MODIFY COLUMN type ENUM(
    'dose_reminder','dose_missed','schedule_confirmed','schedule_changed',
    'prescription_approved','prescription_rejected','prescription_needs_clearer',
    'streak_warning','streak_reset','reward_earned','caregiver_update',
    'appointment_update','counseling_summary_ready','otc_back_in_stock',
    'order_created','order_update'
  ) NOT NULL;
