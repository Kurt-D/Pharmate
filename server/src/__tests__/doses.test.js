/**
 * Sprint 6 integration tests — dose logging, the 30-min rule, reflow, offline sync.
 * (UC-05/06/07, TC-03, D-C, D-F.)
 *
 * Requires the test DB migrated (001+002) and formulary seeded.
 */
import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { sweepMissed } from '../services/doses.js';

const EMAIL = `patient.s6.${Date.now()}@test.pharmate`;
const PASSWORD = 'TestPass@123';
let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: EMAIL, password: PASSWORD, role: 'patient', full_name: 'S6 Tester' });
  token = (await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD }))
    .body.accessToken;

  // A curated, active, interval-dosed medication → confirmable schedule.
  await request(app)
    .post('/api/patient/medications')
    .set(auth())
    .send({ drug_name: 'paracetamol', frequency: 'TID', source: 'OTC_SELF', is_prn: false });
  await request(app).post('/api/patient/schedule/confirm').set(auth());
});

afterAll(async () => {
  await pool.end();
});

async function today() {
  return (await request(app).get('/api/patient/doses/today').set(auth())).body;
}

describe('GET /api/patient/doses/today', () => {
  test('returns the confirmed day plan with statuses', async () => {
    const doses = await today();
    expect(doses.length).toBe(3); // paracetamol TID
    doses.forEach((d) => {
      expect(d.schedule_id).toBeTruthy();
      expect(d.status).toBe('scheduled');
    });
  });
});

describe('Dose logging — the 30-min / 2-hour rule (D-C)', () => {
  test('logged within the grace window → taken (TC-03 manual method)', async () => {
    const [dose] = await today();
    const res = await request(app)
      .post(`/api/patient/doses/${dose.schedule_id}/log`)
      .set(auth())
      .send({ logged_at: dose.scheduled_time, method: 'manual' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('taken');

    // Confirmation method is recorded as manual (TC-03).
    const [[log]] = await pool.execute(
      `SELECT confirmation_method FROM dose_logs WHERE schedule_id = ?`,
      [dose.schedule_id]
    );
    expect(log.confirmation_method).toBe('manual');
  });

  test('logged 31 min late → taken_late (never plain taken) + reflow suggestion', async () => {
    const doses = await today();
    const dose = doses[1];
    const late = new Date(new Date(dose.scheduled_time).getTime() + 31 * 60000).toISOString();
    const res = await request(app)
      .post(`/api/patient/doses/${dose.schedule_id}/log`)
      .set(auth())
      .send({ logged_at: late, method: 'manual' });
    expect(res.body.status).toBe('taken_late');
    // Interval drug → reflow of the rest of the day is suggested (ENG §8).
    expect(res.body.reflow).toBeTruthy();
    expect(Array.isArray(res.body.reflow.kept)).toBe(true);
  });

  test('logged beyond 2 h → missed (immutable, cannot become taken)', async () => {
    const doses = await today();
    const dose = doses[2];
    const veryLate = new Date(new Date(dose.scheduled_time).getTime() + 3 * 3600000).toISOString();
    const res = await request(app)
      .post(`/api/patient/doses/${dose.schedule_id}/log`)
      .set(auth())
      .send({ logged_at: veryLate, method: 'manual' });
    expect(res.body.status).toBe('missed');
    expect(res.body.status).not.toBe('taken');
  });
});

describe('Missed sweep — the 30-minute rule', () => {
  test('a dose unconfirmed 31 min past its time is marked missed', async () => {
    // Fresh med + schedule so we have a still-scheduled dose to sweep.
    await request(app)
      .post('/api/patient/medications')
      .set(auth())
      .send({ drug_name: 'amoxicillin', frequency: 'BID', source: 'OTC_SELF', is_prn: false });
    await request(app).post('/api/patient/schedule/confirm').set(auth());

    const doses = await today();
    const scheduled = doses.find((d) => d.status === 'scheduled');
    // Run the sweep as if it were 31 minutes after that dose.
    const when = new Date(new Date(scheduled.scheduled_time).getTime() + 31 * 60000);
    const n = await sweepMissed(when);
    expect(n).toBeGreaterThanOrEqual(1);

    const after = await today();
    expect(after.find((d) => d.schedule_id === scheduled.schedule_id).status).toBe('missed');
  });
});

describe('Offline outbox sync (D-F)', () => {
  test('20 offline logs apply once, re-sync is all duplicates', async () => {
    await request(app)
      .post('/api/patient/medications')
      .set(auth())
      .send({ drug_name: 'losartan', frequency: 'QD', source: 'OTC_SELF', is_prn: false });
    await request(app).post('/api/patient/schedule/confirm').set(auth());
    const doses = await today();
    const scheduleIds = doses.map((d) => d.schedule_id);

    // 20 logs with distinct client ids, cycling across the available doses.
    const logs = Array.from({ length: 20 }, (_, i) => ({
      log_id: `s6-outbox-${Date.now()}-${i}`,
      schedule_id: scheduleIds[i % scheduleIds.length],
      logged_at: doses[i % doses.length].scheduled_time,
      method: 'local',
    }));

    const first = await request(app).post('/api/patient/doses/sync').set(auth()).send({ logs });
    expect(first.body.applied).toBe(20);
    expect(first.body.duplicates).toBe(0);

    const second = await request(app).post('/api/patient/doses/sync').set(auth()).send({ logs });
    expect(second.body.applied).toBe(0);
    expect(second.body.duplicates).toBe(20);
  });
});
