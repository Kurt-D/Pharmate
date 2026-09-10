import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { sweepMissed } from '../services/doses.js';
import { computeDoseStatus } from '../services/medicationSchedule.js';
import {
  createPatientTestUser,
  createAccessToken,
  createPrivilegedTestUser,
} from './helpers/testUsers.js';

const password = 'TestPass@123';
let token;
let patientId;
const auth = () => ({ Authorization: `Bearer ${token}` });

async function createMedication(body) {
  return request(app)
    .post('/api/patient/medications')
    .set(auth())
    .send({
      drug_name: 'paracetamol',
      source: 'OTC_SELF',
      dosage_instruction: '1 tablet',
      ...body,
    });
}

beforeAll(async () => {
  const email = `shared-schedule.${Date.now()}@test.pharmate`;
  patientId = await createPatientTestUser({ email, password });
  token = await createAccessToken(patientId);
});

afterAll(async () => pool.end());

test('backend dose status uses the scheduled instant and taken timestamp', () => {
  const now = new Date('2026-09-07T00:00:00Z');
  expect(
    computeDoseStatus({ scheduled_at: '2026-09-07T01:00:00Z', stored_status: 'scheduled' }, now)
  ).toBe('UPCOMING');
  expect(
    computeDoseStatus({ scheduled_at: '2026-09-06T23:45:00Z', stored_status: 'scheduled' }, now)
  ).toBe('DUE');
  expect(
    computeDoseStatus({ scheduled_at: '2026-09-06T23:00:00Z', stored_status: 'scheduled' }, now)
  ).toBe('MISSED');
  expect(
    computeDoseStatus(
      { scheduled_at: '2026-09-06T20:00:00Z', stored_status: 'missed', taken_at: now },
      now
    )
  ).toBe('TAKEN');
});

test('exact times are preserved and one stored schedule drives medication and dashboard views', async () => {
  const created = await createMedication({
    frequency: 'twice daily',
    schedule_type: 'SPECIFIC_TIMES',
    schedule_times: ['08:00', '20:00'],
  });
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({
    schedule_status: 'PENDING_APPROVAL',
    schedule_times: ['08:00', '20:00'],
  });
  await request(app)
    .post('/api/patient/schedule/confirm')
    .set(auth())
    .send({ medication_ids: [created.body.id] })
    .expect(201);

  const medicationDoses = (
    await request(app).get('/api/patient/doses/today').set(auth())
  ).body.filter((dose) => dose.medication_id === created.body.id);
  const dashboardDoses = (
    await request(app).get('/api/patient/dashboard').set(auth())
  ).body.doses.filter((dose) => dose.medication_id === created.body.id);
  expect(medicationDoses.map((dose) => dose.scheduled_at)).toEqual(
    dashboardDoses.map((dose) => dose.scheduled_at)
  );
  expect(
    medicationDoses.map((dose) =>
      new Date(dose.scheduled_at).toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
      })
    )
  ).toEqual(['08:00', '20:00']);

  const first = medicationDoses[0];
  await request(app)
    .post(`/api/patient/doses/${first.dose_id}/log`)
    .set(auth())
    .send({ logged_at: first.scheduled_at, method: 'manual' })
    .expect(201);
  const refreshed = (await request(app).get('/api/patient/doses/today').set(auth())).body;
  expect(refreshed.find((dose) => dose.dose_id === first.dose_id).status).toBe('TAKEN');
  const day = new Date(new Date(first.scheduled_at).getTime() + 8 * 3600000)
    .toISOString()
    .slice(0, 10);
  const history = (
    await request(app).get(`/api/patient/doses/history?startDate=${day}&endDate=${day}`).set(auth())
  ).body;
  expect(history.find((dose) => dose.dose_id === first.dose_id)).toMatchObject({ status: 'TAKEN' });
  const retry = await request(app)
    .post('/api/patient/schedule/confirm')
    .set(auth())
    .send({ medication_ids: [created.body.id] })
    .expect(201);
  expect(retry.body.unchanged).toBe(true);
  const afterRetry = (await request(app).get('/api/patient/doses/today').set(auth())).body.filter(
    (dose) => dose.medication_id === created.body.id
  );
  expect(afterRetry.map((dose) => dose.dose_id)).toEqual(
    medicationDoses.map((dose) => dose.dose_id)
  );
});

test('ambiguous daily frequency remains review-only and creates no dose reminders', async () => {
  const created = await createMedication({ frequency: 'three times daily' });
  expect(created.body.schedule_status).toBe('NEEDS_REVIEW');
  const proposal = await request(app)
    .get(`/api/patient/schedule?medication_ids=${created.body.id}`)
    .set(auth());
  expect(proposal.body.slots).toEqual([]);
  expect(proposal.body.unresolved[0].reason).toMatch(/requires review/i);
  await request(app)
    .post('/api/patient/schedule/confirm')
    .set(auth())
    .send({ medication_ids: [created.body.id] })
    .expect(409);
});

