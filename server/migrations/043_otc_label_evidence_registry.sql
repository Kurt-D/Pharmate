CREATE TABLE IF NOT EXISTS otc_label_evidence (
  id CHAR(36) NOT NULL DEFAULT (UUID()), drug_id CHAR(36) NOT NULL,
  product_name VARCHAR(255) NULL, registration_number VARCHAR(120) NULL,
  manufacturer VARCHAR(255) NULL, population_key VARCHAR(120) NOT NULL DEFAULT 'ADULT',
  indication_key VARCHAR(160) NULL, label_strength VARCHAR(100) NULL,
  label_dosage_form VARCHAR(100) NULL, directions_text TEXT NULL,
  schedule_type ENUM('FIXED_DAILY','FIXED_INTERVAL','MEAL_ANCHORED','BEDTIME','SHORT_COURSE','PRN_TRACKER') NULL,
  frequency_code VARCHAR(20) NULL, units_per_dose DECIMAL(6,2) NULL,
  min_interval_hours DECIMAL(5,2) NULL, max_daily_doses TINYINT UNSIGNED NULL,
  duration_days SMALLINT UNSIGNED NULL, food_rule VARCHAR(30) NULL,
  minimum_age SMALLINT UNSIGNED NULL, maximum_age SMALLINT UNSIGNED NULL,
  source_authority VARCHAR(120) NULL, source_url VARCHAR(1000) NULL,
  source_revision_date DATE NULL,
  evidence_status ENUM('MISSING','COLLECTED','REVIEWED','READY','REJECTED','RETIRED') NOT NULL DEFAULT 'MISSING',
  evidence_notes VARCHAR(500) NULL, reviewed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id), UNIQUE KEY uq_otc_evidence_variant (drug_id,population_key,indication_key),
  KEY idx_otc_evidence_status (evidence_status),
  CONSTRAINT fk_otc_evidence_drug FOREIGN KEY (drug_id) REFERENCES drug_reference(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO otc_label_evidence
  (drug_id,label_strength,label_dosage_form,source_authority,source_url,
   source_revision_date,evidence_status,evidence_notes)
SELECT drug.id,drug.common_strength,drug.dosage_form,drug.clinical_source_name,
       drug.evidence_source_url,drug.source_revision_date,
       IF(coverage.automation_status IN ('READY_REFERENCE','READY_VERIFIED'),'READY','MISSING'),
       IF(coverage.automation_status IN ('READY_REFERENCE','READY_VERIFIED'),
          'Backfilled from the existing evidence-backed scheduling rule.',
          'Exact registered product label and structured Directions fields are required.')
FROM drug_reference drug
JOIN medication_rule_coverage coverage ON coverage.drug_id=drug.id
WHERE drug.availability=1 AND drug.rx_class='OTC'
  AND NOT EXISTS (SELECT 1 FROM otc_label_evidence evidence
                  WHERE evidence.drug_id=drug.id AND evidence.population_key='ADULT');

CREATE OR REPLACE VIEW otc_rule_evidence_queue AS
SELECT drug.id AS drug_id,drug.generic_name,drug.common_strength,drug.dosage_form,
       evidence.id AS evidence_id,evidence.product_name,evidence.registration_number,
       evidence.population_key,evidence.indication_key,evidence.schedule_type,
       evidence.evidence_status,evidence.source_authority,evidence.source_url,
       evidence.source_revision_date,evidence.evidence_notes,
       coverage.automation_status,coverage.automation_block_reason
FROM drug_reference drug
JOIN medication_rule_coverage coverage ON coverage.drug_id=drug.id
JOIN otc_label_evidence evidence ON evidence.drug_id=drug.id
WHERE drug.availability=1 AND drug.rx_class='OTC';
