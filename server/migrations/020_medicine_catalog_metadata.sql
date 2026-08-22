-- Display metadata imported from the patient-facing medicine reference catalog.
-- These fields are informational only and never generate a dose or schedule.
ALTER TABLE drug_reference
  ADD COLUMN therapeutic_category VARCHAR(150) NULL AFTER category,
  ADD COLUMN drug_class VARCHAR(150) NULL AFTER therapeutic_category,
  ADD COLUMN common_uses TEXT NULL AFTER drug_class,
  ADD COLUMN short_description TEXT NULL AFTER common_uses,
  ADD COLUMN common_strength VARCHAR(100) NULL AFTER short_description,
  ADD COLUMN dosage_form VARCHAR(100) NULL AFTER common_strength,
  ADD COLUMN catalog_source VARCHAR(255) NULL AFTER dosage_form;

CREATE INDEX idx_drug_rx_category ON drug_reference (rx_class, therapeutic_category);
