-- Safety coverage and administrator evidence workflow for automatic scheduling.
-- Existing clinical rules are intentionally not promoted by this migration.

ALTER TABLE medication_schedules
  MODIFY COLUMN review_requirement ENUM(
    'STANDARD_REVIEW','PRESCRIPTION_MATCH_CONFIRMED','LABEL_MATCH_CONFIRMED','PRESCRIPTION_DIRECTIONS'
  ) NOT NULL DEFAULT 'STANDARD_REVIEW';

ALTER TABLE otc_label_evidence
  ADD COLUMN IF NOT EXISTS evidence_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER evidence_status,
  ADD COLUMN IF NOT EXISTS prepared_by_user_id CHAR(36) NULL AFTER evidence_version,
  ADD COLUMN IF NOT EXISTS submitted_at DATETIME(3) NULL AFTER prepared_by_user_id,
  ADD CONSTRAINT fk_otc_evidence_prepared_by FOREIGN KEY (prepared_by_user_id)
    REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS medication_safety_rules (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  drug_id CHAR(36) NOT NULL,
  population_key VARCHAR(120) NOT NULL DEFAULT 'ADULT',
  allergy_terms_json JSON NULL,
  condition_rules_json JSON NULL,
  minimum_age_years DECIMAL(5,2) NULL,
  maximum_age_years DECIMAL(5,2) NULL,
  minimum_weight_kg DECIMAL(6,2) NULL,
  maximum_weight_kg DECIMAL(6,2) NULL,
  age_reviewed TINYINT(1) NOT NULL DEFAULT 0,
  weight_reviewed TINYINT(1) NOT NULL DEFAULT 0,
  allergies_reviewed TINYINT(1) NOT NULL DEFAULT 0,
  conditions_reviewed TINYINT(1) NOT NULL DEFAULT 0,
  interactions_reviewed TINYINT(1) NOT NULL DEFAULT 0,
  pregnancy_action ENUM('ALLOW','REVIEW','BLOCK') NULL,
  breastfeeding_action ENUM('ALLOW','REVIEW','BLOCK') NULL,
  kidney_action ENUM('ALLOW','REVIEW','BLOCK') NULL,
  liver_action ENUM('ALLOW','REVIEW','BLOCK') NULL,
  source_name VARCHAR(255) NULL,
  source_url VARCHAR(1000) NULL,
  source_revision_date DATE NULL,
  evidence_notes TEXT NULL,
  safety_status ENUM('DRAFT','IN_REVIEW','VERIFIED','REJECTED','RETIRED')
    NOT NULL DEFAULT 'DRAFT',
  rule_version INT UNSIGNED NOT NULL DEFAULT 1,
  prepared_by_user_id CHAR(36) NULL,
  submitted_at DATETIME(3) NULL,
  verified_by CHAR(36) NULL,
  verified_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_medication_safety_population (drug_id,population_key),
  KEY idx_medication_safety_status (safety_status),
  CONSTRAINT fk_medication_safety_drug FOREIGN KEY (drug_id)
    REFERENCES drug_reference(id) ON DELETE CASCADE,
  CONSTRAINT fk_medication_safety_prepared_by FOREIGN KEY (prepared_by_user_id)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_medication_safety_verified_by FOREIGN KEY (verified_by)
    REFERENCES pharmacists(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO medication_safety_rules (drug_id,population_key,allergy_terms_json,evidence_notes)
SELECT drug.id,'ADULT',JSON_ARRAY(LOWER(TRIM(drug.generic_name))),
       'Safety domains must be reviewed and submitted through Rule Governance.'
FROM drug_reference drug
WHERE drug.availability=1
  AND NOT EXISTS (
    SELECT 1 FROM medication_safety_rules safety
    WHERE safety.drug_id=drug.id AND safety.population_key='ADULT'
  );

CREATE TABLE IF NOT EXISTS rule_governance_revisions (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  drug_id CHAR(36) NOT NULL,
  rule_version INT UNSIGNED NOT NULL,
  action ENUM('DRAFT_SAVED','SUBMITTED','RETURNED','RETIRED') NOT NULL,
  before_data JSON NULL,
  after_data JSON NOT NULL,
  validation_result JSON NOT NULL,
  reason VARCHAR(500) NULL,
  actor_user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rule_governance_revision (drug_id,rule_version,created_at),
  CONSTRAINT fk_rule_governance_drug FOREIGN KEY (drug_id)
    REFERENCES drug_reference(id) ON DELETE CASCADE,
  CONSTRAINT fk_rule_governance_actor FOREIGN KEY (actor_user_id)
    REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Keep coverage total even for legacy/imported medicines that predate variant
-- creation. The missing record is surfaced as work, never as eligibility.
CREATE OR REPLACE VIEW medication_rule_coverage AS
SELECT drug.id AS drug_id,drug.generic_name,drug.common_strength,drug.dosage_form,
       drug.rx_class,
       COALESCE(variant.rule_kind,CASE
         WHEN drug.is_prn_default=1 THEN 'PRN'
         WHEN drug.rx_class='RX' THEN 'PATIENT_SPECIFIC'
         ELSE 'UNKNOWN' END) AS rule_kind,
       COALESCE(variant.automation_status,CASE
         WHEN drug.is_restricted=1 OR UPPER(COALESCE(drug.administration_route,''))='INJECTION'
           THEN 'MANUAL_ONLY'
         WHEN drug.rx_class='RX' THEN 'NEEDS_DIRECTIONS'
         ELSE 'NEEDS_EVIDENCE' END) AS automation_status,
       COALESCE(variant.automation_block_reason,
         'A structured rule record must be completed in Rule Governance.') AS automation_block_reason,
       COALESCE(variant.schedule_rule_status,'UNVERIFIED') AS schedule_rule_status,
       variant.source_name,variant.source_url,variant.rule_version,variant.assessed_at
FROM drug_reference drug
LEFT JOIN medication_rule_variants variant ON variant.drug_id=drug.id
WHERE drug.availability=1;

CREATE OR REPLACE VIEW medication_automation_coverage AS
SELECT drug.id AS drug_id,drug.generic_name,drug.common_strength,drug.dosage_form,
       drug.rx_class,drug.clinical_rule_status,drug.rule_version,
       variant.rule_kind,variant.automation_status AS base_automation_status,
       safety.safety_status,safety.rule_version AS safety_rule_version,
       CASE
         WHEN drug.rx_class='RX' THEN 'PATIENT_SPECIFIC_DIRECTIONS'
         WHEN drug.is_restricted=1 OR UPPER(COALESCE(drug.administration_route,''))='INJECTION'
           THEN 'MANUAL_ONLY'
         WHEN variant.automation_status='MANUAL_ONLY' THEN 'MANUAL_ONLY'
         WHEN safety.id IS NULL OR safety.safety_status<>'VERIFIED' THEN 'NEEDS_SAFETY_REVIEW'
         WHEN variant.automation_status='READY_VERIFIED' THEN 'READY_VERIFIED'
         WHEN variant.automation_status='READY_REFERENCE' THEN 'READY_REFERENCE'
         ELSE 'NEEDS_EVIDENCE'
       END AS effective_automation_status,
       CASE
         WHEN drug.rx_class='RX' THEN 'An approved patient prescription is required.'
         WHEN drug.is_restricted=1 OR UPPER(COALESCE(drug.administration_route,''))='INJECTION'
           THEN 'Restricted medicines and injections require clinician-provided directions.'
         WHEN variant.automation_status='MANUAL_ONLY' THEN variant.automation_block_reason
         WHEN safety.id IS NULL OR safety.safety_status<>'VERIFIED'
           THEN 'Every patient-safety domain must be reviewed by a pharmacist.'
         ELSE variant.automation_block_reason
       END AS effective_block_reason
FROM drug_reference drug
LEFT JOIN medication_rule_variants variant ON variant.drug_id=drug.id
LEFT JOIN medication_safety_rules safety
  ON safety.drug_id=drug.id AND safety.population_key='ADULT'
WHERE drug.availability=1;
