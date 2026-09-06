import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createPrivilegedTestUser } from './helpers/testUsers.js';

const PASSWORD = 'TestPass@123';
const email = `clinical.rule.${Date.now()}@test.pharmate`;
let token;
let drugId;
let pharmacistId;

beforeAll(async () => {
  pharmacistId = await createPrivilegedTestUser({
    email,
    password: PASSWORD,
    role: 'pharmacist',
    fullName: 'Clinical Rule Reviewer',
  });
  token = (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body
    .accessToken;
  const [[drug]] = await pool.execute(
    "SELECT id FROM drug_reference WHERE LOWER(generic_name)='cetirizine' LIMIT 1"
  );
  drugId = drug.id;
  await pool.execute(
    `UPDATE drug_reference SET common_strength='10 mg',dosage_form='tablet',
     catalog_status='VERIFIED',clinical_rule_status='UNVERIFIED' WHERE id=?`,
    [drugId]
  );
});

afterAll(async () => pool.end());

const auth = () => ({ Authorization: `Bearer ${token}` });

test('verification report separates catalog and schedule status', async () => {
  const response = await request(app).get('/api/pharmacist/clinical-rules/report').set(auth());
  expect(response.status).toBe(200);
  expect(response.body.summary.total).toBeGreaterThan(0);
  expect(response.body.summary).toHaveProperty('catalog_verified');
  expect(response.body.summary).toHaveProperty('schedule_verified');
  expect(response.body.summary).toHaveProperty('rule_records');
  expect(response.body.summary).toHaveProperty('missing_rule_records');
});

test('incomplete rule cannot be marked verified', async () => {
  const response = await request(app)
    .post(`/api/pharmacist/clinical-rules/${drugId}/decision`)
    .set(auth())
    .send({ action: 'VERIFY', common_strength: '10 mg', dosage_form: 'tablet' });
  expect(response.status).toBe(422);
  expect(response.body.consistency.missing_fields).toContain('evidence_source_url');
});

test('a pharmacist role without a current verified credential cannot sign clinical decisions', async () => {
  await pool.execute("UPDATE pharmacists SET license_status='PENDING' WHERE id=?", [pharmacistId]);
  const response = await request(app)
    .post(`/api/pharmacist/clinical-rules/${drugId}/decision`)
    .set(auth())
    .send({ action: 'VERIFY' });
  expect(response.status).toBe(403);
  expect(response.body.credential).toEqual(
    expect.objectContaining({ credential_valid: false, license_status: 'PENDING' })
  );
  await pool.execute(
    "UPDATE pharmacists SET license_status='VERIFIED',license_verified_at=NOW(3) WHERE id=?",
    [pharmacistId]
  );
});

test('complete rule is verified and creates an immutable revision', async () => {
  await pool.execute(
    `UPDATE medication_safety_rules
     SET allergy_terms_json=JSON_ARRAY('cetirizine'),condition_rules_json=JSON_ARRAY(),
         minimum_age_years=18,maximum_age_years=NULL,minimum_weight_kg=NULL,maximum_weight_kg=NULL,
         age_reviewed=1,weight_reviewed=1,allergies_reviewed=1,conditions_reviewed=1,
         interactions_reviewed=1,pregnancy_action='REVIEW',breastfeeding_action='REVIEW',
         kidney_action='REVIEW',liver_action='REVIEW',source_name='Official regulator label',
         source_url='https://regulator.example/cetirizine-label',source_revision_date='2026-01-01',
         evidence_notes='All safety domains reviewed.',safety_status='IN_REVIEW'
     WHERE drug_id=? AND population_key='ADULT'`,
    [drugId]
  );
  const response = await request(app)
    .post(`/api/pharmacist/clinical-rules/${drugId}/decision`)
    .set(auth())
    .send({
      action: 'VERIFY',
      common_strength: '10 mg',
      dosage_form: 'tablet',
      administration_route: 'ORAL',
      release_type: 'IMMEDIATE_RELEASE',
      supported_frequency_codes: ['QD'],
      frequency_default: 'QD',
      default_units_per_dose: 1,
      max_daily_doses: 1,
      min_interval_hours: 24,
      food_rule: 'NONE',
      administration_instruction: 'Follow the reviewed product label.',
      clinical_rationale: 'Reminder timing follows the reviewed label.',
      guidance_do: 'Follow the medicine label.',
      guidance_dont: 'Do not change the dose.',
      evidence_source_url: 'https://regulator.example/cetirizine-label',
      clinical_source_name: 'Official regulator label',
      source_revision_date: '2026-01-01',
      evidence_reviewed_at: '2026-08-30',
    });
  expect(response.status).toBe(200);
  expect(response.body.status).toBe('VERIFIED');
  const [[revision]] = await pool.execute(
    `SELECT action,reviewed_by,reviewer_license_number,reviewer_license_jurisdiction
     FROM clinical_rule_revisions WHERE drug_id=? ORDER BY created_at DESC LIMIT 1`,
    [drugId]
  );
  expect(revision.action).toBe('VERIFIED');
  expect(revision.reviewed_by).toBeTruthy();
  expect(revision.reviewer_license_number).toBe('TEST-LICENSE');
  expect(revision.reviewer_license_jurisdiction).toBe('TEST');
  const history = await request(app)
    .get(`/api/pharmacist/clinical-rules/${drugId}/revisions`)
    .set(auth());
  expect(history.status).toBe(200);
  expect(history.body[0]).toMatchObject({
    action: 'VERIFIED',
    rule_version: response.body.rule_version,
  });
});
