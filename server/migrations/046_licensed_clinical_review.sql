-- Licensed clinical review and dose-limit snapshots.
-- Existing signatures without an independently recorded credential check are
-- returned to review; this migration never assumes that a license number alone
-- proves a current license.

ALTER TABLE pharmacists
  ADD COLUMN license_jurisdiction VARCHAR(100) NULL AFTER license_number,
  ADD COLUMN license_status ENUM('PENDING','VERIFIED','SUSPENDED','EXPIRED')
    NOT NULL DEFAULT 'PENDING' AFTER license_jurisdiction,
  ADD COLUMN license_expires_on DATE NULL AFTER license_status,
  ADD COLUMN license_evidence_url VARCHAR(1000) NULL AFTER license_expires_on,
  ADD COLUMN license_verified_at DATETIME(3) NULL AFTER license_evidence_url,
  ADD COLUMN license_verified_by CHAR(36) NULL AFTER license_verified_at,
  ADD CONSTRAINT fk_pharmacist_license_verified_by FOREIGN KEY (license_verified_by)
    REFERENCES admins(id) ON DELETE SET NULL;

ALTER TABLE clinical_rule_revisions
  ADD COLUMN reviewer_license_number VARCHAR(100) NULL AFTER reviewed_by,
  ADD COLUMN reviewer_license_jurisdiction VARCHAR(100) NULL
    AFTER reviewer_license_number,
  ADD COLUMN reviewer_license_expires_on DATE NULL
    AFTER reviewer_license_jurisdiction;

ALTER TABLE prescription_photos
  ADD COLUMN reviewer_license_number VARCHAR(100) NULL AFTER pharmacist_id,
  ADD COLUMN reviewer_license_jurisdiction VARCHAR(100) NULL
    AFTER reviewer_license_number;

ALTER TABLE medications
  ADD COLUMN max_daily_doses_snapshot TINYINT UNSIGNED NULL AFTER frequency_code,
  ADD COLUMN min_interval_hours_snapshot DECIMAL(5,2) NULL
    AFTER max_daily_doses_snapshot,
  ADD COLUMN dose_limit_basis ENUM('CLINICAL_RULE','REFERENCE_LABEL','PATIENT_LABEL','PRESCRIPTION_DIRECTIONS')
    NULL AFTER min_interval_hours_snapshot;

-- Fail closed for historical signatures that predate credential verification.
UPDATE drug_reference drug
LEFT JOIN pharmacists pharmacist ON pharmacist.id=drug.verified_by
SET drug.clinical_rule_status='IN_REVIEW',drug.is_provisional=1,
    drug.verified_by=NULL,drug.verified_at=NULL
WHERE drug.clinical_rule_status='VERIFIED'
  AND (pharmacist.id IS NULL OR pharmacist.license_status<>'VERIFIED'
       OR pharmacist.license_verified_at IS NULL
       OR pharmacist.license_expires_on IS NULL
       OR pharmacist.license_expires_on<CURRENT_DATE());

UPDATE medication_safety_rules safety
LEFT JOIN pharmacists pharmacist ON pharmacist.id=safety.verified_by
SET safety.safety_status='IN_REVIEW',safety.verified_by=NULL,safety.verified_at=NULL
WHERE safety.safety_status='VERIFIED'
  AND (pharmacist.id IS NULL OR pharmacist.license_status<>'VERIFIED'
       OR pharmacist.license_verified_at IS NULL
       OR pharmacist.license_expires_on IS NULL
       OR pharmacist.license_expires_on<CURRENT_DATE());

UPDATE drug_interactions interaction_rule
LEFT JOIN pharmacists pharmacist ON pharmacist.id=interaction_rule.verified_by
SET interaction_rule.is_provisional=1
WHERE interaction_rule.is_provisional=0
  AND (pharmacist.id IS NULL OR pharmacist.license_status<>'VERIFIED'
       OR pharmacist.license_verified_at IS NULL
       OR pharmacist.license_expires_on IS NULL
       OR pharmacist.license_expires_on<CURRENT_DATE());

UPDATE medication_rule_variants variant
JOIN drug_reference drug ON drug.id=variant.drug_id
SET variant.schedule_rule_status=drug.clinical_rule_status,
    variant.automation_status='NEEDS_EVIDENCE',
    variant.automation_block_reason='Licensed pharmacist re-review is required.',
    variant.reviewed_by=NULL,variant.verified_at=NULL
WHERE variant.schedule_rule_status='VERIFIED' AND drug.clinical_rule_status<>'VERIFIED';

UPDATE otc_label_evidence evidence
JOIN drug_reference drug ON drug.id=evidence.drug_id
LEFT JOIN medication_safety_rules safety
  ON safety.drug_id=drug.id AND safety.population_key=evidence.population_key
SET evidence.evidence_status='REVIEWED',evidence.reviewed_at=NULL
WHERE evidence.evidence_status='READY'
  AND (drug.clinical_rule_status<>'VERIFIED' OR safety.safety_status<>'VERIFIED');
