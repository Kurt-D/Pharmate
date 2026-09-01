-- Deterministic clinical scheduling metadata. drug_reference remains PharMate's
-- single formulary source; a compatibility view exposes the requested catalog
-- shape without duplicating clinical data.
ALTER TABLE drug_reference
  ADD COLUMN food_rule ENUM(
    'WITH_MEAL','EMPTY_STOMACH','BEFORE_MEAL','AFTER_MEAL','BEDTIME','NONE'
  ) NOT NULL DEFAULT 'NONE' AFTER meal_instruction,
  ADD COLUMN clinical_rationale VARCHAR(500) NULL AFTER food_rule,
  ADD COLUMN clinical_rule_status ENUM('UNVERIFIED','VERIFIED')
    NOT NULL DEFAULT 'UNVERIFIED' AFTER clinical_rationale;

UPDATE drug_reference
SET food_rule = CASE
      WHEN meal_anchor_code = 'AC' THEN 'BEFORE_MEAL'
      WHEN meal_anchor_code = 'PC' THEN 'AFTER_MEAL'
      WHEN meal_anchor_code = 'WITH_MEAL' THEN 'WITH_MEAL'
      WHEN meal_anchor_code = 'HS' THEN 'BEDTIME'
      ELSE 'NONE'
    END,
    clinical_rationale = COALESCE(
      administration_instruction,
      meal_instruction,
      CONCAT('Reminder times follow the verified ', frequency_default, ' interval rule.')
    ),
    clinical_rule_status = CASE
      WHEN is_provisional = 0
       AND frequency_default IS NOT NULL
       AND common_strength IS NOT NULL
       AND dosage_form IS NOT NULL THEN 'VERIFIED'
      ELSE 'UNVERIFIED'
    END;

-- Acarbose timing comes from the official labeling already recorded in
-- migration 027. This sets only reminder anchors; it does not change a dose.
UPDATE drug_reference
SET frequency_default = 'TID',
    max_daily_doses = 3,
    food_rule = 'WITH_MEAL',
    clinical_rationale = 'Official labeling places each dose at the start of a main meal, with the first bite.',
    clinical_rule_status = 'VERIFIED'
WHERE LOWER(TRIM(generic_name)) = 'acarbose'
  AND evidence_source_url IS NOT NULL;

DROP VIEW IF EXISTS medication_catalog;
CREATE VIEW medication_catalog AS
SELECT id,
       generic_name,
       JSON_UNQUOTE(JSON_EXTRACT(brand_names_json, '$[0]')) AS brand_name,
       dosage_form,
       common_strength AS default_strength,
       frequency_default AS standard_frequency,
       food_rule,
       COALESCE(min_interval_hours, default_interval_hours, 0) AS min_interval_hours,
       clinical_rationale,
       clinical_rule_status,
       availability
FROM drug_reference;

CREATE INDEX idx_drug_automation_search
  ON drug_reference (availability, clinical_rule_status, generic_name);
