ALTER TABLE prescription_photos
  ADD COLUMN ocr_text LONGTEXT NULL AFTER redacted_path,
  ADD COLUMN ocr_confidence DECIMAL(5,2) NULL AFTER ocr_text,
  ADD COLUMN schedule_draft_json JSON NULL AFTER ocr_confidence,
  ADD COLUMN review_stage ENUM('prescription','schedule','complete') NOT NULL DEFAULT 'prescription' AFTER schedule_draft_json,
  ADD KEY idx_photo_review_stage (status, review_stage);

ALTER TABLE prescription_validation_audit
  MODIFY event_type ENUM(
    'claimed','released','claim_expired','reclaimed',
    'prescription_approved','schedule_approved','approved','rejected','needs_clearer'
  ) NOT NULL;
