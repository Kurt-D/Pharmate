ALTER TABLE medications
  ADD COLUMN purpose VARCHAR(255) NULL AFTER label_direction,
  ADD COLUMN release_type_snapshot VARCHAR(80) NULL AFTER dosage_form_snapshot,
  ADD COLUMN refill_reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER quantity_unit,
  ADD COLUMN end_date DATE NULL AFTER start_date;