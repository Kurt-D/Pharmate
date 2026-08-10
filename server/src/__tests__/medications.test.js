/**
 * Sprint 3 integration tests — medication encoding.
 *
 * TC-11: restricted-substance redirect  → 403 + "visit nearest branch".
 * D-D:   uncurated drug                 → pending_drug_request, not schedulable.
 * Curated encode + drug picker search.
 *
 * Requires the test DB migrated (001+002) AND the formulary seeded
 * (npm run seed:formulary -- --allow-unverified against pharmate_test).
 */
import request from 'supertest';
import app from '../index.js';

const PATIENT_EMAIL = `patient.s3.${Date.now()}@test.pharmate`;
const PHARM_EMAIL = `pharm.s3.${Date.now()}@test.pharmate`;
const PASSWORD = 'TestPass@123';

let patientToken;
let pharmToken;

beforeAll(async () => {
  await request(app).post('/api/auth/register').send({
    email: PATIENT_EMAIL,
    password: PASSWORD,
    role: 'patient',
    full_name: 'S3 Tester',
  });
  patientToken = (
    await request(app).post('/api/auth/login').send({ email: PATIENT_EMAIL, password: PASSWORD })
  ).body.accessToken;

  await request(app).post('/api/auth/register').send({
    email: PHARM_EMAIL,
    password: PASSWORD,
    role: 'pharmacist',
    full_name: 'Dr S3',
  });
  pharmToken = (
    await request(app).post('/api/auth/login').send({ email: PHARM_EMAIL, password: PASSWORD })
  ).body.accessToken;
});

describe('Drug picker', () => {
  test('search returns curated drugs', async () => {
    const res = await request(app)
      .get('/api/patient/drugs?q=paracetamol')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((d) => d.generic_name === 'paracetamol')).toBe(true);
  });
});

describe('Encode — curated drug', () => {
  test('paracetamol TID encodes with normalized frequency_code', async () => {
    const res = await request(app)
      .post('/api/patient/medications')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ drug_name: 'paracetamol', frequency: 'TID', source: 'OTC_SELF' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    expect(res.body.frequency_code).toBe('TID');
    expect(res.body.drug_id).toBeTruthy();
  });

  test('unrecognized frequency flags needs_frequency_review', async () => {
    const res = await request(app)
      .post('/api/patient/medications')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ drug_name: 'amlodipine', frequency: 'whenever I remember', source: 'OTC_SELF' });
    expect(res.status).toBe(201);
    expect(res.body.frequency_code).toBe('CONSULT');
    expect(res.body.needs_frequency_review).toBe(true);
  });

  test('an OTC drug self-adds as active', async () => {
    const res = await request(app)
      .post('/api/patient/medications')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ drug_name: 'paracetamol', frequency: 'BID', source: 'OTC_SELF' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    expect(res.body.requires_prescription).toBe(false);
  });

  test('an Rx drug labeled OTC is forced into prescription validation (drug class wins)', async () => {
    const res = await request(app)
      .post('/api/patient/medications')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ drug_name: 'amoxicillin', frequency: 'TID', source: 'OTC_SELF' });
    expect(res.status).toBe(201);
    expect(res.body.source).toBe('RX_VALIDATED'); // overridden by the drug's class
    expect(res.body.status).toBe('pending_validation'); // not active — needs validation
    expect(res.body.requires_prescription).toBe(true);
  });
});

describe('TC-11 — restricted-substance redirect', () => {
  test('encoding diazepam is declined with the branch-visit message', async () => {
    const res = await request(app)
      .post('/api/patient/medications')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ drug_name: 'diazepam', frequency: 'BID', source: 'OTC_SELF' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('restricted_substance');
    expect(res.body.redirect).toBe('visit_nearest_branch');
  });

  test('restricted drug is never stored as a medication', async () => {
    const list = await request(app)
      .get('/api/patient/medications')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(list.body.some((m) => /diazepam/i.test(m.drug_name_raw))).toBe(false);
  });
});

describe('D-D — uncurated drug flow', () => {
  let medId;
  // Unique per run so a prior run's curated drug never makes it "known".
  const UNKNOWN_DRUG = `zzz-investigational-${Date.now()}`;

  test('unknown drug creates a pending_drug medication, not schedulable', async () => {
    const res = await request(app)
      .post('/api/patient/medications')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ drug_name: UNKNOWN_DRUG, frequency: 'BID', source: 'OTC_SELF' });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('pending_drug');
    expect(res.body.schedulable).toBe(false);
    medId = res.body.id;
  });

  test('pharmacist curation queue shows the request by patient_code only', async () => {
    const res = await request(app)
      .get('/api/pharmacist/pending-drugs')
      .set('Authorization', `Bearer ${pharmToken}`);
    expect(res.status).toBe(200);
    const row = res.body.find((r) => r.medication_id === medId);
    expect(row).toBeTruthy();
    expect(row.patient_code).toMatch(/^PM-[A-Z0-9]{6}$/);
    // No plaintext patient name anywhere in the queue payload.
    expect(JSON.stringify(res.body)).not.toContain('S3 Tester');
  });

  test('pharmacist can curate the drug, resolving the medication to active', async () => {
    const queue = await request(app)
      .get('/api/pharmacist/pending-drugs')
      .set('Authorization', `Bearer ${pharmToken}`);
    const pendingId = queue.body.find((r) => r.medication_id === medId).id;

    const res = await request(app)
      .post(`/api/pharmacist/pending-drugs/${pendingId}/curate`)
      .set('Authorization', `Bearer ${pharmToken}`)
      .send({
        action: 'approve',
        generic_name: UNKNOWN_DRUG,
        min_interval_hours: 12,
        max_daily_doses: 2,
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('curated');
    expect(res.body.drug_id).toBeTruthy();
  });

  test('a rejected curation cancels the med and hides it from the patient list', async () => {
    const drug = `zzz-rejectme-${Date.now()}`;
    const enc = await request(app)
      .post('/api/patient/medications')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ drug_name: drug, frequency: 'BID', source: 'OTC_SELF' });
    const rejectedMedId = enc.body.id;

    const queue = await request(app)
      .get('/api/pharmacist/pending-drugs')
      .set('Authorization', `Bearer ${pharmToken}`);
    const pendingId = queue.body.find((r) => r.medication_id === rejectedMedId).id;

    const rej = await request(app)
      .post(`/api/pharmacist/pending-drugs/${pendingId}/curate`)
      .set('Authorization', `Bearer ${pharmToken}`)
      .send({ action: 'reject' });
    expect(rej.status).toBe(200);
    expect(rej.body.status).toBe('rejected');

    // The now-cancelled med must not appear in the patient's medications.
    const list = await request(app)
      .get('/api/patient/medications')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(list.body.some((m) => m.id === rejectedMedId)).toBe(false);
  });
});
