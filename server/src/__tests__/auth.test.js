/**
 * Sprint 2 integration tests
 *
 * TC-06: role-based access control — patient hitting a pharmacist endpoint gets 403.
 * PII grep: staff-facing responses must never contain plaintext PII values.
 *
 * These tests run against a real MySQL test database (same schema as prod).
 * The CI workflow seeds the DB via migrations before running tests.
 */
import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createPrivilegedTestUser } from './helpers/testUsers.js';

// Plaintext PII values we will register with — must never appear in any staff response
const TEST_PII = {
  full_name: 'Juan Dela Cruz Sprint2Test',
  contact_num: '09991234567',
  address: '123 Test Street, Pasig',
  medical_condition: 'Hypertension Sprint2Test',
};

const PATIENT_EMAIL = `patient.s2test.${Date.now()}@test.pharmate`;
const PHARMACIST_EMAIL = `pharm.s2test.${Date.now()}@test.pharmate`;
const PASSWORD = 'TestPass@123';

let patientToken;
let pharmacistToken;
let adminToken;

afterAll(async () => {
  await pool.end();
});

beforeAll(async () => {
  // Register and log in a patient
  await request(app)
    .post('/api/auth/register')
    .send({
      email: PATIENT_EMAIL,
      password: PASSWORD,
      role: 'patient',
      ...TEST_PII,
    });
  await pool.execute('UPDATE users SET is_verified=1,email_verified_at=NOW(3) WHERE email=?', [
    PATIENT_EMAIL,
  ]);
  const patRes = await request(app).post('/api/auth/login').send({
    email: PATIENT_EMAIL,
    password: PASSWORD,
  });
  patientToken = patRes.body.accessToken;

  // Staff accounts are provisioned internally, never through public registration.
  await createPrivilegedTestUser({
    email: PHARMACIST_EMAIL,
    password: PASSWORD,
    role: 'pharmacist',
    fullName: 'Test Pharmacist',
  });
  const pharmRes = await request(app).post('/api/auth/login').send({
    email: PHARMACIST_EMAIL,
    password: PASSWORD,
  });
  pharmacistToken = pharmRes.body.accessToken;
  const adminEmail = `admin.s2test.${Date.now()}@test.pharmate`;
  await createPrivilegedTestUser({ email: adminEmail, password: PASSWORD, role: 'admin' });
  adminToken = (
    await request(app).post('/api/auth/login').send({ email: adminEmail, password: PASSWORD })
  ).body.accessToken;
});

// ── TC-06: role-based access control ─────────────────────────────────────────
describe('TC-06 — role-based access control', () => {
  test('patient hitting POST /api/pharmacist/validate receives 403', async () => {
    const res = await request(app)
      .post('/api/pharmacist/validate')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  test('unauthenticated request to patient route receives 401', async () => {
    const res = await request(app).get('/api/patient/anchors');
    expect(res.status).toBe(401);
  });

  test('pharmacist cannot access patient-only anchor endpoint (403)', async () => {
    const res = await request(app)
      .get('/api/patient/anchors')
      .set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(403);
  });
});

// ── PII grep: staff responses must not contain plaintext PII ─────────────────
describe('PII containment — staff responses must not expose plaintext PII', () => {
  const piiValues = Object.values(TEST_PII);

  function assertNoPII(body) {
    const bodyStr = JSON.stringify(body);
    for (const pii of piiValues) {
      expect(bodyStr).not.toContain(pii);
    }
  }

  test('pharmacist login response contains no patient PII', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: PHARMACIST_EMAIL,
      password: PASSWORD,
    });
    assertNoPII(res.body);
  });

  test('health endpoint contains no patient PII', async () => {
    const res = await request(app).get('/api/health');
    assertNoPII(res.body);
  });
});

