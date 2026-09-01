ALTER TABLE medications
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(255) NULL AFTER label_direction,
  ADD COLUMN IF NOT EXISTS release_type_snapshot VARCHAR(80) NULL AFTER dosage_form_snapshot,
  ADD COLUMN IF NOT EXISTS refill_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER quantity_unit,
  ADD COLUMN IF NOT EXISTS end_date DATE NULL AFTER start_date;
