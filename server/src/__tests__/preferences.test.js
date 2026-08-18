import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { raiseMissedAlerts } from '../services/alerts.js';
import { buildReminderPayload, dueReminders } from '../services/reminders.js';
import { createPrivilegedTestUser } from './helpers/testUsers.js';

const PASSWORD = 'TestPass@123';
const stamp = Date.now();
const auth = (token) => ({ Authorization: `Bearer ${token}` });
let patientA;
let patientB;
let caregiverToken;
let caregiverId;

async function patient(label) {
  const email = `${label}.prefs.${stamp}@test.pharmate`;
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, role: 'patient' });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { id: login.body.user.id, token: login.body.accessToken };
}

beforeAll(async () => {
  patientA = await patient('a');
  patientB = await patient('b');
  const email = `caregiver.prefs.${stamp}@test.pharmate`;
  caregiverId = await createPrivilegedTestUser({ email, password: PASSWORD, role: 'caregiver' });
  caregiverToken = (
    await request(app).post('/api/auth/login').send({ email, password: PASSWORD })
  ).body.accessToken;
});

afterAll(async () => {
  await pool.end();
});

describe('patient preference authorization and defaults', () => {
  test('authentication and patient role are required', async () => {
    expect((await request(app).get('/api/patient/preferences')).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/patient/preferences')
          .set(auth(caregiverToken))
      ).status
    ).toBe(403);
  });

  test('new patients receive complete secure defaults', async () => {
    const res = await request(app).get('/api/patient/preferences').set(auth(patientA.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      reminders_enabled: true,
      voice_enabled: true,
      voice_detail: 'private',
      vibration_enabled: true,
      reminder_lead_minutes: 0,
      caregiver_missed_alerts_enabled: true,
      lock_screen_detail: 'private',
      timezone: 'Asia/Manila',
    });
  });
});

describe('strict partial updates and isolation', () => {
  test('a partial update returns the complete object without resetting other fields', async () => {
    const res = await request(app)
      .put('/api/patient/preferences')
      .set(auth(patientA.token))
      .send({ reminder_lead_minutes: 20, timezone: 'Asia/Tokyo' });
    expect(res.status).toBe(200);
    expect(res.body.reminder_lead_minutes).toBe(20);
    expect(res.body.timezone).toBe('Asia/Tokyo');
    expect(res.body.voice_detail).toBe('private');
    expect(res.body.reminders_enabled).toBe(true);
  });

  test('unknown fields, invalid types, enums, ranges, and timezones are rejected', async () => {
    const invalid = [
      { mystery: true },
      { reminders_enabled: 'true' },
      { voice_detail: 'always' },
      { reminder_lead_minutes: -1 },
      { reminder_lead_minutes: 61 },
      { reminder_lead_minutes: 2.5 },
      { timezone: 'Mars/Olympus_Mons' },
    ];
    for (const body of invalid) {
      const res = await request(app)
        .put('/api/patient/preferences')
        .set(auth(patientA.token))
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  test('one patient cannot read or overwrite another patient preferences', async () => {
    await request(app)
      .put('/api/patient/preferences')
      .set(auth(patientB.token))
      .send({ vibration_enabled: false });
    const a = await request(app).get('/api/patient/preferences').set(auth(patientA.token));
    const b = await request(app).get('/api/patient/preferences').set(auth(patientB.token));
    expect(a.body.vibration_enabled).toBe(true);
    expect(b.body.vibration_enabled).toBe(false);
  });
});

describe('privacy-aware reminder and caregiver behavior', () => {
  const baseReminder = {
    schedule_id: 'schedule-1',
    scheduled_time: new Date('2026-08-18T02:00:00.000Z'),
    drug_name: 'SecretMedicine',
    timezone: 'Asia/Manila',
    vibration_enabled: true,
    voice_enabled: true,
  };

  test('private payload omits the medicine name', () => {
    const payload = buildReminderPayload({
      ...baseReminder,
      voice_detail: 'private',
      lock_screen_detail: 'private',
    });
    expect(JSON.stringify(payload)).not.toContain('SecretMedicine');
    expect(payload.data.voice_text).toBe('It is time for your medicine.');
  });

  test('explicit opt-in includes the medicine name in voice and lock-screen text', () => {
    const payload = buildReminderPayload({
      ...baseReminder,
      voice_detail: 'medicine_name',
      lock_screen_detail: 'medicine_name',
    });
    expect(payload.body).toContain('SecretMedicine');
    expect(payload.data.voice_text).toContain('SecretMedicine');
  });

  test('disabled reminders are not generated', async () => {
    await request(app)
      .put('/api/patient/preferences')
      .set(auth(patientA.token))
      .send({ reminders_enabled: false });
    const medId = `prefs-med-${stamp}`;
    const scheduleId = `prefs-schedule-${stamp}`;
    await pool.execute(
      `INSERT INTO medications (id, patient_id, drug_name_raw, source, status)
       VALUES (?, ?, 'SecretMedicine', 'OTC_SELF', 'active')`,
      [medId, patientA.id]
    );
    await pool.execute(
      `INSERT INTO medication_schedules
         (id, medication_id, patient_id, scheduled_time, generated_reason, is_confirmed)
       VALUES (?, ?, ?, ?, 'test', 1)`,
      [scheduleId, medId, patientA.id, new Date()]
    );
    const due = await dueReminders(new Date());
    expect(due.some((item) => item.schedule_id === scheduleId)).toBe(false);
  });

  test('disabled caregiver missed alerts create no alert', async () => {
    await pool.execute(
      `INSERT INTO caregiver_patients (id, caregiver_id, patient_id) VALUES (?, ?, ?)`,
      [`prefs-link-${stamp}`, caregiverId, patientA.id]
    );
    await request(app)
      .put('/api/patient/preferences')
      .set(auth(patientA.token))
      .send({ caregiver_missed_alerts_enabled: false });
    const created = await raiseMissedAlerts(patientA.id, null);
    expect(created).toBe(0);
    const [[count]] = await pool.execute(
      `SELECT COUNT(*) AS count FROM caregiver_alerts WHERE patient_id = ?`,
      [patientA.id]
    );
    expect(Number(count.count)).toBe(0);
  });
});
