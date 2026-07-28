/**
 * Sprint 7 integration tests — adherence, CSV export, caregiver alerts,
 * admin aggregates, SUS/TAM. (D-5, D-6, UC-08, TC-05.)
 *
 * Requires the test DB migrated (001+002+003) and formulary seeded.
 */
import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { computeAdherence } from '../services/adherence.js';
import { sweepMissed } from '../services/doses.js';

const PASSWORD = 'TestPass@123';
const stamp = Date.now();
const PATIENT_PII = 'Confidential Patient S7';

let patientToken;
let patientId;
let caregiverToken;
let caregiverId;
let adminToken;

async function register(role, extra = {}) {
  const email = `${role}.s7.${stamp}.${Math.random().toString(16).slice(2, 8)}@test.pharmate`;
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, role, ...extra });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { token: login.body.accessToken, id: login.body.user.id };
}

beforeAll(async () => {
  const p = await register('patient', { full_name: PATIENT_PII });
  patientToken = p.token;
  patientId = p.id;
  const c = await register('caregiver', { full_name: 'CG S7' });
  caregiverToken = c.token;
  caregiverId = c.id;
  adminToken = (await register('admin')).token;
});

afterAll(async () => {
  await pool.end();
});

async function confirmParacetamolSchedule(token) {
  await request(app)
    .post('/api/patient/medications')
    .set({ Authorization: `Bearer ${token}` })
    .send({ drug_name: 'paracetamol', frequency: 'TID', source: 'OTC_SELF', is_prn: false });
  await request(app)
    .post('/api/patient/schedule/confirm')
    .set({ Authorization: `Bearer ${token}` });
}

describe('Adherence computation (D-6)', () => {
  test('rate = (taken+taken_late)/scheduled and streak counts trailing taken', async () => {
    await confirmParacetamolSchedule(patientToken);
    // Force a known pattern by scheduled_time asc: [missed, taken, taken_late].
    const [rows] = await pool.execute(
      `SELECT id FROM medication_schedules WHERE patient_id = ? ORDER BY scheduled_time ASC`,
      [patientId]
    );
    const statuses = ['missed', 'taken', 'taken_late'];
    for (let i = 0; i < rows.length; i++) {
      await pool.execute(`UPDATE medication_schedules SET status = ? WHERE id = ?`, [
        statuses[i],
        rows[i].id,
      ]);
    }
    const a = await computeAdherence(patientId);
    expect(a.scheduled).toBe(3);
    expect(a.taken).toBe(2); // taken + taken_late
    expect(a.missed).toBe(1);
    expect(Math.round(a.adherence_rate * 100)).toBe(67);
    expect(a.streak).toBe(2); // trailing taken_late, taken
  });
});

describe('Caregiver missed-dose alert (UC-08) — no PII', () => {
  test('a missed dose alerts the linked caregiver by patient_code only', async () => {
    // Link caregiver ↔ patient directly.
    await pool.execute(
      `INSERT IGNORE INTO caregiver_patients (id, caregiver_id, patient_id) VALUES (UUID(), ?, ?)`,
      [caregiverId, patientId]
    );
    // Re-confirm to get fresh 'scheduled' rows, then sweep them to missed.
    await request(app)
      .post('/api/patient/schedule/confirm')
      .set({ Authorization: `Bearer ${patientToken}` });
    const when = new Date(Date.now() + 3 * 3600 * 1000); // well past every dose today
    await sweepMissed(when);

    const res = await request(app)
      .get('/api/caregiver/alerts')
      .set({ Authorization: `Bearer ${caregiverToken}` });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const alert = res.body[0];
    expect(alert.patient_code).toMatch(/^PM-[A-Z0-9]{6}$/);
    // No plaintext PII anywhere in the caregiver payload.
    expect(JSON.stringify(res.body)).not.toContain(PATIENT_PII);
  });

  test('a patient with no caregiver raises a pharmacist follow-up flag', async () => {
    const solo = await register('patient', { full_name: 'Solo S7' });
    await confirmParacetamolSchedule(solo.token);
    await sweepMissed(new Date(Date.now() + 3 * 3600 * 1000));

    const pharm = await register('pharmacist', { full_name: 'Dr S7b' });
    const res = await request(app)
      .get('/api/pharmacist/followups')
      .set({ Authorization: `Bearer ${pharm.token}` });
    expect(res.status).toBe(200);
    expect(res.body.some((f) => /^PM-[A-Z0-9]{6}$/.test(f.patient_code))).toBe(true);
  });
});

describe('Admin aggregates (D-5, TC-05)', () => {
  test('exposes only aggregates — no name or condition', async () => {
    const res = await request(app)
      .get('/api/admin/aggregates')
      .set({ Authorization: `Bearer ${adminToken}` });
    expect(res.status).toBe(200);
    expect(typeof res.body.patients).toBe('number');
    expect(res.body.adherence).toHaveProperty('average_pct');
    expect(JSON.stringify(res.body)).not.toContain(PATIENT_PII);
  });

  test('a non-admin is refused (403)', async () => {
    const res = await request(app)
      .get('/api/admin/aggregates')
      .set({ Authorization: `Bearer ${patientToken}` });
    expect(res.status).toBe(403);
  });

  test('per-medicine availability toggle', async () => {
    const meds = await request(app)
      .get('/api/admin/medicines')
      .set({ Authorization: `Bearer ${adminToken}` });
    const para = meds.body.find((m) => m.generic_name === 'paracetamol');
    const res = await request(app)
      .put(`/api/admin/medicines/${para.id}/availability`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ available: false });
    expect(res.status).toBe(200);
    expect(res.body.availability).toBe(0);
    // restore
    await request(app)
      .put(`/api/admin/medicines/${para.id}/availability`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ available: true });
  });
});

describe('CSV export (D-6)', () => {
  test('adherence.csv is well-formed and keyed on patient_code', async () => {
    const res = await request(app)
      .get('/api/admin/export/adherence.csv')
      .set({ Authorization: `Bearer ${adminToken}` });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const [header] = res.text.split('\n');
    expect(header).toBe('patient_code,scheduled,taken,taken_late,missed,adherence_pct,streak');
    expect(res.text).not.toContain(PATIENT_PII);
  });
});

describe('SUS / TAM instruments', () => {
  test('patient submits SUS, admin exports it', async () => {
    const responses = { q1: 4, q2: 3, q3: 5, q4: 2, q5: 4 };
    const post = await request(app)
      .post('/api/surveys/sus')
      .set({ Authorization: `Bearer ${patientToken}` })
      .send({ responses });
    expect(post.status).toBe(201);

    const csv = await request(app)
      .get('/api/admin/export/surveys.csv?instrument=sus')
      .set({ Authorization: `Bearer ${adminToken}` });
    expect(csv.status).toBe(200);
    expect(csv.text.split('\n')[0]).toMatch(/^id,role,submitted_at,/);
    expect(csv.text).toMatch(/patient/); // the role column
  });
});
