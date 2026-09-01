-- Patient-confirmed medication intake shared by manual entry, OCR, suggested
-- schedules and manual schedules. Quantity is inventory information only and
-- must never be used to derive dose frequency.
ALTER TABLE medications
  ADD COLUMN brand_name_snapshot VARCHAR(255) NULL AFTER drug_name_raw,
  ADD COLUMN strength_value DECIMAL(10,3) NULL AFTER brand_name_snapshot,
  ADD COLUMN strength_unit VARCHAR(20) NULL AFTER strength_value,
  ADD COLUMN dosage_form_snapshot VARCHAR(80) NULL AFTER strength_unit,
  ADD COLUMN quantity_on_hand DECIMAL(10,2) NULL AFTER timing_note,
  ADD COLUMN quantity_unit VARCHAR(50) NULL AFTER quantity_on_hand,
  ADD COLUMN entry_method ENUM('MANUAL','OCR') NOT NULL DEFAULT 'MANUAL' AFTER quantity_unit,
  ADD COLUMN ocr_confidence DECIMAL(5,4) NULL AFTER entry_method,
  ADD COLUMN patient_confirmed TINYINT(1) NOT NULL DEFAULT 0 AFTER ocr_confidence;

CREATE INDEX idx_medication_patient_active_drug
  ON medications (patient_id, status, drug_id);
