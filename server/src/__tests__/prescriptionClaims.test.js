import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createPrivilegedTestUser } from './helpers/testUsers.js';
import { decideValidation } from '../services/prescription.js';

const PASSWORD = 'TestPass@123';
const stamp = Date.now();
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let patientToken;
let adminToken;
let pharm1Token;
let pharm2Token;
let pharm1Id;
let pharm2Id;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function login(email) {
  return (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body.accessToken;
}

async function validation() {
  const med = await request(app).post('/api/patient/medications').set(auth(patientToken)).send({
    drug_name: 'paracetamol', frequency: 'TID', source: 'RX_VALIDATED', is_prn: false,
  });
  const photo = await request(app)
    .post(`/api/patient/medications/${med.body.id}/prescription`)
    .set(auth(patientToken))
    .attach('photo', PNG, { filename: 'claim.png', contentType: 'image/png' });
  return { medicationId: med.body.id, photoId: photo.body.photo_id };
}

beforeAll(async () => {
  const patientEmail = `claim.patient.${stamp}@test.pharmate`;
  await request(app).post('/api/auth/register').send({ email: patientEmail, password: PASSWORD, role: 'patient', full_name: 'Claim Patient' });
  patientToken = await login(patientEmail);
  const p1Email = `claim.p1.${stamp}@test.pharmate`;
  const p2Email = `claim.p2.${stamp}@test.pharmate`;
  const adminEmail = `claim.admin.${stamp}@test.pharmate`;
  pharm1Id = await createPrivilegedTestUser({ email: p1Email, password: PASSWORD, role: 'pharmacist', fullName: 'One' });
  pharm2Id = await createPrivilegedTestUser({ email: p2Email, password: PASSWORD, role: 'pharmacist', fullName: 'Two' });
  await createPrivilegedTestUser({ email: adminEmail, password: PASSWORD, role: 'admin' });
  pharm1Token = await login(p1Email);
  pharm2Token = await login(p2Email);
  adminToken = await login(adminEmail);
});

describe('validation claims', () => {
  test('first claim is atomic, owner retry is idempotent, and competitor learns nothing', async () => {
    const { photoId } = await validation();
    const [one, two] = await Promise.all([
      request(app).post(`/api/pharmacist/validations/${photoId}/claim`).set(auth(pharm1Token)),
      request(app).post(`/api/pharmacist/validations/${photoId}/claim`).set(auth(pharm2Token)),
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    const winnerToken = one.status === 200 ? pharm1Token : pharm2Token;
    const retry = await request(app).post(`/api/pharmacist/validations/${photoId}/claim`).set(auth(winnerToken));
    expect(retry.status).toBe(200);
    expect(retry.body.idempotent).toBe(true);
    expect(JSON.stringify(one.status === 409 ? one.body : two.body)).not.toMatch(/pharmacist|@test|claimed_by/i);
  });

  test('expired claim can be taken over and produces an expiry/reclaim audit sequence', async () => {
    const { photoId } = await validation();
    await request(app).post(`/api/pharmacist/validations/${photoId}/claim`).set(auth(pharm1Token));
    await pool.execute('UPDATE prescription_photos SET claim_expires_at=DATE_SUB(NOW(3), INTERVAL 1 SECOND) WHERE id=?', [photoId]);
    const takeover = await request(app).post(`/api/pharmacist/validations/${photoId}/claim`).set(auth(pharm2Token));
    expect(takeover.status).toBe(200);
    const history = await request(app).get(`/api/pharmacist/validations/${photoId}/history`).set(auth(pharm2Token));
    expect(history.body.history.map((event) => event.event_type)).toEqual(['claimed', 'claim_expired', 'reclaimed']);
    expect(JSON.stringify(history.body)).not.toMatch(/patient|medication|pharmacist_id|Claim Patient/i);
  });

  test('non-owner cannot release or view photo; active foreign claims are hidden from queue', async () => {
    const { photoId } = await validation();
    await request(app).post(`/api/pharmacist/validations/${photoId}/claim`).set(auth(pharm1Token));
    expect((await request(app).delete(`/api/pharmacist/validations/${photoId}/claim`).set(auth(pharm2Token))).status).toBe(409);
    expect((await request(app).get(`/api/pharmacist/validations/${photoId}/photo`).set(auth(pharm2Token))).status).toBe(409);
    const queue = await request(app).get('/api/pharmacist/validations').set(auth(pharm2Token));
    expect(queue.body.some((item) => item.id === photoId)).toBe(false);
    expect((await request(app).delete(`/api/pharmacist/validations/${photoId}/claim`).set(auth(pharm1Token))).status).toBe(200);
  });

  test('decision auto-claims an unclaimed item and notification is idempotent', async () => {
    const { photoId } = await validation();
    const decided = await request(app).post('/api/pharmacist/validate').set(auth(pharm1Token)).send({ photo_id: photoId, action: 'approve' });
    expect(decided.status).toBe(200);
    const again = await request(app).post('/api/pharmacist/validate').set(auth(pharm1Token)).send({ photo_id: photoId, action: 'approve' });
    expect(again.status).toBe(409);
    const [[notifications]] = await pool.execute("SELECT COUNT(*) count FROM patient_notifications WHERE event_key=?", [`prescription:${photoId}:approved`]);
    expect(Number(notifications.count)).toBe(1);
    const [events] = await pool.execute('SELECT event_type FROM prescription_validation_audit WHERE prescription_id=? ORDER BY event_time,id', [photoId]);
    expect(events.map((event) => event.event_type)).toEqual(['claimed', 'approved']);
  });

  test('exactly one concurrent competing decision succeeds', async () => {
    const { photoId } = await validation();
    const [one, two] = await Promise.all([
      request(app).post('/api/pharmacist/validate').set(auth(pharm1Token)).send({ photo_id: photoId, action: 'approve' }),
      request(app).post('/api/pharmacist/validate').set(auth(pharm2Token)).send({ photo_id: photoId, action: 'reject', reason: 'Not acceptable' }),
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    const [[decisions]] = await pool.execute("SELECT COUNT(*) count FROM prescription_validation_audit WHERE prescription_id=? AND event_type IN ('approved','rejected','needs_clearer')", [photoId]);
    expect(Number(decisions.count)).toBe(1);
  });

  test('validates required and length-limited reasons', async () => {
    const { photoId } = await validation();
    for (const [action, reason] of [['reject', ''], ['needs_clearer', '']]) {
      expect((await request(app).post('/api/pharmacist/validate').set(auth(pharm1Token)).send({ photo_id: photoId, action, reason })).status).toBe(400);
    }
    expect((await request(app).post('/api/pharmacist/validate').set(auth(pharm1Token)).send({ photo_id: photoId, action: 'reject', reason: 'x'.repeat(501) })).status).toBe(400);
  });

  test('patient and admin roles cannot access validation operations or history', async () => {
    const { photoId } = await validation();
    for (const token of [patientToken, adminToken]) {
      expect((await request(app).post(`/api/pharmacist/validations/${photoId}/claim`).set(auth(token))).status).toBe(403);
      expect((await request(app).get(`/api/pharmacist/validations/${photoId}/history`).set(auth(token))).status).toBe(403);
      expect((await request(app).post('/api/pharmacist/validate').set(auth(token)).send({ photo_id: photoId, action: 'approve' })).status).toBe(403);
    }
  });

  test('rolls back claim, decision, notification, medication, and audit on transaction failure', async () => {
    const { photoId, medicationId } = await validation();
    await expect(decideValidation(pharm1Id, photoId, 'approve', null, { failBeforeCommit: true })).rejects.toThrow(/Injected/);
    const [[photo]] = await pool.execute('SELECT status,claimed_by FROM prescription_photos WHERE id=?', [photoId]);
    const [[med]] = await pool.execute('SELECT status FROM medications WHERE id=?', [medicationId]);
    const [[audits]] = await pool.execute('SELECT COUNT(*) count FROM prescription_validation_audit WHERE prescription_id=?', [photoId]);
    const [[notices]] = await pool.execute('SELECT COUNT(*) count FROM patient_notifications WHERE event_key=?', [`prescription:${photoId}:approved`]);
    expect(photo).toMatchObject({ status: 'pending', claimed_by: null });
    expect(med.status).toBe('pending_validation');
    expect(Number(audits.count)).toBe(0);
    expect(Number(notices.count)).toBe(0);
    expect(pharm2Id).toBeTruthy();
  });
});
