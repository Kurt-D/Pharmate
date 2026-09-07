import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../index.js';
import { pool } from '../db/connection.js';
import {
  createAccessToken,
  createPatientTestUser,
  createPrivilegedTestUser,
} from './helpers/testUsers.js';

const PASSWORD = 'TestPass@123';
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const stamp = Date.now();
let patientId;
let patientToken;
let pharmacistId;
let pharmacistToken;
let branchId;

beforeAll(async () => {
  patientId = await createPatientTestUser({
    email: `appointment.patient.${stamp}@test.pharmate`,
    password: PASSWORD,
  });
  patientToken = await createAccessToken(patientId);
  pharmacistId = await createPrivilegedTestUser({
    email: `appointment.pharmacist.${stamp}@test.pharmate`,
    password: PASSWORD,
    role: 'pharmacist',
    fullName: 'Test Counseling Pharmacist',
  });
  pharmacistToken = await createAccessToken(pharmacistId);
  branchId = uuidv4();
  await pool.execute(
    `INSERT INTO pharmacy_branches (id,name,address,services_json)
     VALUES (?,'Virtual Counseling Test Branch','Test address',?)`,
    [branchId, JSON.stringify(['consultation', 'dispensing'])]
  );
  await pool.execute('UPDATE pharmacists SET branch_id=? WHERE id=?', [branchId, pharmacistId]);
  await pool.execute(
    `INSERT INTO medications
       (id,patient_id,drug_name_raw,source,frequency,dosage_instruction,status)
     VALUES (?,?,?,'RX_VALIDATED','twice daily','Take one 500 mg tablet twice daily.','active')`,
    [uuidv4(), patientId, 'Example medicine']
  );
});

afterAll(async () => pool.end());

function future(minutes = 180) {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

async function requestAppointment(start = future()) {
  return request(app).post('/api/patient/appointments').set(auth(patientToken)).send({
    branch_id: branchId,
    topic: 'POST_DISPENSING',
    modality: 'VIDEO',
    duration_minutes: 30,
    scheduled_start_at: start,
  });
}

test('patient requests a virtual follow-up and pharmacist queue stays pseudonymous', async () => {
  const created = await requestAppointment();
  expect(created.status).toBe(201);
  const queue = await request(app).get('/api/pharmacist/appointments').set(auth(pharmacistToken));
  expect(queue.status).toBe(200);
  const item = queue.body.find((appointment) => appointment.id === created.body.id);
  expect(item.patient_code).toMatch(/^PM-[A-Z0-9]{6}$/);
  expect(JSON.stringify(item)).not.toContain(`appointment.patient.${stamp}`);
});

test('confirmation requires secure session details and blocks overlapping appointments', async () => {
  const start = future(360);
  const first = await requestAppointment(start);
  const invalid = await request(app)
    .post(`/api/pharmacist/appointments/${first.body.id}/decision`)
    .set(auth(pharmacistToken))
    .send({ action: 'CONFIRM', meeting_url: 'http://insecure.example.test' });
  expect(invalid.status).toBe(400);
  const confirmed = await request(app)
    .post(`/api/pharmacist/appointments/${first.body.id}/decision`)
    .set(auth(pharmacistToken))
    .send({ action: 'CONFIRM', meeting_url: 'https://meet.example.test/session' });
  expect(confirmed.status).toBe(200);
  expect(confirmed.body.status).toBe('CONFIRMED');

  const second = await requestAppointment(
    new Date(new Date(start).getTime() + 10 * 60000).toISOString()
  );
  const conflict = await request(app)
    .post(`/api/pharmacist/appointments/${second.body.id}/decision`)
    .set(auth(pharmacistToken))
    .send({ action: 'CONFIRM', meeting_url: 'https://meet.example.test/overlap' });
  expect(conflict.status).toBe(409);
});

test('completion creates a draft that becomes patient-visible only after pharmacist review', async () => {
  const created = await requestAppointment(future(720));
  await request(app)
    .post(`/api/pharmacist/appointments/${created.body.id}/decision`)
    .set(auth(pharmacistToken))
    .send({ action: 'CONFIRM', meeting_url: 'https://meet.example.test/counseling' })
    .expect(200);
  const completed = await request(app)
    .post(`/api/pharmacist/appointments/${created.body.id}/complete`)
    .set(auth(pharmacistToken));
  expect(completed.status).toBe(200);

  const beforePublish = await request(app)
    .get('/api/patient/counseling-summaries')
    .set(auth(patientToken));
  expect(
    beforePublish.body.find((summary) => summary.id === completed.body.summary_id)
  ).toBeFalsy();

  const reviewedText = [
    'Pharmacist-reviewed post-dispensing counseling summary.',
    'Example medicine: Take one 500 mg tablet twice daily.',
    'Contact the pharmacy if the printed label is different. This is not a medical guarantee.',
  ].join('\n');
  await request(app)
    .put(`/api/pharmacist/counseling-summaries/${completed.body.summary_id}`)
    .set(auth(pharmacistToken))
    .send({ summary_text: reviewedText })
    .expect(200);
  await request(app)
    .post(`/api/pharmacist/counseling-summaries/${completed.body.summary_id}/publish`)
    .set(auth(pharmacistToken))
    .expect(200);

  const published = await request(app)
    .get('/api/patient/counseling-summaries')
    .set(auth(patientToken));
  expect(published.body.find((summary) => summary.id === completed.body.summary_id)).toEqual(
    expect.objectContaining({ summary_text: reviewedText, template_version: 'COUNSELING_V1' })
  );
  const [[stored]] = await pool.execute(
    'SELECT status,reviewer_license_number FROM counseling_summaries WHERE id=?',
    [completed.body.summary_id]
  );
  expect(stored).toEqual(
    expect.objectContaining({ status: 'PUBLISHED', reviewer_license_number: 'TEST-LICENSE' })
  );
});

test('patient can cancel only an open appointment', async () => {
  const created = await requestAppointment(future(1000));
  const cancelled = await request(app)
    .post(`/api/patient/appointments/${created.body.id}/cancel`)
    .set(auth(patientToken));
  expect(cancelled.body.status).toBe('CANCELLED');
  expect(
    (
      await request(app)
        .post(`/api/patient/appointments/${created.body.id}/cancel`)
        .set(auth(patientToken))
    ).status
  ).toBe(409);
});
