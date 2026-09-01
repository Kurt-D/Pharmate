-- One-time formulary rule verification. Catalog presence is intentionally
-- separate from evidence-backed scheduling eligibility.
ALTER TABLE drug_reference
  ADD COLUMN catalog_status ENUM('VERIFIED','INCOMPLETE','RETIRED')
    NOT NULL DEFAULT 'INCOMPLETE' AFTER catalog_source,
  MODIFY COLUMN clinical_rule_status ENUM('UNVERIFIED','IN_REVIEW','VERIFIED','REJECTED')
    NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN clinical_source_name VARCHAR(255) NULL AFTER evidence_source_url,
  ADD COLUMN source_revision_date DATE NULL AFTER clinical_source_name,
  ADD COLUMN rule_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER evidence_reviewed_at,
  ADD COLUMN clinical_rejection_reason VARCHAR(500) NULL AFTER rule_version;

UPDATE drug_reference
SET catalog_status = CASE
  WHEN availability = 0 THEN 'RETIRED'
  WHEN generic_name IS NOT NULL AND generic_name <> ''
   AND common_strength IS NOT NULL AND common_strength <> ''
   AND dosage_form IS NOT NULL AND dosage_form <> '' THEN 'VERIFIED'
  ELSE 'INCOMPLETE'
END;

UPDATE drug_reference
SET clinical_source_name = 'Existing reviewed product-label source'
WHERE clinical_rule_status = 'VERIFIED'
  AND evidence_source_url IS NOT NULL
  AND clinical_source_name IS NULL;

CREATE TABLE clinical_rule_revisions (
  id CHAR(36) NOT NULL,
  drug_id CHAR(36) NOT NULL,
  rule_version INT UNSIGNED NOT NULL,
  action ENUM('SUBMITTED','VERIFIED','REJECTED') NOT NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  consistency_result JSON NOT NULL,
  reason VARCHAR(500) NULL,
  reviewed_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_clinical_revision_drug (drug_id, rule_version),
  CONSTRAINT fk_clinical_revision_drug FOREIGN KEY (drug_id)
    REFERENCES drug_reference(id) ON DELETE CASCADE,
  CONSTRAINT fk_clinical_revision_pharmacist FOREIGN KEY (reviewed_by)
    REFERENCES pharmacists(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE medication_rule_variants (
  id CHAR(36) NOT NULL,
  drug_id CHAR(36) NOT NULL,
  strength VARCHAR(100) NOT NULL,
  dosage_form VARCHAR(100) NOT NULL,
  schedule_rule_status ENUM('UNVERIFIED','IN_REVIEW','VERIFIED','REJECTED')
    NOT NULL DEFAULT 'UNVERIFIED',
  rule_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_medication_rule_variant (drug_id, strength, dosage_form),
  CONSTRAINT fk_medication_rule_variant_drug FOREIGN KEY (drug_id)
    REFERENCES drug_reference(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO medication_rule_variants
  (id, drug_id, strength, dosage_form, schedule_rule_status, rule_version)
SELECT UUID(), id, common_strength, dosage_form, clinical_rule_status, rule_version
FROM drug_reference
WHERE common_strength IS NOT NULL AND common_strength <> ''
  AND dosage_form IS NOT NULL AND dosage_form <> ''
ON DUPLICATE KEY UPDATE schedule_rule_status=VALUES(schedule_rule_status);

CREATE INDEX idx_drug_verification_queue
  ON drug_reference (catalog_status, clinical_rule_status, availability);
