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
import { pool } from '../db/connection.js';

const PATIENT_EMAIL = `patient.s4.${Date.now()}@test.pharmate`;
const PASSWORD = 'TestPass@123';

let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

afterAll(async () => {
  await pool.end();
});

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

  test('deleting all selected reminders remains deleted when doses are fetched again', async () => {
    await request(app).post('/api/patient/schedule/confirm').set(auth());
    const before = await request(app).get('/api/patient/doses/today').set(auth());
    const scheduleIds = before.body
      .filter((dose) => dose.status === 'scheduled')
      .map((dose) => dose.schedule_id);

    expect(scheduleIds.length).toBeGreaterThan(0);
    const removed = await request(app)
      .delete('/api/patient/schedule/items')
      .set(auth())
      .send({ schedule_ids: scheduleIds });

    expect(removed.status).toBe(200);
    expect(removed.body.deleted).toBe(scheduleIds.length);

    const after = await request(app).get('/api/patient/doses/today').set(auth());
    expect(after.body.filter((dose) => scheduleIds.includes(dose.schedule_id))).toEqual([]);
  });
});

// Layout: patient has paracetamol TID (3 doses, min interval 4h) at 08:00/16:00/00:00.
function toDoses(slots) {
  return slots.map((s) => ({
    medication_id: s.medication_id,
    minute: s.day_offset * 1440 + Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3, 5)),
  }));
}

describe('POST /api/patient/schedule/validate — ±60 min drag (D-E)', () => {
  test('a move that keeps the min interval is allowed', async () => {
    const sched = await request(app).get('/api/patient/schedule').set(auth());
    const doses = toDoses(sched.body.slots);
    doses[1].minute = 15 * 60; // 16:00 → 15:00, still ≥4h from 08:00 and 00:00
    const res = await request(app)
      .post('/api/patient/schedule/validate')
      .set(auth())
      .send({ doses, index: 1 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('a move within the drug’s own min interval is blocked and names the drug', async () => {
    const sched = await request(app).get('/api/patient/schedule').set(auth());
    const doses = toDoses(sched.body.slots);
    doses[1].minute = 11 * 60; // 16:00 → 11:00, only 3h after the 08:00 dose (< 4h)
    const res = await request(app)
      .post('/api/patient/schedule/validate')
      .set(auth())
      .send({ doses, index: 1 });
    expect(res.body.ok).toBe(false);
    expect(res.body.violation.drug).toMatch(/paracetamol/i);
  });
});

describe('POST /api/patient/schedule/confirm — adjusted layout re-validation', () => {
  test('a valid adjusted layout is persisted', async () => {
    const sched = await request(app).get('/api/patient/schedule').set(auth());
    const doses = toDoses(sched.body.slots);
    doses[1].minute = 15 * 60; // safe nudge
    const res = await request(app)
      .post('/api/patient/schedule/confirm')
      .set(auth())
      .send({ slots: doses });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(doses.length);
  });

  test('an invalid adjusted layout is rejected with 409 (never persisted)', async () => {
    const sched = await request(app).get('/api/patient/schedule').set(auth());
    const doses = toDoses(sched.body.slots);
    doses[1].minute = 11 * 60; // violates the 4h min interval
    const res = await request(app)
      .post('/api/patient/schedule/confirm')
      .set(auth())
      .send({ slots: doses });
    expect(res.status).toBe(409);
    expect(res.body.violation.drug).toMatch(/paracetamol/i);
  });

  test('a patient-created manual schedule is saved without generated-schedule rule validation', async () => {
    const sched = await request(app).get('/api/patient/schedule').set(auth());
    const doses = toDoses(sched.body.slots);
    const end = new Date(`${sched.body.generation_date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 2);
    const endDate = end.toISOString().slice(0, 10);
    await pool.execute('UPDATE medications SET start_date=?, end_date=? WHERE id=?', [
      sched.body.generation_date, endDate, doses[0].medication_id,
    ]);
    doses.forEach((dose) => { dose.dates = [sched.body.generation_date, endDate]; });
    doses[1].minute = 11 * 60; // This would fail the generated schedule gap check.
    const res = await request(app)
      .post('/api/patient/schedule/confirm')
      .set(auth())
      .send({ source: 'manual', slots: doses });

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(doses.length * 2);
  });
});

describe('new-medicine schedule scope', () => {
  test('suggests and saves only the medicine selected in the add-medicine flow', async () => {
    const email = `patient.schedule.scope.${Date.now()}@test.pharmate`;
    await request(app)
      .post('/api/auth/register')
      .send({ email, password: PASSWORD, role: 'patient', full_name: 'Schedule Scope Tester' });
    const scopedToken = (
      await request(app).post('/api/auth/login').send({ email, password: PASSWORD })
    ).body.accessToken;
    const scopedAuth = { Authorization: `Bearer ${scopedToken}` };

    const paracetamol = await request(app)
      .post('/api/patient/medications')
      .set(scopedAuth)
      .send({ drug_name: 'paracetamol', frequency: 'OD', source: 'OTC_SELF', is_prn: false });
    const cetirizine = await request(app)
      .post('/api/patient/medications')
      .set(scopedAuth)
      .send({ drug_name: 'cetirizine', frequency: 'OD', source: 'OTC_SELF', is_prn: false });

    await request(app)
      .post('/api/patient/schedule/confirm')
      .set(scopedAuth)
      .send({ medication_ids: [paracetamol.body.id] })
      .expect(201);

    const proposal = await request(app)
      .get(`/api/patient/schedule?medication_ids=${cetirizine.body.id}`)
      .set(scopedAuth)
      .expect(200);

    expect(proposal.body.slots.length).toBeGreaterThan(0);
    expect(new Set(proposal.body.slots.map((slot) => slot.medication_id))).toEqual(
      new Set([cetirizine.body.id])
    );

    await request(app)
      .post('/api/patient/schedule/confirm')
      .set(scopedAuth)
      .send({ medication_ids: [cetirizine.body.id] })
      .expect(201);

    const doses = await request(app).get('/api/patient/doses/today').set(scopedAuth).expect(200);
    const scheduledMedicineIds = new Set(
      doses.body.filter((dose) => dose.status === 'scheduled').map((dose) => dose.medication_id)
    );
    expect(scheduledMedicineIds.has(paracetamol.body.id)).toBe(true);
    expect(scheduledMedicineIds.has(cetirizine.body.id)).toBe(true);
  });
});
