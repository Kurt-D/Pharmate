import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createPrivilegedTestUser } from './helpers/testUsers.js';
import { raiseMissedAlerts } from '../services/alerts.js';

const PASSWORD = 'TestPass@123';
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const stamp = `${Date.now()}.${Math.random().toString(16).slice(2)}`;

async function makeUser(role, label) {
  const email = `${label}.${stamp}@test.pharmate`;
  if (role === 'patient') {
    await request(app)
      .post('/api/auth/register')
      .send({ email, password: PASSWORD, role, full_name: label });
  } else {
    await createPrivilegedTestUser({ email, password: PASSWORD, role, fullName: label });
  }
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { id: login.body.user.id, token: login.body.accessToken, email };
}

let patientA;
let patientB;
let caregiverA;
let caregiverB;
let caregiverC;
let patientCodeA;
let activeLinkId;
let branchId;
let medicationId;

beforeAll(async () => {
  patientA = await makeUser('patient', 'link-patient-a');
  patientB = await makeUser('patient', 'link-patient-b');
  caregiverA = await makeUser('caregiver', 'link-caregiver-a');
  caregiverB = await makeUser('caregiver', 'link-caregiver-b');
  caregiverC = await makeUser('caregiver', 'link-caregiver-c');

  const [[patient]] = await pool.execute('SELECT patient_code FROM patients WHERE id = ?', [
    patientA.id,
  ]);
  patientCodeA = patient.patient_code;

  branchId = `br-link-${Math.random().toString(16).slice(2, 10)}`;
  await pool.execute(
    `INSERT INTO pharmacy_branches (id, name, address, services_json)
     VALUES (?, 'Link Security Branch', 'Test', '["dispensing","delivery"]')`,
    [branchId]
  );
});

afterAll(async () => {
  await pool.end();
});

test('patient creates a hashed, single-use 15-minute invite and lists safe metadata', async () => {
  const created = await request(app).post('/api/patient/invite').set(auth(patientA.token));
  expect(created.status).toBe(201);
  expect(created.body.code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  const ttl = new Date(created.body.expires_at).getTime() - Date.now();
  expect(ttl).toBeGreaterThan(14 * 60 * 1000);
  expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000);

  const [[stored]] = await pool.execute('SELECT code, token_hash FROM invite_codes WHERE id = ?', [
    created.body.id,
  ]);
  expect(stored.code).toBeNull();
  expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(stored.token_hash).not.toBe(created.body.code);

  const listed = await request(app).get('/api/patient/invites').set(auth(patientA.token));
  expect(listed.status).toBe(200);
  const row = listed.body.find((invite) => invite.id === created.body.id);
  expect(row.status).toBe('active');
  expect(row).not.toHaveProperty('code');
  expect(JSON.stringify(row)).not.toContain(patientA.id);
});

test('expired invite is not listed and cannot be redeemed', async () => {
  const created = await request(app).post('/api/patient/invite').set(auth(patientA.token));
  await pool.execute(
    'UPDATE invite_codes SET expires_at = DATE_SUB(NOW(3), INTERVAL 1 SECOND) WHERE id = ?',
    [created.body.id]
  );

  const listed = await request(app).get('/api/patient/invites').set(auth(patientA.token));
  expect(listed.body.some((invite) => invite.id === created.body.id)).toBe(false);
  const redeemed = await request(app)
    .post('/api/caregiver/link')
    .set(auth(caregiverA.token))
    .send({ code: created.body.code });
  expect(redeemed.status).toBe(410);
});

test('patient revokes an unused invite; another patient sees 404', async () => {
  const created = await request(app).post('/api/patient/invite').set(auth(patientA.token));
  const denied = await request(app)
    .delete(`/api/patient/invites/${created.body.id}`)
    .set(auth(patientB.token));
  expect(denied.status).toBe(404);

  const revoked = await request(app)
    .delete(`/api/patient/invites/${created.body.id}`)
    .set(auth(patientA.token));
  expect(revoked.status).toBe(204);
  const redeemed = await request(app)
    .post('/api/caregiver/link')
    .set(auth(caregiverA.token))
    .send({ code: created.body.code });
  expect(redeemed.status).toBe(404);
});

test('caregiver redeems successfully without patient_id leakage', async () => {
  const invite = await request(app).post('/api/patient/invite').set(auth(patientA.token));
  const linked = await request(app)
    .post('/api/caregiver/link')
    .set(auth(caregiverA.token))
    .send({ code: invite.body.code, relationship: 'Daughter' });
  expect(linked.status).toBe(201);
  expect(linked.body).toEqual({ message: 'Linked to patient', relationship: 'Daughter' });
  expect(JSON.stringify(linked.body)).not.toContain('patient_id');
  expect(JSON.stringify(linked.body)).not.toContain(patientA.id);
});

