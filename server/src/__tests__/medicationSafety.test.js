import { evaluateMedicationSafety, checkSafetyRule } from '../services/medicationSafety.js';
import { encrypt } from '../utils/crypto.js';

const safetyRule = (overrides = {}) => ({
  drug_id: '00000000-0000-4000-8000-000000000001',
  safety_status: 'VERIFIED',
  allergy_terms_json: JSON.stringify(['example ingredient']),
  condition_rules_json: JSON.stringify([
    { term: 'asthma', action: 'REVIEW', message: 'Asthma needs review.' },
  ]),
  minimum_age_years: 18,
  maximum_age_years: null,
  minimum_weight_kg: 50,
  maximum_weight_kg: null,
  age_reviewed: 1,
  weight_reviewed: 1,
  allergies_reviewed: 1,
  conditions_reviewed: 1,
  interactions_reviewed: 1,
  pregnancy_action: 'REVIEW',
  breastfeeding_action: 'REVIEW',
  kidney_action: 'REVIEW',
  liver_action: 'REVIEW',
  source_name: 'Official label',
  source_url: 'https://example.test/label',
  source_revision_date: '2026-01-01',
  ...overrides,
});

test('safety rule completeness is explicit rather than inferred from missing values', () => {
  expect(checkSafetyRule(safetyRule()).valid).toBe(true);
  expect(checkSafetyRule(safetyRule({ interactions_reviewed: 0 }))).toEqual(
    expect.objectContaining({ valid: false, missing_fields: ['interactions_reviewed'] })
  );
});

test('patient safety evaluation blocks allergy, condition, organ, pregnancy, age, weight, and severe interaction risks', () => {
  const result = evaluateMedicationSafety({
    profileRow: {
      date_of_birth: '2015-01-01',
      weight_kg: 30,
      allergies_enc: encrypt('Example ingredient'),
      conditions_enc: encrypt('Asthma'),
      current_medicines_enc: encrypt('Second medicine'),
      kidney_status: 'YES',
      liver_status: 'YES',
      pregnancy_status: 'PREGNANT',
      profile_completed: 1,
    },
    medicines: [
      {
        drug_id: '00000000-0000-4000-8000-000000000001',
        generic_name: 'Example medicine',
      },
    ],
    safetyRules: [safetyRule()],
    interactions: [
      {
        drug_a_id: '00000000-0000-4000-8000-000000000001',
        drug_b_id: '00000000-0000-4000-8000-000000000002',
        interaction_type: 'SPACING',
        severity: 'high',
        min_gap_hours: 4,
        notes: 'High-risk interaction requires pharmacist review.',
        is_verified: 1,
      },
    ],
  });

  expect(result.can_schedule).toBe(false);
  expect(result.warnings.map((item) => item.code)).toEqual(
    expect.arrayContaining([
      'ALLERGY_MATCH',
      'AGE_OUTSIDE_REVIEWED_RANGE',
      'WEIGHT_OUTSIDE_REVIEWED_RANGE',
      'CONDITION_REVIEW_REQUIRED',
      'KIDNEY_REVIEW_REQUIRED',
      'LIVER_REVIEW_REQUIRED',
      'PREGNANCY_REVIEW_REQUIRED',
      'MEDICINE_INTERACTION',
    ])
  );
});

test('known unsigned interactions fail closed and avoid rules block regardless of severity', () => {
  const profileRow = {
    date_of_birth: '1990-01-01',
    weight_kg: 65,
    allergies_enc: encrypt('None known'),
    conditions_enc: encrypt('None known'),
    current_medicines_enc: encrypt('Second medicine'),
    kidney_status: 'NO',
    liver_status: 'NO',
    pregnancy_status: 'NOT_APPLICABLE',
    profile_completed: 1,
  };
  const medicine = {
    drug_id: '00000000-0000-4000-8000-000000000001',
    generic_name: 'Example medicine',
  };
  const unsigned = evaluateMedicationSafety({
    profileRow,
    medicines: [medicine],
    safetyRules: [safetyRule({ minimum_age_years: null, minimum_weight_kg: null })],
    interactions: [
      {
        drug_a_id: medicine.drug_id,
        drug_b_id: '00000000-0000-4000-8000-000000000002',
        interaction_type: 'SPACING',
        severity: 'moderate',
        min_gap_hours: 2,
        is_verified: 0,
      },
    ],
  });
  expect(unsigned).toEqual(
    expect.objectContaining({
      can_schedule: false,
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: 'INTERACTION_RULE_REVIEW_REQUIRED' }),
      ]),
    })
  );

  const avoid = evaluateMedicationSafety({
    profileRow,
    medicines: [medicine],
    safetyRules: [safetyRule({ minimum_age_years: null, minimum_weight_kg: null })],
    interactions: [
      {
        drug_a_id: medicine.drug_id,
        drug_b_id: '00000000-0000-4000-8000-000000000002',
        interaction_type: 'AVOID',
        severity: 'moderate',
        notes: 'Do not combine these medicines.',
        is_verified: 1,
      },
    ],
  });
  expect(avoid.can_schedule).toBe(false);
  expect(avoid.warnings[0].code).toBe('CONTRAINDICATED_INTERACTION');
});

test('breastfeeding action is evaluated independently', () => {
  const result = evaluateMedicationSafety({
    profileRow: {
      date_of_birth: '1990-01-01',
      weight_kg: 65,
      allergies_enc: encrypt('None known'),
      conditions_enc: encrypt('None known'),
      current_medicines_enc: null,
      kidney_status: 'NO',
      liver_status: 'NO',
      pregnancy_status: 'BREASTFEEDING',
      profile_completed: 1,
    },
    medicines: [
      {
        drug_id: '00000000-0000-4000-8000-000000000001',
        generic_name: 'Example medicine',
      },
    ],
    safetyRules: [safetyRule({ minimum_age_years: null, minimum_weight_kg: null })],
    interactions: [],
  });
  expect(result.warnings).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'BREASTFEEDING_REVIEW_REQUIRED' })])
  );
});
