-- Legacy data used VERIFIED to mean that a medicine existed in the catalog.
-- Clinical scheduling verification now requires a traceable reviewed source.
UPDATE drug_reference
SET clinical_rule_status = 'UNVERIFIED',
    verified_by = NULL,
    verified_at = NULL,
    is_provisional = 1
WHERE clinical_rule_status = 'VERIFIED'
  AND (
    administration_instruction IS NULL OR TRIM(administration_instruction) = ''
    OR evidence_source_url IS NULL OR evidence_source_url NOT LIKE 'https://%'
    OR clinical_source_name IS NULL OR TRIM(clinical_source_name) = ''
    OR evidence_reviewed_at IS NULL
    OR frequency_default IS NULL OR TRIM(frequency_default) = ''
    OR max_daily_doses IS NULL OR max_daily_doses <= 0
  );