test('two concurrent caregivers cannot redeem the same invite', async () => {
  const invite = await request(app).post('/api/patient/invite').set(auth(patientB.token));
  const results = await Promise.all([
    request(app)
      .post('/api/caregiver/link')
      .set(auth(caregiverB.token))
      .send({ code: invite.body.code }),
    request(app)
      .post('/api/caregiver/link')
      .set(auth(caregiverC.token))
      .send({ code: invite.body.code }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([201, 409]);

  const [[count]] = await pool.execute(
    "SELECT COUNT(*) AS total FROM caregiver_patients WHERE patient_id = ? AND status = 'active'",
    [patientB.id]
  );
  expect(count.total).toBe(1);
});

test('patient lists only privacy-appropriate active caregiver details', async () => {
  const listed = await request(app).get('/api/patient/caregivers').set(auth(patientA.token));
  expect(listed.status).toBe(200);
  expect(listed.body).toHaveLength(1);
  expect(listed.body[0]).toEqual({
    id: expect.any(String),
    email: caregiverA.email,
    relationship: 'Daughter',
    linked_at: expect.any(String),
    status: 'active',
    can_manage_medications: 0,
  });
  activeLinkId = listed.body[0].id;
  expect(JSON.stringify(listed.body)).not.toContain(patientA.id);
  expect(JSON.stringify(listed.body)).not.toContain(caregiverA.id);
});

test('another patient cannot revoke a caregiver link', async () => {
  const denied = await request(app)
    .delete(`/api/patient/caregivers/${activeLinkId}`)
    .set(auth(patientB.token));
  expect(denied.status).toBe(404);
});

test('revocation immediately removes every caregiver patient-scoped permission and alerts', async () => {
  const med = await request(app)
    .post('/api/patient/medications')
    .set(auth(patientA.token))
    .send({ drug_name: 'ibuprofen', frequency: 'BID', source: 'OTC_SELF' });
  medicationId = med.body.id;
  await pool.execute(
    `INSERT INTO caregiver_alerts (id, patient_id, caregiver_id, channel)
     VALUES (UUID(), ?, ?, 'caregiver')`,
    [patientA.id, caregiverA.id]
  );

  const revoked = await request(app)
    .delete(`/api/patient/caregivers/${activeLinkId}`)
    .set(auth(patientA.token));
  expect(revoked.status).toBe(204);

  const checks = await Promise.all([
    request(app).get('/api/caregiver/patients').set(auth(caregiverA.token)),
    request(app)
      .get(`/api/caregiver/patients/${patientCodeA}/medications`)
      .set(auth(caregiverA.token)),
    request(app).get(`/api/caregiver/patients/${patientCodeA}/orders`).set(auth(caregiverA.token)),
    request(app)
      .post(`/api/caregiver/patients/${patientCodeA}/refills`)
      .set(auth(caregiverA.token))
      .send({ medication_id: medicationId, branch_id: branchId }),
    request(app)
      .post(`/api/caregiver/patients/${patientCodeA}/deliveries`)
      .set(auth(caregiverA.token))
      .send({ medication_id: medicationId, branch_id: branchId, address: 'Test' }),
    request(app)
      .post(`/api/caregiver/patients/${patientCodeA}/inquiries`)
      .set(auth(caregiverA.token))
      .send({ subject: 'Denied' }),
    request(app).get('/api/caregiver/alerts').set(auth(caregiverA.token)),
  ]);
  expect(checks[0].status).toBe(200);
  expect(checks[0].body).toEqual([]);
  expect(checks.slice(1, 6).map((result) => result.status)).toEqual([404, 404, 404, 404, 404]);
  expect(checks[6].body).toEqual([]);

  const [[before]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM caregiver_alerts
     WHERE patient_id = ? AND caregiver_id = ?`,
    [patientA.id, caregiverA.id]
  );
  await raiseMissedAlerts(patientA.id, null);
  const [[after]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM caregiver_alerts
     WHERE patient_id = ? AND caregiver_id = ?`,
    [patientA.id, caregiverA.id]
  );
  expect(after.total).toBe(before.total);

  const [[audit]] = await pool.execute(
    `SELECT event_type FROM caregiver_link_audit
     WHERE link_id = ? ORDER BY occurred_at DESC LIMIT 1`,
    [activeLinkId]
  );
  expect(audit.event_type).toBe('revoked');
});
