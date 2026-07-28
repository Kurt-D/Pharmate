/**
 * Sprint 4 integration tests — schedule generation endpoint.
 *
 * Exercises the pure engine through the DB boundary: encode curated medications,
 * GET /api/patient/schedule (deterministic proposal, ENG §5), then confirm it
 * (UC-03 steps 4–6). Determinism itself is proven in engine/__tests__.
 *
 * Requires the test DB migrated (001+002) AND the formulary seeded
 * (npm run seed:formulary -- --allow-unverified against pharmate_test).
 */
import request from 'supertest';
import app from '../index.js';

const PATIENT_EMAIL = `patient.s4.${Date.now()}@test.pharmate`;
const PASSWORD = 'TestPass@123';

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: PATIENT_EMAIL, password: PASSWORD, role: 'patient', full_name: 'S4 Tester' });
  token = (
    await request(app).post('/api/auth/login').send({ email: PATIENT_EMAIL, password: PASSWORD })
  ).body.accessToken;
});

describe('GET /api/patient/schedule', () => {
  test('empty when no active medications', async () => {
    const res = await request(app).get('/api/patient/schedule').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.slots).toEqual([]);
    expect(res.body.generation_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('paracetamol TID → 08:00, 16:00, 00:00 with audit reasons', async () => {
    // Paracetamol is a PRN-default analgesic (is_prn_default=1); a prescribed
    // fixed schedule overrides that per-patient (ENG §3.3) with is_prn:false.
    await request(app)
      .post('/api/patient/medications')
      .set(auth())
      .send({ drug_name: 'paracetamol', frequency: 'TID', source: 'OTC_SELF', is_prn: false });

    const res = await request(app).get('/api/patient/schedule').set(auth());
    expect(res.status).toBe(200);

    const times = res.body.slots.map((s) => s.time);
    expect(times).toEqual(['08:00', '16:00', '00:00']);
    // Every dose carries a generated_reason and an absolute wall-clock time (ENG §9).
    res.body.slots.forEach((s) => {
      expect(s.generated_reason).toMatch(/TID \(q8h\)/);
      expect(s.scheduled_time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
    // The 00:00 dose is flagged as next-day.
    expect(res.body.slots[2].day_offset).toBe(1);
  });

  test('PRN medication is listed, never placed on the timetable (ENG §7)', async () => {
    await request(app)
      .post('/api/patient/medications')
      .set(auth())
      .send({ drug_name: 'ibuprofen', frequency: 'as needed', source: 'OTC_SELF', is_prn: true });

    const res = await request(app).get('/api/patient/schedule').set(auth());
    expect(res.body.prn.some((p) => /ibuprofen/i.test(p.drug_name))).toBe(true);
    expect(res.body.slots.some((s) => /ibuprofen/i.test(s.drug_name))).toBe(false);
  });
});

describe('POST /api/patient/schedule/confirm', () => {
  test('persists the proposal and returns a version + dose count', async () => {
    const proposal = await request(app).get('/api/patient/schedule').set(auth());
    const res = await request(app).post('/api/patient/schedule/confirm').set(auth());
    expect(res.status).toBe(201);
    expect(res.body.version).toBeGreaterThanOrEqual(1);
    expect(res.body.count).toBe(proposal.body.slots.length);
  });

  test('re-confirming bumps the version and does not duplicate scheduled doses', async () => {
    const first = await request(app).post('/api/patient/schedule/confirm').set(auth());
    const second = await request(app).post('/api/patient/schedule/confirm').set(auth());
    expect(second.body.version).toBeGreaterThan(first.body.version);
    // Same dose count — the prior 'scheduled' rows were replaced, not appended.
    expect(second.body.count).toBe(first.body.count);
  });
});
