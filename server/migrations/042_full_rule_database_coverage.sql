ALTER TABLE medication_rule_variants
  ADD COLUMN IF NOT EXISTS rule_kind
    ENUM('FIXED_DAILY','FIXED_INTERVAL','MEAL_ANCHORED','BEDTIME','PRN','PATIENT_SPECIFIC','UNKNOWN')
    NOT NULL DEFAULT 'UNKNOWN' AFTER schedule_rule_status,
  ADD COLUMN IF NOT EXISTS automation_status
    ENUM('READY_VERIFIED','READY_REFERENCE','NEEDS_EVIDENCE','NEEDS_DIRECTIONS','MANUAL_ONLY')
    NOT NULL DEFAULT 'NEEDS_EVIDENCE' AFTER rule_kind,
  ADD COLUMN IF NOT EXISTS automation_block_reason VARCHAR(500) NULL AFTER automation_status,
  ADD COLUMN IF NOT EXISTS assessed_at DATETIME(3) NULL AFTER automation_block_reason;

INSERT INTO medication_rule_variants
  (id,drug_id,strength,dosage_form,administration_route,release_type,
   supported_frequency_codes,frequency_code,daily_dose_count,min_interval_hours,
   max_daily_doses,food_rule,bedtime_required,administration_instruction,
   clinical_rationale,guidance_do,guidance_dont,source_name,source_url,
   source_revision_date,evidence_reviewed_at,reviewed_by,verified_at,
   schedule_rule_status,rule_version)
SELECT UUID(),drug.id,NULLIF(drug.common_strength,''),NULLIF(drug.dosage_form,''),
       drug.administration_route,drug.release_type,drug.supported_frequency_codes,
       drug.frequency_default,drug.max_daily_doses,
       COALESCE(drug.min_interval_hours,drug.default_interval_hours),drug.max_daily_doses,
       drug.food_rule,IF(drug.food_rule='BEDTIME',1,0),drug.administration_instruction,
       drug.clinical_rationale,drug.guidance_do,drug.guidance_dont,
       drug.clinical_source_name,drug.evidence_source_url,drug.source_revision_date,
       drug.evidence_reviewed_at,drug.verified_by,drug.verified_at,
       drug.clinical_rule_status,drug.rule_version
FROM drug_reference drug
WHERE drug.availability=1
  AND NOT EXISTS (
    SELECT 1 FROM medication_rule_variants existing WHERE existing.drug_id=drug.id
  );

UPDATE medication_rule_variants rule_row
JOIN drug_reference drug ON drug.id=rule_row.drug_id
SET rule_row.strength=drug.common_strength,
    rule_row.dosage_form=drug.dosage_form,
    rule_row.administration_route=drug.administration_route,
    rule_row.release_type=drug.release_type,
    rule_row.supported_frequency_codes=drug.supported_frequency_codes,
    rule_row.frequency_code=drug.frequency_default,
    rule_row.daily_dose_count=drug.max_daily_doses,
    rule_row.min_interval_hours=COALESCE(drug.min_interval_hours,drug.default_interval_hours),
    rule_row.max_daily_doses=drug.max_daily_doses,
    rule_row.food_rule=drug.food_rule,
    rule_row.bedtime_required=IF(drug.food_rule='BEDTIME',1,0),
    rule_row.administration_instruction=drug.administration_instruction,
    rule_row.clinical_rationale=drug.clinical_rationale,
    rule_row.guidance_do=drug.guidance_do,
    rule_row.guidance_dont=drug.guidance_dont,
    rule_row.source_name=drug.clinical_source_name,
    rule_row.source_url=drug.evidence_source_url,
    rule_row.source_revision_date=drug.source_revision_date,
    rule_row.evidence_reviewed_at=drug.evidence_reviewed_at,
    rule_row.schedule_rule_status=drug.clinical_rule_status,
    rule_row.rule_version=drug.rule_version,
    rule_row.rule_kind=CASE
      WHEN drug.is_prn_default=1 THEN 'PRN'
      WHEN drug.frequency_default='BEDTIME' OR drug.food_rule='BEDTIME' THEN 'BEDTIME'
      WHEN drug.food_rule IN ('WITH_MEAL','BEFORE_MEAL','AFTER_MEAL') THEN 'MEAL_ANCHORED'
      WHEN drug.frequency_default REGEXP '^Q[0-9]+H$' THEN 'FIXED_INTERVAL'
      WHEN drug.frequency_default IN ('QD','BID','TID','QID') THEN 'FIXED_DAILY'
      WHEN drug.rx_class='RX' THEN 'PATIENT_SPECIFIC'
      ELSE 'UNKNOWN'
    END,
    rule_row.automation_status=CASE
      WHEN drug.is_restricted=1 OR UPPER(COALESCE(drug.administration_route,''))='INJECTION'
        THEN 'MANUAL_ONLY'
      WHEN drug.clinical_rule_status='VERIFIED' THEN 'READY_VERIFIED'
      WHEN drug.rx_class='OTC'
           AND drug.clinical_rule_status='IN_REVIEW'
           AND drug.evidence_source_url LIKE 'https://%'
           AND drug.frequency_default IS NOT NULL
           AND drug.max_daily_doses IS NOT NULL
        THEN 'READY_REFERENCE'
      WHEN drug.rx_class='RX' THEN 'NEEDS_DIRECTIONS'
      ELSE 'NEEDS_EVIDENCE'
    END,
    rule_row.automation_block_reason=CASE
      WHEN drug.is_restricted=1 THEN 'Restricted medicine: automatic scheduling disabled.'
      WHEN UPPER(COALESCE(drug.administration_route,''))='INJECTION'
        THEN 'Injection schedule requires clinician-provided directions.'
      WHEN drug.clinical_rule_status='VERIFIED' THEN NULL
      WHEN drug.rx_class='OTC' AND drug.clinical_rule_status='IN_REVIEW'
           AND drug.evidence_source_url LIKE 'https://%'
           AND drug.frequency_default IS NOT NULL
           AND drug.max_daily_doses IS NOT NULL THEN NULL
      WHEN drug.rx_class='RX' THEN 'Prescription directions are required before reminder times can be generated.'
      ELSE 'An exact official label rule has not been curated yet.'
    END,
    rule_row.assessed_at=CURRENT_TIMESTAMP(3);

CREATE OR REPLACE VIEW medication_rule_coverage AS
SELECT drug.id AS drug_id,drug.generic_name,drug.common_strength,drug.dosage_form,
       drug.rx_class,
       COALESCE(rule_row.rule_kind,CASE
         WHEN drug.is_prn_default=1 THEN 'PRN'
         WHEN drug.rx_class='RX' THEN 'PATIENT_SPECIFIC'
         ELSE 'UNKNOWN' END) AS rule_kind,
       COALESCE(rule_row.automation_status,CASE
         WHEN drug.is_restricted=1 OR UPPER(COALESCE(drug.administration_route,''))='INJECTION'
           THEN 'MANUAL_ONLY'
         WHEN drug.rx_class='RX' THEN 'NEEDS_DIRECTIONS'
         ELSE 'NEEDS_EVIDENCE' END) AS automation_status,
       COALESCE(rule_row.automation_block_reason,
         'A structured rule record must be completed in Rule Governance.') AS automation_block_reason,
       COALESCE(rule_row.schedule_rule_status,'UNVERIFIED') AS schedule_rule_status,
       rule_row.source_name,rule_row.source_url,rule_row.rule_version,rule_row.assessed_at
FROM drug_reference drug
LEFT JOIN medication_rule_variants rule_row ON rule_row.drug_id=drug.id
WHERE drug.availability=1;
