import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { calculatePatientDashboard } from '../services/patientDashboard.js';
import { createPrivilegedTestUser } from './helpers/testUsers.js';

const PASSWORD = 'TestPass@123';
const stamp = Date.now();
let patientId;
let patientToken;
let otherPatientId;
let pharmacistToken;

const auth = (token = patientToken) => ({ Authorization: `Bearer ${token}` });

async function registerPatient(label) {
  const email = `${label}.${stamp}@test.pharmate`;
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, role: 'patient', full_name: `Private ${label}` });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { id: login.body.user.id, token: login.body.accessToken };
}

async function addDoses(ownerId, doses, medicineName = 'Dashboard Medicine') {
  const medicationId = uuidv4();
  await pool.execute(
    `INSERT INTO medications
       (id, patient_id, drug_name_raw, source, dosage_instruction, status)
     VALUES (?, ?, ?, 'OTC_SELF', 'Take one tablet', 'active')`,
    [medicationId, ownerId, medicineName]
  );
  for (const dose of doses) {
    await pool.execute(
      `INSERT INTO medication_schedules
         (id, medication_id, patient_id, scheduled_time, generated_reason,
          is_confirmed, schedule_version, status)
       VALUES (?, ?, ?, ?, 'dashboard test', 1, 1, ?)`,
      [uuidv4(), medicationId, ownerId, dose.time, dose.status]
    );
  }
}

beforeAll(async () => {
  const patient = await registerPatient('dashboard.patient');
  patientId = patient.id;
  patientToken = patient.token;
  const other = await registerPatient('dashboard.other');
  otherPatientId = other.id;

  const pharmacistEmail = `dashboard.pharmacist.${stamp}@test.pharmate`;
  await createPrivilegedTestUser({
    email: pharmacistEmail,
    password: PASSWORD,
    role: 'pharmacist',
    fullName: 'Dashboard Pharmacist',
  });
  pharmacistToken = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: pharmacistEmail, password: PASSWORD })
  ).body.accessToken;
});

afterAll(async () => {
  await pool.end();
});

describe('GET /api/patient/dashboard access and empty state', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/patient/dashboard');
    expect(res.status).toBe(401);
  });

  test('rejects an authenticated non-patient role', async () => {
    const res = await request(app).get('/api/patient/dashboard').set(auth(pharmacistToken));
    expect(res.status).toBe(403);
  });

  test('returns an empty, PII-free dashboard with null percentages', async () => {
    const res = await request(app).get('/api/patient/dashboard').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.next_dose).toBeNull();
    expect(res.body.upcoming_doses).toEqual([]);
    expect(res.body.today.adherence_percentage).toBeNull();
    expect(res.body.seven_days.adherence_percentage).toBeNull();
    expect(res.body.current_dose_streak).toBe(0);
    expect(res.body.timezone).toBe('Asia/Manila');
    expect(JSON.stringify(res.body)).not.toContain('Private dashboard.patient');
  });
});

describe('dashboard calculations and dose ordering', () => {
  beforeAll(async () => {
    const now = Date.now();
    await addDoses(patientId, [
      { time: new Date(now - 3 * 60 * 60 * 1000), status: 'missed' },
      { time: new Date(now - 2 * 60 * 60 * 1000), status: 'taken' },
      { time: new Date(now - 1 * 60 * 60 * 1000), status: 'taken_late' },
      { time: new Date(now + 4 * 60 * 60 * 1000), status: 'scheduled' },
      { time: new Date(now + 1 * 60 * 60 * 1000), status: 'scheduled' },
      { time: new Date(now + 3 * 60 * 60 * 1000), status: 'scheduled' },
      { time: new Date(now + 2 * 60 * 60 * 1000), status: 'scheduled' },
    ]);
  });

  test('future doses are excluded from adherence; statuses are counted separately', async () => {
    const { body } = await request(app).get('/api/patient/dashboard').set(auth());
    expect(body.seven_days.eligible_doses).toBe(3);
    expect(body.seven_days).toMatchObject({ taken: 1, taken_late: 1, missed: 1 });
    expect(body.seven_days.adherence_percentage).toBeCloseTo(66.666666, 4);
    expect(body.current_dose_streak).toBe(2);
  });

  test('next dose is the earliest future dose and includes the response fields', async () => {
    const { body } = await request(app).get('/api/patient/dashboard').set(auth());
    expect(body.next_dose.schedule_id).toBeTruthy();
    expect(body.next_dose).toMatchObject({
      medicine_name: 'Dashboard Medicine',
      dosage_instruction: 'Take one tablet',
      status: 'scheduled',
    });
    expect(body.next_dose.scheduled_time).toBe(body.upcoming_doses[0].scheduled_time);
    expect(new Date(body.upcoming_doses[0].scheduled_time).getTime()).toBeLessThan(
      new Date(body.upcoming_doses[1].scheduled_time).getTime()
    );
  });

  test('upcoming doses are limited to three items', async () => {
    const { body } = await request(app).get('/api/patient/dashboard').set(auth());
    expect(body.upcoming_doses).toHaveLength(3);
  });

  test('one patient never receives another patient’s doses', async () => {
    await addDoses(
      otherPatientId,
      [{ time: new Date(Date.now() + 30 * 60 * 1000), status: 'scheduled' }],
      'Other Patient Secret Medicine'
    );
    const { body } = await request(app).get('/api/patient/dashboard').set(auth());
    expect(JSON.stringify(body)).not.toContain('Other Patient Secret Medicine');
  });
});

describe('pure Manila window boundaries', () => {
  const row = (scheduled_time, status) => ({
    schedule_id: uuidv4(),
    scheduled_time,
    status,
    medicine_name: 'Boundary Medicine',
    dosage_instruction: null,
  });

  test('seven-day window includes its lower boundary and excludes the instant before it', () => {
    const now = new Date('2026-08-18T04:00:00.000Z'); // 12:00 on Aug 18 in Manila
    const dashboard = calculatePatientDashboard(
      [
        row(new Date('2026-08-11T16:00:00.000Z'), 'taken'), // Aug 12 00:00 Manila
        row(new Date('2026-08-11T15:59:59.999Z'), 'missed'),
      ],
      now
    );
    expect(dashboard.seven_days).toMatchObject({
      eligible_doses: 1,
      taken: 1,
      missed: 0,
      adherence_percentage: 100,
    });
  });

  test('today reports taken, taken-late, and missed counts', () => {
    const now = new Date('2026-08-18T04:00:00.000Z');
    const dashboard = calculatePatientDashboard(
      [
        row(new Date('2026-08-17T18:00:00.000Z'), 'taken'),
        row(new Date('2026-08-17T19:00:00.000Z'), 'taken_late'),
        row(new Date('2026-08-17T20:00:00.000Z'), 'missed'),
      ],
      now
    );
    expect(dashboard.today).toMatchObject({
      eligible_doses: 3,
      taken: 1,
      taken_late: 1,
      missed: 1,
    });
    expect(dashboard.today.adherence_percentage).toBeCloseTo(66.666666, 4);
  });

  test('future-only rows preserve null adherence percentages', () => {
    const now = new Date('2026-08-18T04:00:00.000Z');
    const dashboard = calculatePatientDashboard(
      [row(new Date('2026-08-18T04:00:00.001Z'), 'scheduled')],
      now
    );
    expect(dashboard.today.adherence_percentage).toBeNull();
    expect(dashboard.seven_days.adherence_percentage).toBeNull();
    expect(dashboard.next_dose).not.toBeNull();
  });
});
