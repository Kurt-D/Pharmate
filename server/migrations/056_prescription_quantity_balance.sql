ALTER TABLE prescription_photos
  ADD COLUMN prescribed_quantity INT UNSIGNED NULL AFTER ocr_confidence;
