/**
 * Sprint 9 integration tests — refill/delivery, label verify, loyalty. (D-4,
 * TC-02, TC-08, no-payments guard.)
 *
 * Requires the test DB migrated (001–004) and formulary seeded.
 */
import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';

const PASSWORD = 'TestPass@123';
const stamp = Date.now();
let token;
let pharmToken;
let medId;
let deliveryBranch; // offers delivery
let pickupBranch; // does not
const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

async function register(role) {
  const email = `${role}.s9.${stamp}.${Math.random().toString(16).slice(2, 8)}@test.pharmate`;
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, role, full_name: 'S9' });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { token: login.body.accessToken, id: login.body.user.id };
}

beforeAll(async () => {
  const p = await register('patient');
  token = p.token;
  pharmToken = (await register('pharmacist')).token;

  deliveryBranch = 'br-del-' + Math.random().toString(16).slice(2, 8);
  pickupBranch = 'br-pick-' + Math.random().toString(16).slice(2, 8);
  await pool.execute(
    `INSERT INTO pharmacy_branches (id, name, address, services_json) VALUES (?, 'Delivery Branch', 'A', ?)`,
    [deliveryBranch, '["dispensing","delivery"]']
  );
  await pool.execute(
    `INSERT INTO pharmacy_branches (id, name, address, services_json) VALUES (?, 'Pickup Branch', 'B', ?)`,
    [pickupBranch, '["dispensing"]']
  );

  const med = await request(app)
    .post('/api/patient/medications')
    .set(auth())
    .send({ drug_name: 'paracetamol', frequency: 'TID', source: 'OTC_SELF', is_prn: false });
  medId = med.body.id;
});

afterAll(async () => {
  await pool.end();
});

describe('Refill requests (D-4 — no payments)', () => {
  test('a refill requires a branch', async () => {
    const res = await request(app)
      .post('/api/patient/refills')
      .set(auth())
      .send({ medication_id: medId });
    expect(res.status).toBe(400);
  });

  test('a refill is created and appears in the patient’s orders', async () => {
    const res = await request(app)
      .post('/api/patient/refills')
      .set(auth())
      .send({ medication_id: medId, branch_id: pickupBranch });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');

    const orders = await request(app).get('/api/patient/orders').set(auth());
    expect(orders.body.refills.some((r) => r.id === res.body.id)).toBe(true);
  });
});

