/**
 * Caregiver integration tests — UC-08 (alerts, read) + UC-09 (act on a linked
 * patient's behalf: refill / delivery / medication inquiry). Verifies link
 * scoping, patient_code-only exposure (no PII), UC-09 prescription gating, and
 * that the caregiver is blocked from UC-03/04/06/07 patient routes.
 *
 * Requires the test DB migrated (001–007) and the formulary seeded.
 */
import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';

const PASSWORD = 'TestPass@123';
const stamp = Date.now();
const PATIENT_PII = 'Confidential Caregiver-Test Patient';

let patientToken;
let caregiverToken;
let branchId;
let patientCode;

const auth = (t) => ({ Authorization: `Bearer ${t}` });

async function register(role, extra = {}) {
  const email = `${role}.cg.${stamp}.${Math.random().toString(16).slice(2, 8)}@test.pharmate`;
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, role, ...extra });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { token: login.body.accessToken, id: login.body.user.id };
}

beforeAll(async () => {
  patientToken = (await register('patient', { full_name: PATIENT_PII })).token;
  caregiverToken = (await register('caregiver', { full_name: 'CG Actor' })).token;

  branchId = 'br-cg-' + Math.random().toString(16).slice(2, 8);
  await pool.execute(
    `INSERT INTO pharmacy_branches (id, name, address, services_json) VALUES (?, 'CG Branch', 'X', ?)`,
    [branchId, '["dispensing","delivery"]']
  );

  // Patient generates an invite code; caregiver links with it.
  const invite = await request(app).post('/api/patient/invite').set(auth(patientToken));
  const link = await request(app)
    .post('/api/caregiver/link')
    .set(auth(caregiverToken))
    .send({ code: invite.body.code });
  expect(link.status).toBe(201);
});

afterAll(async () => {
  await pool.end();
});

describe('Linked-patient scope (patient_code only, no PII)', () => {
  test('caregiver lists linked patients by code, never a name', async () => {
    const res = await request(app).get('/api/caregiver/patients').set(auth(caregiverToken));
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    patientCode = res.body[0].patient_code;
    expect(patientCode).toMatch(/^PM-[A-Z0-9]{6}$/);
    expect(JSON.stringify(res.body)).not.toContain(PATIENT_PII);
  });
});

describe('UC-09 — refill / delivery on the patient’s behalf', () => {
  test('an OTC medicine can be refilled for the patient', async () => {
    await request(app)
      .post('/api/patient/medications')
      .set(auth(patientToken))
      .send({ drug_name: 'ibuprofen', frequency: 'BID', source: 'OTC_SELF' });

    const meds = await request(app)
      .get(`/api/caregiver/patients/${patientCode}/medications`)
      .set(auth(caregiverToken));
    expect(meds.status).toBe(200);
    const otc = meds.body.find((m) => m.drug_name_raw === 'ibuprofen');
    expect(otc).toBeTruthy();

    const res = await request(app)
      .post(`/api/caregiver/patients/${patientCode}/refills`)
      .set(auth(caregiverToken))
      .send({ medication_id: otc.id, branch_id: branchId });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
  });

  test('an unvalidated Rx medicine is declined (prescription_required)', async () => {
    // amoxicillin is Rx: it adds as active/schedulable, but the refill gate still
    // requires an approved prescription (none here), so the refill is declined.
    const med = await request(app)
      .post('/api/patient/medications')
      .set(auth(patientToken))
      .send({ drug_name: 'amoxicillin', frequency: 'TID', source: 'OTC_SELF' });

    const res = await request(app)
      .post(`/api/caregiver/patients/${patientCode}/refills`)
      .set(auth(caregiverToken))
      .send({ medication_id: med.body.id, branch_id: branchId });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('prescription_required');
  });

  test('caregiver order history for the patient shows request status', async () => {
    const res = await request(app)
      .get(`/api/caregiver/patients/${patientCode}/orders`)
      .set(auth(caregiverToken));
    expect(res.status).toBe(200);
    expect(res.body.refills.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain(PATIENT_PII);
  });
});

describe('UC-09 — medication inquiry on the patient’s behalf', () => {
  test('caregiver opens an inquiry for the linked patient', async () => {
    const res = await request(app)
      .post(`/api/caregiver/patients/${patientCode}/inquiries`)
      .set(auth(caregiverToken))
      .send({ subject: 'Can this be taken with food?' });
    expect(res.status).toBe(201);
    expect(res.body.thread_id).toBeTruthy();
  });
});

describe('Scope + role enforcement', () => {
  test('acting on a non-linked patient code is refused (404)', async () => {
    const res = await request(app)
      .get('/api/caregiver/patients/PM-ZZZZZZ/medications')
      .set(auth(caregiverToken));
    expect(res.status).toBe(404);
  });

  test('caregiver is blocked from patient routes (UC-03/04/06/07 → 403)', async () => {
    const encode = await request(app)
      .post('/api/patient/medications')
      .set(auth(caregiverToken))
      .send({ drug_name: 'paracetamol', frequency: 'TID', source: 'OTC_SELF' });
    expect(encode.status).toBe(403);

    const schedule = await request(app).get('/api/patient/schedule').set(auth(caregiverToken));
    expect(schedule.status).toBe(403);
  });
});
