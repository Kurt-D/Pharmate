import { checkClinicalRule, verificationSummary } from '../services/clinicalRuleVerification.js';

const validRule = {
  generic_name: 'Example medicine', common_strength: '500 mg', dosage_form: 'tablet',
  administration_route: 'ORAL', release_type: 'IMMEDIATE_RELEASE',
  supported_frequency_codes: ['BID'],
  frequency_default: 'BID', max_daily_doses: 2, min_interval_hours: 8,
  food_rule: 'NONE', administration_instruction: 'Follow the reviewed product label.',
  clinical_rationale: 'Timing follows the reviewed label.',
  guidance_do: 'Follow the label.', guidance_dont: 'Do not change the dose.',
  evidence_source_url: 'https://regulator.example/label',
  clinical_source_name: 'Official regulator label', source_revision_date: '2026-01-01',
  evidence_reviewed_at: '2026-08-30',
  catalog_status: 'VERIFIED', clinical_rule_status: 'VERIFIED',
};

test('a complete evidence-backed rule passes consistency checks', () => {
  expect(checkClinicalRule(validRule)).toEqual({ valid: true, missing_fields: [], conflicts: [] });
});

test('catalog presence alone cannot verify a scheduling rule', () => {
  const result = checkClinicalRule({
    generic_name: 'Catalog only', common_strength: '10 mg', dosage_form: 'tablet',
    catalog_status: 'VERIFIED',
  });
  expect(result.valid).toBe(false);
  expect(result.missing_fields).toEqual(expect.arrayContaining([
    'frequency_default', 'administration_instruction', 'evidence_source_url',
  ]));
});

test('contradictory interval and unsupported evidence are rejected', () => {
  const result = checkClinicalRule({
    ...validRule, frequency_default: 'Q8H', min_interval_hours: 12,
    evidence_source_url: 'http://untrusted.example/label',
  });
  expect(result.conflicts).toEqual(expect.arrayContaining([
    'minimum_interval_exceeds_frequency_interval', 'evidence_url_must_use_https',
  ]));
});

test('verification report keeps catalog and schedule counts separate', () => {
  const summary = verificationSummary([
    validRule,
    { ...validRule, clinical_rule_status: 'UNVERIFIED', evidence_source_url: null },
  ]);
  expect(summary).toMatchObject({ total: 2, catalog_verified: 2, schedule_verified: 1, unverified: 1 });
  expect(summary.missing_evidence).toBe(1);
});