describe('Delivery requests (TC-08 — branch limitation)', () => {
  test('a delivery without a branch is refused', async () => {
    const res = await request(app)
      .post('/api/patient/deliveries')
      .set(auth())
      .send({ medication_id: medId, address: '1 Main St' });
    expect(res.status).toBe(400);
  });

  test('a branch that does not offer delivery is refused', async () => {
    const res = await request(app)
      .post('/api/patient/deliveries')
      .set(auth())
      .send({ medication_id: medId, branch_id: pickupBranch, address: '1 Main St' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not offer delivery/i);
  });

  test('a delivery from a covering branch succeeds; address is encrypted at rest', async () => {
    const res = await request(app)
      .post('/api/patient/deliveries')
      .set(auth())
      .send({ medication_id: medId, branch_id: deliveryBranch, address: '221B Baker Street' });
    expect(res.status).toBe(201);

    const [[row]] = await pool.execute(
      'SELECT delivery_address_enc FROM delivery_requests WHERE id = ?',
      [res.body.id]
    );
    expect(row.delivery_address_enc).toBeTruthy();
    expect(row.delivery_address_enc).not.toContain('Baker'); // stored ciphertext, not plaintext
  });
});

describe('UC-09 — prescription gating for refills & deliveries', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // amoxicillin is Rx (antibiotic) in the PH FDA formulary; paracetamol is OTC.
  async function encode(t, { drug_name = 'amoxicillin', source = 'RX_VALIDATED' } = {}) {
    const res = await request(app)
      .post('/api/patient/medications')
      .set(auth(t))
      .send({ drug_name, frequency: 'TID', source, is_prn: false });
    return res.body.id;
  }

  test('an OTC drug (ibuprofen) proceeds without any prescription', async () => {
    // Use ibuprofen (OTC) rather than paracetamol so we don't create a second
    // active paracetamol for this patient — the label-scan test asserts a
    // specific paracetamol medication id.
    const otc = await encode(token, { drug_name: 'ibuprofen', source: 'OTC_SELF' });
    const res = await request(app)
      .post('/api/patient/refills')
      .set(auth())
      .send({ medication_id: otc, branch_id: pickupBranch });
    expect(res.status).toBe(201);
  });

  test('an Rx drug with NO approved prescription is declined (prescription_required)', async () => {
    const rxMed = await encode(token);
    const res = await request(app)
      .post('/api/patient/refills')
      .set(auth())
      .send({ medication_id: rxMed, branch_id: pickupBranch });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('prescription_required');
  });

  test('the drug class is authoritative: an Rx drug mislabeled OTC_SELF is still gated', async () => {
    // Patient tries to bypass validation by self-encoding an antibiotic as OTC.
    const rxMed = await encode(token, { drug_name: 'amoxicillin', source: 'OTC_SELF' });
    const res = await request(app)
      .post('/api/patient/refills')
      .set(auth())
      .send({ medication_id: rxMed, branch_id: pickupBranch });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('prescription_required');
  });

  test('a delivery for an unvalidated Rx med is likewise declined', async () => {
    const rxMed = await encode(token);
    const res = await request(app)
      .post('/api/patient/deliveries')
      .set(auth())
      .send({ medication_id: rxMed, branch_id: deliveryBranch, address: '1 Main St' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('prescription_required');
  });

  test('an Rx med WITH an approved prescription proceeds', async () => {
    const rxMed = await encode(token);
    const up = await request(app)
      .post(`/api/patient/medications/${rxMed}/prescription`)
      .set(auth())
      .attach('photo', PNG, { filename: 'rx.png', contentType: 'image/png' });
    const decision = await request(app)
      .post('/api/pharmacist/validate')
      .set(auth(pharmToken))
      .send({ photo_id: up.body.photo_id, action: 'approve' });
    expect(decision.status).toBe(200);

    const res = await request(app)
      .post('/api/patient/refills')
      .set(auth())
      .send({ medication_id: rxMed, branch_id: pickupBranch });
    expect(res.status).toBe(201);
  });

  test('a restricted med is declined with the visit-nearest-branch message (TC-11)', async () => {
    // Restricted drugs can't be encoded via the normal path, so seed the med row
    // directly against a restricted formulary entry.
    const { randomUUID } = await import('node:crypto');
    const drugId = randomUUID();
    const medRow = randomUUID();
    const pat = await register('patient');
    await pool.execute(
      `INSERT INTO drug_reference (id, generic_name, is_restricted) VALUES (?, ?, 1)`,
      [drugId, `zzz-restricted-${stamp}`]
    );
    await pool.execute(
      `INSERT INTO medications (id, patient_id, drug_id, drug_name_raw, source, status)
       VALUES (?, ?, ?, 'zzz-restricted', 'RX_VALIDATED', 'active')`,
      [medRow, pat.id, drugId]
    );

    const res = await request(app)
      .post('/api/patient/refills')
      .set(auth(pat.token))
      .send({ medication_id: medRow, branch_id: pickupBranch });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('restricted_substance');
    expect(res.body.redirect).toBe('visit_nearest_branch');
  });
});

describe('Pharmacist order queue', () => {
  test('queue shows patient_code only and status can advance', async () => {
    const queue = await request(app).get('/api/pharmacist/orders').set(auth(pharmToken));
    expect(queue.status).toBe(200);
    const refill = queue.body.refills[0];
    expect(refill.patient_code).toMatch(/^PM-[A-Z0-9]{6}$/);

    const upd = await request(app)
      .post(`/api/pharmacist/orders/refill/${refill.id}/status`)
      .set(auth(pharmToken))
      .send({ status: 'ready' });
    expect(upd.status).toBe(200);
    expect(upd.body.status).toBe('ready');
  });
});

describe('Label-scan verification (TC-02)', () => {
  test('a scanned name matching an active medication verifies', async () => {
    const res = await request(app)
      .post('/api/patient/label/verify')
      .set(auth())
      .send({ scanned_name: 'paracetamol' });
    expect(res.body.match).toBe(true);
    expect(res.body.medication_id).toBe(medId);
  });

  test('a recognized name not on the schedule warns of a mismatch', async () => {
    const res = await request(app)
      .post('/api/patient/label/verify')
      .set(auth())
      .send({ scanned_name: 'metformin' });
    expect(res.body.match).toBe(false);
    expect(res.body.reason).toBe('no_matching_medication');
  });
});

describe('Loyalty flag (adherence-derived, no purchase identity)', () => {
  test('tier derives from the adherence streak', async () => {
    const solo = await register('patient');
    // Seed a 14-dose taken streak directly (FKs need a real medication).
    const m = await request(app)
      .post('/api/patient/medications')
      .set(auth(solo.token))
      .send({ drug_name: 'paracetamol', frequency: 'TID', source: 'OTC_SELF', is_prn: false });
    for (let i = 0; i < 14; i++) {
      await pool.execute(
        `INSERT INTO medication_schedules
           (id, medication_id, patient_id, scheduled_time, generated_reason, status, schedule_version)
         VALUES (UUID(), ?, ?, DATE_ADD('2026-01-01 08:00:00', INTERVAL ? HOUR), 'seed', 'taken', 1)`,
        [m.body.id, solo.id, i]
      );
    }
    const res = await request(app).get('/api/patient/loyalty').set(auth(solo.token));
    expect(res.body.streak).toBeGreaterThanOrEqual(14);
    expect(res.body.tier).toBe('gold');
  });

  test('a fresh patient has no loyalty tier', async () => {
    const res = await request(app).get('/api/patient/loyalty').set(auth());
    expect(res.body.tier).toBe('none');
  });
});

describe('D-4 — no payment flow exists anywhere', () => {
  test('no payment API/field identifiers in the codebase', async () => {
    const { execSync } = await import('node:child_process');
    let hits = '';
    try {
      // Scan our source only — dependency manifests carry unrelated funding URLs.
      hits = execSync(
        'git grep -liE "stripe|paypal|card_number|cardnumber|payment_intent|checkout_session|\\bcvv\\b" -- . ":!*.test.js" ":!*package-lock.json" ":!*package.json"',
        { cwd: process.cwd() + '/..' }
      ).toString();
    } catch {
      hits = '';
    }
    expect(hits.trim()).toBe('');
  });
});
