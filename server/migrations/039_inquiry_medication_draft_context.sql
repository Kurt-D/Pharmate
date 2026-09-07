ALTER TABLE inquiry_threads
  ADD COLUMN medication_draft_key VARCHAR(120) NULL AFTER subject,
  ADD INDEX idx_inquiry_medication_draft (patient_id, medication_draft_key);
