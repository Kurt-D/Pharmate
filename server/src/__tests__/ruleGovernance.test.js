import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createAccessToken, createPrivilegedTestUser } from './helpers/testUsers.js';

const PASSWORD = 'TestPass@123';
const auth = (token) => ({ Authorization: `Bearer ${token}` });

afterAll(async () => {
  await pool.end();
});

test('admin can save and submit versioned OTC evidence without clinically verifying it', async () => {
  const suffix = Date.now();
  const adminId = await createPrivilegedTestUser({
    email: `rule.admin.${suffix}@test.pharmate`,
    password: PASSWORD,
    role: 'admin',
  });
  const token = await createAccessToken(adminId);
  const listing = await request(app).get('/api/admin/rule-governance').set(auth(token));
  expect(listing.status).toBe(200);
  const medicine = listing.body.medicines.find((item) => item.rx_class === 'OTC');
  expect(medicine).toBeTruthy();

  const payload = {
    common_strength: medicine.common_strength || '500 mg',
    dosage_form: medicine.dosage_form || 'tablet',
    administration_route: 'ORAL',
    release_type: 'IMMEDIATE_RELEASE',
    supported_frequency_codes: ['QD'],
    frequency_default: 'QD',
    max_daily_doses: 1,
    min_interval_hours: 24,
    food_rule: 'NONE',
    administration_instruction: 'Follow the exact product label.',
    clinical_rationale: 'Once-daily reminder based on the cited product label.',
    guidance_do: 'Follow the product label.',
    guidance_dont: 'Do not exceed the product label.',
    directions_text: 'Take one tablet once daily.',
    schedule_type: 'FIXED_DAILY',
    units_per_dose: 1,
    evidence_source_url: 'https://dailymed.nlm.nih.gov/dailymed/',
    clinical_source_name: 'DailyMed test label',
    source_revision_date: '2026-01-01',
    evidence_reviewed_at: '2026-09-01',
    allergy_terms: [medicine.generic_name],
    condition_rules: [],
    minimum_age_years: 18,
    maximum_age_years: '',
    minimum_weight_kg: '',
    maximum_weight_kg: '',
    age_reviewed: true,
    weight_reviewed: true,
    allergies_reviewed: true,
    conditions_reviewed: true,
    interactions_reviewed: true,
    pregnancy_action: 'REVIEW',
    breastfeeding_action: 'REVIEW',
    kidney_action: 'REVIEW',
    liver_action: 'REVIEW',
    safety_source_name: 'DailyMed test label',
    safety_source_url: 'https://dailymed.nlm.nih.gov/dailymed/',
    safety_source_revision_date: '2026-01-01',
    safety_evidence_notes: 'All patient-safety domains reviewed from the cited label.',
  };
  const draft = await request(app)
    .put(`/api/admin/rule-governance/${medicine.id}`)
    .set(auth(token))
    .send({ ...payload, action: 'SAVE_DRAFT' });
  expect(draft.status).toBe(200);
  expect(draft.body.status).toBe('UNVERIFIED');

  const submitted = await request(app)
    .put(`/api/admin/rule-governance/${medicine.id}`)
    .set(auth(token))
    .send({ ...payload, action: 'SUBMIT' });
  expect(submitted.status).toBe(200);
  expect(submitted.body.status).toBe('IN_REVIEW');
  const [[stored]] = await pool.execute(
    `SELECT drug.clinical_rule_status,safety.safety_status
     FROM drug_reference drug JOIN medication_safety_rules safety ON safety.drug_id=drug.id
     WHERE drug.id=?`,
    [medicine.id]
  );
  expect(stored).toEqual(
    expect.objectContaining({ clinical_rule_status: 'IN_REVIEW', safety_status: 'IN_REVIEW' })
  );
  const history = await request(app)
    .get(`/api/admin/rule-governance/${medicine.id}/history`)
    .set(auth(token));
  expect(history.status).toBe(200);
  expect(history.body.map((item) => item.action)).toEqual(
    expect.arrayContaining(['DRAFT_SAVED', 'SUBMITTED'])
  );

  const pharmacistId = await createPrivilegedTestUser({
    email: `rule.pharmacist.${suffix}@test.pharmate`,
    password: PASSWORD,
    role: 'pharmacist',
    fullName: 'Rule Governance Pharmacist',
  });
  const pharmacistToken = await createAccessToken(pharmacistId);
  const verified = await request(app)
    .post(`/api/pharmacist/clinical-rules/${medicine.id}/decision`)
    .set(auth(pharmacistToken))
    .send({ ...payload, action: 'VERIFY' });
  expect(verified.status).toBe(200);
  expect(verified.body.status).toBe('VERIFIED');
  const [[verifiedSafety]] = await pool.execute(
    'SELECT safety_status,verified_by FROM medication_safety_rules WHERE drug_id=?',
    [medicine.id]
  );
  expect(verifiedSafety).toEqual(
    expect.objectContaining({ safety_status: 'VERIFIED', verified_by: pharmacistId })
  );

  const credentials = await request(app)
    .get('/api/admin/pharmacist-credentials')
    .set(auth(token));
  const pharmacistCredential = credentials.body.pharmacists.find(
    (item) => item.id === pharmacistId
  );
  expect(pharmacistCredential).toEqual(
    expect.objectContaining({ license_status: 'VERIFIED', license_number: 'TEST-LICENSE' })
  );
  await request(app)
    .put(`/api/admin/pharmacist-credentials/${pharmacistId}`)
    .set(auth(token))
    .send({
      ...pharmacistCredential,
      license_expires_on: String(pharmacistCredential.license_expires_on).slice(0, 10),
      license_status: 'SUSPENDED',
    })
    .expect(200);
  const blockedDecision = await request(app)
    .post(`/api/pharmacist/clinical-rules/${medicine.id}/decision`)
    .set(auth(pharmacistToken))
    .send({ ...payload, action: 'RETIRE', reason: 'Credential suspension gate test.' });
  expect(blockedDecision.status).toBe(403);
});
