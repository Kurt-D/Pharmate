/**
 * Sprint 5 integration tests — prescription validation (UC-03, TC-04, D-K).
 *
 * Patient uploads a (client-redacted) photo for an RX medication → pharmacist
 * queue → approve flips the med to active (schedulable) / reject keeps it pending
 * with a reason. Plus the 7-day purge job.
 *
 * Requires the test DB migrated (001+002) and formulary seeded.
 */
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { purgeExpiredPhotos } from '../services/prescription.js';
import { UPLOADS_DIR } from '../middleware/upload.js';

const PATIENT_EMAIL = `patient.s5.${Date.now()}@test.pharmate`;
const PHARM_EMAIL = `pharm.s5.${Date.now()}@test.pharmate`;
const PASSWORD = 'TestPass@123';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG magic bytes

let patientToken;
let pharmToken;

async function login(email) {
  const r = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return r.body.accessToken;
}

beforeAll(async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: PATIENT_EMAIL, password: PASSWORD, role: 'patient', full_name: 'S5 Tester' });
  patientToken = await login(PATIENT_EMAIL);

  await request(app)
    .post('/api/auth/register')
    .send({ email: PHARM_EMAIL, password: PASSWORD, role: 'pharmacist', full_name: 'Dr S5' });
  pharmToken = await login(PHARM_EMAIL);
});

afterAll(async () => {
  await pool.end();
});

/** Encode an RX medication (→ pending_validation) and return its id. */
async function encodeRxMed() {
  const res = await request(app)
    .post('/api/patient/medications')
    .set('Authorization', `Bearer ${patientToken}`)
    .send({ drug_name: 'paracetamol', frequency: 'TID', source: 'RX_VALIDATED', is_prn: false });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('pending_validation');
  return res.body.id;
}

