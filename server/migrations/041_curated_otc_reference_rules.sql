ALTER TABLE drug_reference
  ADD COLUMN IF NOT EXISTS default_units_per_dose DECIMAL(6,2) NULL AFTER max_daily_doses;

-- These are source-backed OTC reference rules, not pharmacist-verified rules.
-- The engine exposes them as REFERENCE_REVIEW_REQUIRED and requires the patient
-- to confirm that the result matches the exact Drug Facts label before saving.
UPDATE drug_reference
SET clinical_rule_status='IN_REVIEW',
    common_strength='10 mg',
    dosage_form='tablet',
    catalog_status='VERIFIED',
    administration_route='ORAL',
    release_type='IMMEDIATE_RELEASE',
    supported_frequency_codes=JSON_ARRAY('QD'),
    frequency_default='QD',
    min_interval_hours=24,
    max_daily_doses=1,
    default_units_per_dose=1,
    food_rule='NONE',
    administration_instruction='Take one 10 mg tablet once daily. Follow all warnings on the exact package label.',
    clinical_rationale='DailyMed Drug Facts lists one 10 mg tablet once daily and no more than one tablet in 24 hours.',
    guidance_do='Confirm the exact product label. Adults 65 years and over and people with liver or kidney disease should ask a doctor before use.',
    guidance_dont='Do not take more than one 10 mg tablet in 24 hours. Do not use this automatic rule for children under 6 years.',
    evidence_source_url='https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=2942e093-5077-44d3-b080-8d945d03c55f',
    clinical_source_name='DailyMed Drug Facts — Cetirizine Tablets 10 mg',
    source_revision_date='2024-10-01',
    evidence_reviewed_at='2026-09-03',
    rule_version=GREATEST(rule_version,2),
    is_provisional=1
WHERE LOWER(TRIM(generic_name))='cetirizine'
  AND (common_strength IS NULL OR TRIM(common_strength)='' OR LOWER(TRIM(common_strength))='10 mg')
  AND (dosage_form IS NULL OR TRIM(dosage_form)='' OR LOWER(TRIM(dosage_form))='tablet')
  AND rx_class='OTC';

UPDATE drug_reference
SET clinical_rule_status='IN_REVIEW',
    common_strength='10 mg',
    dosage_form='tablet',
    catalog_status='VERIFIED',
    administration_route='ORAL',
    release_type='IMMEDIATE_RELEASE',
    supported_frequency_codes=JSON_ARRAY('QD'),
    frequency_default='QD',
    min_interval_hours=24,
    max_daily_doses=1,
    default_units_per_dose=1,
    food_rule='NONE',
    administration_instruction='Take one 10 mg tablet once daily. Follow all warnings on the exact package label.',
    clinical_rationale='DailyMed Drug Facts lists one 10 mg tablet daily and no more than one tablet in 24 hours.',
    guidance_do='Confirm the exact product label before saving the reminder schedule.',
    guidance_dont='Do not take more than one 10 mg tablet in 24 hours. Children under 6 years should ask a doctor.',
    evidence_source_url='https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=1e92f77f-d4ba-4f34-96f9-daf878b4ea6a&type=pdf',
    clinical_source_name='DailyMed Drug Facts — Loratadine Tablets 10 mg',
    source_revision_date='2022-12-01',
    evidence_reviewed_at='2026-09-03',
    rule_version=GREATEST(rule_version,2),
    is_provisional=1
WHERE LOWER(TRIM(generic_name))='loratadine'
  AND (common_strength IS NULL OR TRIM(common_strength)='' OR LOWER(TRIM(common_strength))='10 mg')
  AND (dosage_form IS NULL OR TRIM(dosage_form)='' OR LOWER(TRIM(dosage_form))='tablet')
  AND rx_class='OTC';

UPDATE drug_reference
SET clinical_rule_status='IN_REVIEW',
    common_strength='20 mg',
    dosage_form='capsule',
    catalog_status='VERIFIED',
    administration_route='ORAL',
    release_type='DELAYED_RELEASE',
    supported_frequency_codes=JSON_ARRAY('QD'),
    frequency_default='QD',
    min_interval_hours=24,
    max_daily_doses=1,
    default_units_per_dose=1,
    food_rule='BEFORE_MEAL',
    administration_instruction='Swallow one 20 mg delayed-release capsule with water before eating in the morning for 14 days. Swallow whole.',
    clinical_rationale='DailyMed OTC Drug Facts lists one capsule every 24 hours before eating in the morning for a 14-day course.',
    guidance_do='Use only for adults 18 years and older with frequent heartburn and confirm the exact product label.',
    guidance_dont='Do not take more than one capsule daily or use longer than 14 days unless directed by a doctor.',
    evidence_source_url='https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=19097902-a5e6-423a-8569-31c569cd3cdb',
    clinical_source_name='DailyMed Drug Facts — Omeprazole Delayed-Release Capsules 20 mg',
    source_revision_date='2024-02-19',
    evidence_reviewed_at='2026-09-03',
    rule_version=GREATEST(rule_version,2),
    is_provisional=1
WHERE LOWER(TRIM(generic_name))='omeprazole'
  AND (common_strength IS NULL OR TRIM(common_strength)='' OR LOWER(TRIM(common_strength))='20 mg')
  AND (dosage_form IS NULL OR TRIM(dosage_form)='' OR LOWER(TRIM(dosage_form))='capsule')
  AND rx_class='OTC';

UPDATE medication_rule_variants variant
JOIN drug_reference drug ON drug.id=variant.drug_id
SET variant.administration_route=drug.administration_route,
    variant.release_type=drug.release_type,
    variant.supported_frequency_codes=drug.supported_frequency_codes,
    variant.frequency_code=drug.frequency_default,
    variant.daily_dose_count=drug.max_daily_doses,
    variant.min_interval_hours=drug.min_interval_hours,
    variant.max_daily_doses=drug.max_daily_doses,
    variant.food_rule=drug.food_rule,
    variant.administration_instruction=drug.administration_instruction,
    variant.clinical_rationale=drug.clinical_rationale,
    variant.guidance_do=drug.guidance_do,
    variant.guidance_dont=drug.guidance_dont,
    variant.source_name=drug.clinical_source_name,
    variant.source_url=drug.evidence_source_url,
    variant.source_revision_date=drug.source_revision_date,
    variant.evidence_reviewed_at=drug.evidence_reviewed_at,
    variant.schedule_rule_status=drug.clinical_rule_status,
    variant.rule_version=drug.rule_version
WHERE LOWER(TRIM(drug.generic_name)) IN ('cetirizine','loratadine','omeprazole');
