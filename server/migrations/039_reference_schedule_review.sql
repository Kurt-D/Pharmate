-- Reference schedules are explicitly distinct from pharmacist-verified suggestions.
ALTER TABLE medication_schedules
  MODIFY COLUMN schedule_source ENUM('SUGGESTED','REFERENCE','MANUAL')
    NOT NULL DEFAULT 'SUGGESTED',
  ADD COLUMN review_requirement ENUM('STANDARD_REVIEW','PRESCRIPTION_MATCH_CONFIRMED')
    NOT NULL DEFAULT 'STANDARD_REVIEW' AFTER evidence_source_url;
