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
let patientId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: EMAIL, password: PASSWORD, role: 'patient', full_name: 'S6 Tester' });
  token = (await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD }))
    .body.accessToken;
  const [[patient]] = await pool.execute('SELECT id FROM users WHERE email=?', [EMAIL]);
  patientId = patient.id;

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

  test('does not include taken or missed history from another day', async () => {
    const [dose] = await today();
    const futureId = `future-${Date.now()}`;
    await pool.execute(
      `INSERT INTO medication_schedules
       (id,medication_id,patient_id,scheduled_time,generated_reason,is_confirmed,schedule_version,status)
       SELECT ?,medication_id,patient_id,DATE_ADD(scheduled_time, INTERVAL 1 DAY),
              'future boundary test',1,schedule_version,'taken'
         FROM medication_schedules WHERE id=?`,
      [futureId, dose.schedule_id]
    );
    const result = await today();
    expect(result.some((item) => item.schedule_id === futureId)).toBe(false);
    await pool.execute('DELETE FROM medication_schedules WHERE id=?', [futureId]);
  });

  test('keeps active medicines and upcoming reminders in sync', async () => {
    const [dose] = await today();
    await pool.execute("UPDATE medications SET status='completed' WHERE id=?", [
      dose.medication_id,
    ]);

    const medicineList = await request(app).get('/api/patient/medications').set(auth()).expect(200);
    expect(medicineList.body.some((medicine) => medicine.id === dose.medication_id)).toBe(false);

    const currentDoses = await today();
    expect(
      currentDoses.some(
        (item) =>
          item.medication_id === dose.medication_id &&
          ['scheduled', 'snoozed'].includes(item.status)
      )
    ).toBe(false);

    const day = new Date(new Date(dose.scheduled_time).getTime() + 8 * 3600000)
      .toISOString()
      .slice(0, 10);
    const calendar = await request(app)
      .get(`/api/patient/doses/calendar?date=${day}&status=upcoming`)
      .set(auth())
      .expect(200);
    expect(calendar.body.some((item) => item.medication_id === dose.medication_id)).toBe(false);

    await pool.execute("UPDATE medications SET status='active' WHERE id=?", [dose.medication_id]);
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

  test('calendar can show only taken doses for the selected day', async () => {
    const doses = await today();
    const takenDose = doses.find((item) => item.status === 'taken');
    const day = new Date(new Date(takenDose.scheduled_time).getTime() + 8 * 3600000)
      .toISOString()
      .slice(0, 10);
    const res = await request(app)
      .get(`/api/patient/doses/calendar?date=${day}&status=taken`)
      .set(auth())
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((item) => ['taken', 'taken_late'].includes(item.status))).toBe(true);
    expect(res.body[0].logged_at).toBeTruthy();
  });

  test('taken doses are read-only and have no edit endpoint', async () => {
    const dose = (await today()).find((item) => item.status === 'taken');
    await request(app)
      .patch(`/api/patient/doses/${dose.schedule_id}/taken`)
      .set(auth())
      .send({ logged_at: dose.logged_at })
      .expect(404);
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
  test('one offline dose applies once and re-sync is idempotent', async () => {
    const suffix = Date.now();
    const medicationId = `sync-med-${suffix}`.slice(0, 36);
    const scheduleId = `sync-dose-${suffix}`.slice(0, 36);
    const scheduledTime = new Date();
    await pool.execute(
      `INSERT INTO medications
       (id,patient_id,drug_name_raw,source,is_prn,frequency,frequency_code,status,
        max_daily_doses_snapshot,min_interval_hours_snapshot,dose_limit_basis)
       VALUES (?,?,'Offline sync test','OTC_SELF',0,'twice daily','BID','active',2,1,'PATIENT_LABEL')`,
      [medicationId, patientId]
    );
    await pool.execute(
      `INSERT INTO medication_schedules
       (id,medication_id,patient_id,scheduled_time,generated_reason,is_confirmed,
        schedule_version,status)
       VALUES (?,?,?,?,'offline sync test',1,98,'scheduled')`,
      [scheduleId, medicationId, patientId, scheduledTime]
    );
    const logs = [
      {
        log_id: `s6-outbox-${Date.now()}`,
        schedule_id: scheduleId,
        logged_at: scheduledTime.toISOString(),
        method: 'local',
      },
    ];

    const first = await request(app).post('/api/patient/doses/sync').set(auth()).send({ logs });
    expect(first.body.applied).toBe(1);
    expect(first.body.duplicates).toBe(0);
    expect(first.body.rejected).toBe(0);

    const second = await request(app).post('/api/patient/doses/sync').set(auth()).send({ logs });
    expect(second.body.applied).toBe(0);
    expect(second.body.duplicates).toBe(1);
  });
});

describe('Dose-limit enforcement', () => {
  test('blocks a second taken event when it would exceed the 24-hour maximum', async () => {
    const suffix = Date.now();
    const medicationId = `limit-med-${suffix}`.slice(0, 36);
    const firstId = `limit-dose-a-${suffix}`.slice(0, 36);
    const secondId = `limit-dose-b-${suffix}`.slice(0, 36);
    const firstTime = new Date();
    const secondTime = new Date(firstTime.getTime() + 12 * 3600000);
    await pool.execute(
      `INSERT INTO medications
       (id,patient_id,drug_name_raw,source,is_prn,frequency,frequency_code,status,
        max_daily_doses_snapshot,min_interval_hours_snapshot,dose_limit_basis)
       VALUES (?,?,'Dose limit test','OTC_SELF',0,'once daily','QD','active',1,1,'PATIENT_LABEL')`,
      [medicationId, patientId]
    );
    await pool.execute(
      `INSERT INTO medication_schedules
       (id,medication_id,patient_id,scheduled_time,generated_reason,is_confirmed,
        schedule_version,status)
       VALUES (?, ?, ?, ?, 'dose limit test',1,99,'scheduled'),
              (?, ?, ?, ?, 'dose limit test',1,99,'scheduled')`,
      [firstId, medicationId, patientId, firstTime, secondId, medicationId, patientId, secondTime]
    );

    await request(app)
      .post(`/api/patient/doses/${firstId}/log`)
      .set(auth())
      .send({ logged_at: firstTime.toISOString(), method: 'manual' })
      .expect(201);
    const blocked = await request(app)
      .post(`/api/patient/doses/${secondId}/log`)
      .set(auth())
      .send({ logged_at: secondTime.toISOString(), method: 'manual' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.max_daily_doses).toBe(1);

    const repeated = await request(app)
      .post(`/api/patient/doses/${firstId}/log`)
      .set(auth())
      .send({ logged_at: firstTime.toISOString(), method: 'manual', log_id: `repeat-${suffix}` });
    expect(repeated.status).toBe(409);
    expect(repeated.body.error).toMatch(/already has a recorded dose/i);
  });
});
