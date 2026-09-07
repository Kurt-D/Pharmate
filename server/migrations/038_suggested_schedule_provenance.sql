-- Trace every generated reminder to the pharmacist-verified rule used.
ALTER TABLE medication_schedules
  ADD COLUMN clinical_rule_version INT UNSIGNED NULL AFTER schedule_source,
  ADD COLUMN evidence_source_url VARCHAR(1000) NULL AFTER clinical_rule_version;

CREATE INDEX idx_schedule_clinical_rule_version
  ON medication_schedules (medication_id, clinical_rule_version);
