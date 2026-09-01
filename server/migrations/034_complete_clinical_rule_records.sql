-- Complete, evidence-traceable rule records for every active catalog medicine.
-- This migration creates records only; it never promotes an unverified rule.
ALTER TABLE drug_reference
  MODIFY COLUMN clinical_rule_status ENUM('UNVERIFIED','IN_REVIEW','VERIFIED','REJECTED','RETIRED')
    NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN administration_route VARCHAR(50) NULL AFTER dosage_form,
  ADD COLUMN release_type ENUM('IMMEDIATE_RELEASE','EXTENDED_RELEASE','DELAYED_RELEASE','NOT_APPLICABLE','UNKNOWN')
    NULL AFTER administration_route,
  ADD COLUMN supported_frequency_codes JSON NULL AFTER frequency_default;

ALTER TABLE clinical_rule_revisions
  MODIFY COLUMN action ENUM('SUBMITTED','VERIFIED','REJECTED','RETIRED') NOT NULL;

ALTER TABLE medication_rule_variants
  MODIFY COLUMN strength VARCHAR(100) NULL,
  MODIFY COLUMN dosage_form VARCHAR(100) NULL,
  MODIFY COLUMN schedule_rule_status ENUM('UNVERIFIED','IN_REVIEW','VERIFIED','REJECTED','RETIRED')
    NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN administration_route VARCHAR(50) NULL AFTER dosage_form,
  ADD COLUMN release_type ENUM('IMMEDIATE_RELEASE','EXTENDED_RELEASE','DELAYED_RELEASE','NOT_APPLICABLE','UNKNOWN')
    NULL AFTER administration_route,
  ADD COLUMN supported_frequency_codes JSON NULL AFTER release_type,
  ADD COLUMN frequency_code VARCHAR(20) NULL AFTER supported_frequency_codes,
  ADD COLUMN daily_dose_count TINYINT UNSIGNED NULL AFTER frequency_code,
  ADD COLUMN min_interval_hours DECIMAL(5,2) NULL AFTER daily_dose_count,
  ADD COLUMN max_daily_doses TINYINT UNSIGNED NULL AFTER min_interval_hours,
  ADD COLUMN food_rule VARCHAR(30) NULL AFTER max_daily_doses,
  ADD COLUMN bedtime_required TINYINT(1) NOT NULL DEFAULT 0 AFTER food_rule,
  ADD COLUMN administration_instruction TEXT NULL AFTER bedtime_required,
  ADD COLUMN clinical_rationale TEXT NULL AFTER administration_instruction,
  ADD COLUMN guidance_do TEXT NULL AFTER clinical_rationale,
  ADD COLUMN guidance_dont TEXT NULL AFTER guidance_do,
  ADD COLUMN source_name VARCHAR(255) NULL AFTER guidance_dont,
  ADD COLUMN source_url VARCHAR(1000) NULL AFTER source_name,
  ADD COLUMN source_revision_date DATE NULL AFTER source_url,
  ADD COLUMN evidence_reviewed_at DATE NULL AFTER source_revision_date,
  ADD COLUMN reviewed_by CHAR(36) NULL AFTER evidence_reviewed_at,
  ADD COLUMN verified_at DATETIME(3) NULL AFTER reviewed_by,
  ADD CONSTRAINT fk_medication_rule_variant_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES pharmacists(id) ON DELETE SET NULL;

-- Preserve the one existing evidence-backed Acarbose label rule with explicit
-- formulation metadata taken from its stored official product-label record.
UPDATE drug_reference
SET administration_route='ORAL',
    release_type='IMMEDIATE_RELEASE',
    supported_frequency_codes=JSON_ARRAY('TID')
WHERE LOWER(TRIM(generic_name))='acarbose'
  AND clinical_rule_status='VERIFIED'
  AND evidence_source_url LIKE 'https://%';

-- Legacy verified rows without the new required variant metadata are no longer
-- eligible for automatic rule-based scheduling.
UPDATE drug_reference
SET clinical_rule_status='UNVERIFIED', verified_by=NULL, verified_at=NULL, is_provisional=1
WHERE clinical_rule_status='VERIFIED'
  AND (administration_route IS NULL OR release_type IS NULL
       OR supported_frequency_codes IS NULL OR JSON_LENGTH(supported_frequency_codes)=0
       OR clinical_rationale IS NULL OR TRIM(clinical_rationale)=''
       OR guidance_do IS NULL OR TRIM(guidance_do)=''
       OR guidance_dont IS NULL OR TRIM(guidance_dont)=''
       OR source_revision_date IS NULL);

INSERT INTO medication_rule_variants
  (id,drug_id,strength,dosage_form,administration_route,release_type,
   supported_frequency_codes,frequency_code,daily_dose_count,min_interval_hours,
   max_daily_doses,food_rule,bedtime_required,administration_instruction,
   clinical_rationale,guidance_do,guidance_dont,source_name,source_url,
   source_revision_date,evidence_reviewed_at,reviewed_by,verified_at,
   schedule_rule_status,rule_version)
SELECT UUID(),dr.id,NULLIF(dr.common_strength,''),NULLIF(dr.dosage_form,''),
       dr.administration_route,dr.release_type,dr.supported_frequency_codes,
       dr.frequency_default,dr.max_daily_doses,
       COALESCE(dr.min_interval_hours,dr.default_interval_hours),dr.max_daily_doses,
       dr.food_rule,IF(dr.food_rule='BEDTIME',1,0),dr.administration_instruction,
       dr.clinical_rationale,dr.guidance_do,dr.guidance_dont,dr.clinical_source_name,
       dr.evidence_source_url,dr.source_revision_date,dr.evidence_reviewed_at,
       dr.verified_by,dr.verified_at,dr.clinical_rule_status,dr.rule_version
FROM drug_reference dr
WHERE dr.availability=1
  AND NOT EXISTS (SELECT 1 FROM medication_rule_variants existing WHERE existing.drug_id=dr.id);

UPDATE medication_rule_variants variant
JOIN drug_reference dr ON dr.id=variant.drug_id
SET variant.administration_route=dr.administration_route,
    variant.release_type=dr.release_type,
    variant.supported_frequency_codes=dr.supported_frequency_codes,
    variant.frequency_code=dr.frequency_default,
    variant.daily_dose_count=dr.max_daily_doses,
    variant.min_interval_hours=COALESCE(dr.min_interval_hours,dr.default_interval_hours),
    variant.max_daily_doses=dr.max_daily_doses,
    variant.food_rule=dr.food_rule,
    variant.bedtime_required=IF(dr.food_rule='BEDTIME',1,0),
    variant.administration_instruction=dr.administration_instruction,
    variant.clinical_rationale=dr.clinical_rationale,
    variant.guidance_do=dr.guidance_do,
    variant.guidance_dont=dr.guidance_dont,
    variant.source_name=dr.clinical_source_name,
    variant.source_url=dr.evidence_source_url,
    variant.source_revision_date=dr.source_revision_date,
    variant.evidence_reviewed_at=dr.evidence_reviewed_at,
    variant.reviewed_by=dr.verified_by,
    variant.verified_at=dr.verified_at,
    variant.schedule_rule_status=dr.clinical_rule_status,
    variant.rule_version=dr.rule_version;