describe('Prescription upload', () => {
  test('patient uploads a redacted photo for an RX med → 201 pending', async () => {
    const medId = await encodeRxMed();
    const res = await request(app)
      .post(`/api/patient/medications/${medId}/prescription`)
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('photo', PNG, { filename: 'rx.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.photo_id).toBeTruthy();
  });

  test('non-image upload is rejected with 400', async () => {
    const medId = await encodeRxMed();
    const res = await request(app)
      .post(`/api/patient/medications/${medId}/prescription`)
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('photo', Buffer.from('not an image'), {
        filename: 'x.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(400);
  });
});

describe('Pharmacist validation queue + decision', () => {
  test('approve flips the medication to active and makes it schedulable', async () => {
    const medId = await encodeRxMed();
    const up = await request(app)
      .post(`/api/patient/medications/${medId}/prescription`)
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('photo', PNG, { filename: 'rx.png', contentType: 'image/png' });
    const photoId = up.body.photo_id;

    // Queue shows the item by patient_code, no plaintext name.
    const queue = await request(app)
      .get('/api/pharmacist/validations')
      .set('Authorization', `Bearer ${pharmToken}`);
    expect(queue.status).toBe(200);
    const item = queue.body.find((q) => q.id === photoId);
    expect(item).toBeTruthy();
    expect(item.patient_code).toMatch(/^PM-[A-Z0-9]{6}$/);
    expect(JSON.stringify(queue.body)).not.toContain('S5 Tester');

    // The redacted image is served for review.
    const photo = await request(app)
      .get(`/api/pharmacist/validations/${photoId}/photo`)
      .set('Authorization', `Bearer ${pharmToken}`);
    expect(photo.status).toBe(200);

    // Approve.
    const decision = await request(app)
      .post('/api/pharmacist/validate')
      .set('Authorization', `Bearer ${pharmToken}`)
      .send({ photo_id: photoId, action: 'approve' });
    expect(decision.status).toBe(200);
    expect(decision.body.status).toBe('approved');

    // Medication is now active and appears in the schedule.
    const sched = await request(app)
      .get('/api/patient/schedule')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(sched.body.slots.some((s) => /paracetamol/i.test(s.drug_name))).toBe(true);
  });

  test('reject requires a reason and keeps the med pending for resubmission (TC-04)', async () => {
    const medId = await encodeRxMed();
    const up = await request(app)
      .post(`/api/patient/medications/${medId}/prescription`)
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('photo', PNG, { filename: 'rx.png', contentType: 'image/png' });
    const photoId = up.body.photo_id;

    const noReason = await request(app)
      .post('/api/pharmacist/validate')
      .set('Authorization', `Bearer ${pharmToken}`)
      .send({ photo_id: photoId, action: 'reject' });
    expect(noReason.status).toBe(400);

    const rejected = await request(app)
      .post('/api/pharmacist/validate')
      .set('Authorization', `Bearer ${pharmToken}`)
      .send({ photo_id: photoId, action: 'reject', reason: 'Photo is blurry — please retake.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('rejected');

    // Patient sees the rejection reason; medication is still awaiting validation.
    const meds = await request(app)
      .get('/api/patient/medications')
      .set('Authorization', `Bearer ${patientToken}`);
    const med = meds.body.find((m) => m.id === medId);
    expect(med.status).toBe('pending_validation');
    expect(med.prescription_status).toBe('rejected');
    expect(med.prescription_reason).toMatch(/blurry/i);
  });

  test('a decided prescription cannot be decided again (409)', async () => {
    const medId = await encodeRxMed();
    const up = await request(app)
      .post(`/api/patient/medications/${medId}/prescription`)
      .set('Authorization', `Bearer ${patientToken}`)
      .attach('photo', PNG, { filename: 'rx.png', contentType: 'image/png' });
    const photoId = up.body.photo_id;

    await request(app)
      .post('/api/pharmacist/validate')
      .set('Authorization', `Bearer ${pharmToken}`)
      .send({ photo_id: photoId, action: 'approve' });
    const again = await request(app)
      .post('/api/pharmacist/validate')
      .set('Authorization', `Bearer ${pharmToken}`)
      .send({ photo_id: photoId, action: 'approve' });
    expect(again.status).toBe(409);
  });
});

describe('Priority derivation on approval (PART 2)', () => {
  // Register a dedicated patient, run the full upload → approve flow, and return
  // that patient's row so we can inspect priority_flag.
  async function approveRxFor(patientEmail, { declareCondition } = {}) {
    await request(app)
      .post('/api/auth/register')
      .send({ email: patientEmail, password: PASSWORD, role: 'patient', full_name: 'Derivation Pt' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: patientEmail, password: PASSWORD });
    const token = login.body.accessToken;
    const patientId = login.body.user.id;

    if (declareCondition) {
      const put = await request(app)
        .put('/api/patient/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ medical_condition: declareCondition });
      expect(put.status).toBe(200);
    }

    const med = await request(app)
      .post('/api/patient/medications')
      .set('Authorization', `Bearer ${token}`)
      .send({ drug_name: 'paracetamol', frequency: 'TID', source: 'RX_VALIDATED', is_prn: false });
    const up = await request(app)
      .post(`/api/patient/medications/${med.body.id}/prescription`)
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', PNG, { filename: 'rx.png', contentType: 'image/png' });
    const decision = await request(app)
      .post('/api/pharmacist/validate')
      .set('Authorization', `Bearer ${pharmToken}`)
      .send({ photo_id: up.body.photo_id, action: 'approve' });
    expect(decision.status).toBe(200);

    const [[row]] = await pool.execute('SELECT priority_flag FROM patients WHERE id = ?', [
      patientId,
    ]);
    return row;
  }

  test('approving an RX for a patient WITH a declared condition flips priority_flag true', async () => {
    const row = await approveRxFor(`prio.yes.${Date.now()}@test.pharmate`, {
      declareCondition: 'Hypertension',
    });
    expect(row.priority_flag).toBe(1);
  });

  test('approving an RX for a patient with NO condition leaves priority_flag false', async () => {
    const row = await approveRxFor(`prio.no.${Date.now()}@test.pharmate`);
    expect(row.priority_flag).toBe(0);
  });

  test('the profile endpoint round-trips the condition and never exposes it to staff', async () => {
    const email = `prio.roundtrip.${Date.now()}@test.pharmate`;
    await request(app)
      .post('/api/auth/register')
      .send({ email, password: PASSWORD, role: 'patient', full_name: 'Roundtrip Pt' });
    const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    const token = login.body.accessToken;

    await request(app)
      .put('/api/patient/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ medical_condition: 'Type 2 diabetes' });
    const prof = await request(app)
      .get('/api/patient/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(prof.body.medical_condition).toBe('Type 2 diabetes'); // patient sees own PII
    expect(prof.body.patient_code).toMatch(/^PM-[A-Z0-9]{6}$/);

    // The pharmacist roster shows this patient by code only — never the condition.
    const roster = await request(app)
      .get('/api/pharmacist/patients')
      .set('Authorization', `Bearer ${pharmToken}`);
    expect(JSON.stringify(roster.body)).not.toContain('Type 2 diabetes');
  });
});

describe('D-K — 7-day photo purge', () => {
  test('purges the redacted file of an 8-day-old decision, retains the row', async () => {
    // Seed a decided photo whose retention window elapsed, with a real file.
    const medId = await encodeRxMed();
    const filename = `rx_purge_${Date.now()}.png`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), PNG);

    const [ins] = await pool.execute(
      `INSERT INTO prescription_photos
         (id, medication_id, redacted_path, status, decision_at, purge_at)
       VALUES (UUID(), ?, ?, 'approved', DATE_SUB(NOW(3), INTERVAL 8 DAY), DATE_SUB(NOW(3), INTERVAL 1 DAY))`,
      [medId, filename]
    );
    expect(ins.affectedRows).toBe(1);

    const purged = await purgeExpiredPhotos();
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(path.join(UPLOADS_DIR, filename))).toBe(false);

    // Metadata row survives with redacted_path cleared.
    const [rows] = await pool.execute(
      `SELECT redacted_path, status FROM prescription_photos WHERE medication_id = ? AND status = 'approved'`,
      [medId]
    );
    expect(rows.some((r) => r.redacted_path === null)).toBe(true);
  });
});