// ── Auth happy paths ──────────────────────────────────────────────────────────
describe('Auth — register and login', () => {
  test.each(['pharmacist', 'admin'])(
    'public registration rejects %s self-registration without creating a user',
    async (role) => {
      const email = `${role}.self-register.${Date.now()}@test.pharmate`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email, password: PASSWORD, role });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/patients and caregivers/i);
      const [users] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
      expect(users).toHaveLength(0);
    }
  );

  test('caregiver can register publicly and receives a caregiver profile', async () => {
    const email = `caregiver.register.${Date.now()}@test.pharmate`;
    const res = await request(app)
      .post('/api/auth/register')
      .set('x-test-email-verification', 'required')
      .send({
        email,
        password: PASSWORD,
        role: 'caregiver',
        full_name: 'Caregiver Test',
      });

    expect(res.status).toBe(201);
    expect(res.body.verificationRequired).toBe(true);
    const [profiles] = await pool.execute(
      `SELECT c.id, cp.caregiver_id
       FROM caregivers c
       JOIN caregiver_profiles cp ON cp.caregiver_id = c.id
       WHERE c.id = ?`,
      [(await pool.execute('SELECT id FROM users WHERE email=?', [email]))[0][0].id]
    );
    expect(profiles).toHaveLength(1);
  });

  test('a newly registered patient is visible through pharmacist and admin database APIs', async () => {
    const email = `visible.patient.${Date.now()}@test.pharmate`;
    const registered = await request(app).post('/api/auth/register').send({
      email,
      password: PASSWORD,
      role: 'patient',
      full_name: 'Visibility Test',
    });
    expect(registered.status).toBe(201);
    const [[identity]] = await pool.execute(
      `SELECT u.id,u.role,p.patient_code FROM users u
       JOIN patients p ON p.id=u.id WHERE u.email=?`,
      [email]
    );
    expect(identity.role).toBe('patient');
    const pharmacistPatients = await request(app)
      .get('/api/pharmacist/patients')
      .set('Authorization', `Bearer ${pharmacistToken}`);
    expect(pharmacistPatients.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ patient_code: identity.patient_code })])
    );
    const adminUsers = await request(app)
      .get('/api/admin/users?role=patient')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminUsers.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: identity.id, role: 'patient' })])
    );
  });

  test('patient login returns accessToken, refreshToken, and patientCode', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: PATIENT_EMAIL,
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.role).toBe('patient');
    expect(res.body.user.patientCode).toMatch(/^PM-[A-Z0-9]{6}$/);
  });

  test('wrong password returns 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: PATIENT_EMAIL,
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });

  test('patient cannot sign in through the caregiver option', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: PATIENT_EMAIL,
      password: PASSWORD,
      role: 'caregiver',
    });
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('accessToken');
  });

  test('patient cannot sign in through the staff portal', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: PATIENT_EMAIL,
      password: PASSWORD,
      accountGroup: 'staff',
    });
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('accessToken');
  });

  test('pharmacist can sign in through the staff portal', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: PHARMACIST_EMAIL,
      password: PASSWORD,
      accountGroup: 'staff',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('pharmacist');
  });

  test('duplicate email registration returns 409', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: PATIENT_EMAIL,
      password: PASSWORD,
      role: 'patient',
    });
    expect(res.status).toBe(409);
  });

  test('refresh token rotation returns new accessToken', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: PATIENT_EMAIL,
      password: PASSWORD,
    });
    const { refreshToken } = loginRes.body;

    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body).toHaveProperty('refreshToken');
  });
});

// ── Anchor onboarding ─────────────────────────────────────────────────────────
describe('Patient anchors', () => {
  test('patient can read default anchors', async () => {
    const res = await request(app)
      .get('/api/patient/anchors')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('wake_anchor');
    expect(res.body).toHaveProperty('sleep_anchor');
  });

  test('patient can update anchors', async () => {
    const res = await request(app)
      .put('/api/patient/anchors')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ wake_anchor: '07:30', sleep_anchor: '23:00' });
    expect(res.status).toBe(200);
  });

  test('invalid time format is rejected', async () => {
    const res = await request(app)
      .put('/api/patient/anchors')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ wake_anchor: '25:00' });
    expect(res.status).toBe(400);
  });
});