test('explicit interval starts at the entered time instead of a daily-frequency assumption', async () => {
  const created = await createMedication({
    frequency: 'every 8 hours',
    interval_start_time: '06:30',
  });
  expect(created.body).toMatchObject({
    schedule_type: 'EVERY_N_HOURS',
    interval_hours: 8,
    interval_start_time: '06:30',
  });
  const proposal = await request(app)
    .get(`/api/patient/schedule?medication_ids=${created.body.id}`)
    .set(auth());
  expect(proposal.body.slots.map((slot) => slot.time)).toEqual(['06:30', '14:30', '22:30']);
});

test('missed doses stay in range history but another local day is absent from today', async () => {
  const [[dose]] = await pool.execute(
    `SELECT ms.id, ms.scheduled_time FROM medication_schedules ms
      JOIN medications m ON m.id=ms.medication_id
     WHERE ms.patient_id=? AND m.schedule_status='APPROVED' AND ms.status='scheduled'
     ORDER BY ms.scheduled_time DESC LIMIT 1`,
    [patientId]
  );
  const afterWindow = new Date(new Date(dose.scheduled_time).getTime() + 31 * 60000);
  await sweepMissed(afterWindow);
  const day = new Date(new Date(dose.scheduled_time).getTime() + 8 * 3600000)
    .toISOString()
    .slice(0, 10);
  const history = (
    await request(app).get(`/api/patient/doses/history?startDate=${day}&endDate=${day}`).set(auth())
  ).body;
  expect(history.find((item) => item.dose_id === dose.id)?.status).toBe('MISSED');
  const tomorrow = new Date(`${day}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dashboard = (
    await request(app)
      .get(`/api/patient/dashboard?date=${tomorrow.toISOString().slice(0, 10)}`)
      .set(auth())
  ).body;
  expect(dashboard.doses.some((item) => item.dose_id === dose.id)).toBe(false);
});

test('patient, linked caregiver and pharmacist receive the same definitions and dose IDs', async () => {
  const [[patient]] = await pool.execute('SELECT patient_code FROM patients WHERE id=?', [
    patientId,
  ]);
  const caregiverId = await createPrivilegedTestUser({
    email: `schedule-care.${Date.now()}@test.pharmate`,
    password,
    role: 'caregiver',
  });
  const pharmacistId = await createPrivilegedTestUser({
    email: `schedule-pharm.${Date.now()}@test.pharmate`,
    password,
    role: 'pharmacist',
  });
  await pool.execute(
    "INSERT INTO caregiver_patients (caregiver_id,patient_id,status) VALUES (?,?,'active')",
    [caregiverId, patientId]
  );
  const own = await request(app).get('/api/patient/schedule/records').set(auth()).expect(200);
  const care = await request(app)
    .get(`/api/caregiver/patients/${patient.patient_code}/schedule`)
    .set({ Authorization: `Bearer ${await createAccessToken(caregiverId)}` })
    .expect(200);
  const pharmacist = await request(app)
    .get(`/api/pharmacist/patients/${patient.patient_code}/schedule`)
    .set({ Authorization: `Bearer ${await createAccessToken(pharmacistId)}` })
    .expect(200);
  expect(care.body.definitions).toEqual(own.body.definitions);
  expect(pharmacist.body.definitions).toEqual(own.body.definitions);
  expect(care.body.doses.map((dose) => dose.dose_id)).toEqual(
    own.body.doses.map((dose) => dose.dose_id)
  );
  expect(pharmacist.body.doses.map((dose) => dose.dose_id)).toEqual(
    own.body.doses.map((dose) => dose.dose_id)
  );
  expect(
    own.body.definitions.some((definition) => definition.schedule_status === 'NEEDS_REVIEW')
  ).toBe(true);
});

test('historical dose deletion is rejected without erasing its dose log', async () => {
  const [[dose]] = await pool.execute(
    "SELECT ms.id FROM medication_schedules ms WHERE patient_id=? AND status='taken' LIMIT 1",
    [patientId]
  );
  const removed = await request(app)
    .delete('/api/patient/schedule/items')
    .set(auth())
    .send({ schedule_ids: [dose.id] });
  expect(removed.status).toBe(409);
  expect(removed.body.code).toBe('DOSE_HISTORY_PROTECTED');
  const [[logged]] = await pool.execute(
    'SELECT COUNT(*) AS count FROM dose_logs WHERE schedule_id=?',
    [dose.id]
  );
  expect(Number(logged.count)).toBeGreaterThan(0);
});
