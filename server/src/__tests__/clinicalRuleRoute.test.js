import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createPrivilegedTestUser } from './helpers/testUsers.js';

const PASSWORD = 'TestPass@123';
const email = `clinical.rule.${Date.now()}@test.pharmate`;
let token;
let drugId;

beforeAll(async () => {
  await createPrivilegedTestUser({
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

test('complete rule is verified and creates an immutable revision', async () => {
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
    'SELECT action,reviewed_by FROM clinical_rule_revisions WHERE drug_id=? ORDER BY created_at DESC LIMIT 1',
    [drugId]
  );
  expect(revision.action).toBe('VERIFIED');
  expect(revision.reviewed_by).toBeTruthy();
  const history = await request(app)
    .get(`/api/pharmacist/clinical-rules/${drugId}/revisions`)
    .set(auth());
  expect(history.status).toBe(200);
  expect(history.body[0]).toMatchObject({
    action: 'VERIFIED',
    rule_version: response.body.rule_version,
  });
});
