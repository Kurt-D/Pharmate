-- Preserve whether reminder times were calculated by PharMate or entered by
-- the patient. Existing rows predate this distinction and remain SUGGESTED.
ALTER TABLE medication_schedules
  ADD COLUMN schedule_source ENUM('SUGGESTED','MANUAL')
    NOT NULL DEFAULT 'SUGGESTED' AFTER generated_reason;
