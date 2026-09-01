-- Evidence-backed administration guidance used by the deterministic reminder
-- scheduler. These fields describe timing only; they never change a prescribed
-- dose or frequency.
ALTER TABLE drug_reference
  ADD COLUMN administration_instruction VARCHAR(500) NULL AFTER meal_instruction,
  ADD COLUMN guidance_do TEXT NULL AFTER administration_instruction,
  ADD COLUMN guidance_dont TEXT NULL AFTER guidance_do,
  ADD COLUMN evidence_source_url VARCHAR(500) NULL AFTER guidance_dont,
  ADD COLUMN evidence_reviewed_at DATE NULL AFTER evidence_source_url;

ALTER TABLE medications
  ADD COLUMN label_direction VARCHAR(500) NULL AFTER dosage_instruction,
  ADD COLUMN food_instruction VARCHAR(255) NULL AFTER label_direction,
  ADD COLUMN timing_note VARCHAR(500) NULL AFTER food_instruction;

-- Official US labeling: acarbose is an oral tablet taken at the start, with
-- the first bite, of a main meal. The patient-entered frequency remains the
-- source of the number of reminders; this rule only anchors those reminders.
UPDATE drug_reference
SET dosage_form = 'tablet',
    common_strength = CASE
      WHEN common_strength IS NULL OR common_strength = '' THEN '25 mg'
      ELSE common_strength
    END,
    meal_instruction = 'with the first bite of a main meal',
    administration_instruction = 'Take at the start of a main meal, with the first bite.',
    guidance_do = 'Follow the prescribed frequency and take each scheduled dose with the first bite of the selected main meal.',
    guidance_dont = 'Do not take an extra dose or change the prescribed dose or frequency in the reminder scheduler.',
    evidence_source_url = 'https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=29939129-7d09-4c22-bf3e-491a8a97f4c4',
    evidence_reviewed_at = '2026-08-29'
WHERE LOWER(TRIM(generic_name)) = 'acarbose';
