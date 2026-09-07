import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { sweepMissed } from '../services/doses.js';
import { computeDoseStatus } from '../services/medicationSchedule.js';

const password = 'TestPass@123';
let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

async function createMedication(body) {
  return request(app).post('/api/patient/medications').set(auth()).send({
    drug_name: 'paracetamol', source: 'OTC_SELF', dosage_instruction: '1 tablet', ...body,
  });
}

beforeAll(async () => {
  const email = `shared-schedule.${Date.now()}@test.pharmate`;
  await request(app).post('/api/auth/register').send({ email, password, role: 'patient', full_name: 'Schedule Test' });
  token = (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;
});

afterAll(async () => pool.end());

test('backend dose status uses the scheduled instant and taken timestamp', () => {
  const now = new Date('2026-09-07T00:00:00Z');
  expect(computeDoseStatus({ scheduled_at: '2026-09-07T01:00:00Z', stored_status: 'scheduled' }, now)).toBe('UPCOMING');
  expect(computeDoseStatus({ scheduled_at: '2026-09-06T23:45:00Z', stored_status: 'scheduled' }, now)).toBe('DUE');
  expect(computeDoseStatus({ scheduled_at: '2026-09-06T23:00:00Z', stored_status: 'scheduled' }, now)).toBe('MISSED');
  expect(computeDoseStatus({ scheduled_at: '2026-09-06T20:00:00Z', stored_status: 'missed', taken_at: now }, now)).toBe('TAKEN');
});

test('exact times are preserved and one stored schedule drives medication and dashboard views', async () => {
  const created = await createMedication({
    frequency: 'twice daily', schedule_type: 'SPECIFIC_TIMES', schedule_times: ['08:00', '20:00'],
  });
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ schedule_status: 'PENDING_APPROVAL', schedule_times: ['08:00', '20:00'] });
  await request(app).post('/api/patient/schedule/confirm').set(auth()).send({ medication_ids: [created.body.id] }).expect(201);

  const medicationDoses = (await request(app).get('/api/patient/doses/today').set(auth())).body
    .filter((dose) => dose.medication_id === created.body.id);
  const dashboardDoses = (await request(app).get('/api/patient/dashboard').set(auth())).body.doses
    .filter((dose) => dose.medication_id === created.body.id);
  expect(medicationDoses.map((dose) => dose.scheduled_at)).toEqual(dashboardDoses.map((dose) => dose.scheduled_at));
  expect(medicationDoses.map((dose) => new Date(dose.scheduled_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }))).toEqual(['08:00', '20:00']);

  const first = medicationDoses[0];
  await request(app).post(`/api/patient/doses/${first.dose_id}/log`).set(auth())
    .send({ logged_at: first.scheduled_at, method: 'manual' }).expect(201);
  const refreshed = (await request(app).get('/api/patient/doses/today').set(auth())).body;
  expect(refreshed.find((dose) => dose.dose_id === first.dose_id).status).toBe('TAKEN');
  const day = new Date(new Date(first.scheduled_at).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const history = (await request(app).get(`/api/patient/doses/history?startDate=${day}&endDate=${day}`).set(auth())).body;
  expect(history.find((dose) => dose.dose_id === first.dose_id)).toMatchObject({ status: 'TAKEN' });
});

test('ambiguous daily frequency remains review-only and creates no dose reminders', async () => {
  const created = await createMedication({ frequency: 'three times daily' });
  expect(created.body.schedule_status).toBe('NEEDS_REVIEW');
  const proposal = await request(app).get(`/api/patient/schedule?medication_ids=${created.body.id}`).set(auth());
  expect(proposal.body.slots).toEqual([]);
  expect(proposal.body.unresolved[0].reason).toMatch(/requires review/i);
  await request(app).post('/api/patient/schedule/confirm').set(auth())
    .send({ medication_ids: [created.body.id] }).expect(409);
});

test('explicit interval starts at the entered time instead of a daily-frequency assumption', async () => {
  const created = await createMedication({ frequency: 'every 8 hours', interval_start_time: '06:30' });
  expect(created.body).toMatchObject({ schedule_type: 'EVERY_N_HOURS', interval_hours: 8, interval_start_time: '06:30' });
  const proposal = await request(app).get(`/api/patient/schedule?medication_ids=${created.body.id}`).set(auth());
  expect(proposal.body.slots.map((slot) => slot.time)).toEqual(['06:30', '14:30', '22:30']);
});

test('missed doses stay in range history but another local day is absent from today', async () => {
  const [[dose]] = await pool.execute(
    `SELECT ms.id, ms.scheduled_time FROM medication_schedules ms
      JOIN medications m ON m.id=ms.medication_id
     WHERE m.schedule_status='APPROVED' AND ms.status='scheduled' ORDER BY ms.scheduled_time DESC LIMIT 1`
  );
  const afterWindow = new Date(new Date(dose.scheduled_time).getTime() + 31 * 60000);
  await sweepMissed(afterWindow);
  const day = new Date(new Date(dose.scheduled_time).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const history = (await request(app).get(`/api/patient/doses/history?startDate=${day}&endDate=${day}`).set(auth())).body;
  expect(history.find((item) => item.dose_id === dose.id)?.status).toBe('MISSED');
  const tomorrow = new Date(`${day}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dashboard = (await request(app).get(`/api/patient/dashboard?date=${tomorrow.toISOString().slice(0, 10)}`).set(auth())).body;
  expect(dashboard.doses.some((item) => item.dose_id === dose.id)).toBe(false);
});
