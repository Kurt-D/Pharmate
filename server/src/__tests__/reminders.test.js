/**
 * Reminder pipeline tests (feature #4) — the online dispatch layer.
 *
 * Covers device-token registration (the app's FCM handshake) and the dispatcher's
 * selection + once-only stamping. FCM itself is unconfigured under test, so sends
 * resolve to skipped:'not_configured' — we assert the SELECTION and IDEMPOTENCY,
 * which is the logic that matters; the transport is a thin wrapper.
 *
 * Requires the test DB migrated (001–008) and the formulary seeded.
 */
import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { dueReminders, dispatchReminders } from '../services/reminders.js';
import { v4 as uuidv4 } from 'uuid';

const PASSWORD = 'TestPass@123';
const stamp = Date.now();

let patientToken;
let patientId;

async function register(role, extra = {}) {
  const email = `${role}.rem.${stamp}.${Math.random().toString(16).slice(2, 8)}@test.pharmate`;
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, role, ...extra });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { token: login.body.accessToken, id: login.body.user.id };
}

beforeAll(async () => {
  const p = await register('patient', { full_name: 'Reminder Tester' });
  patientToken = p.token;
  patientId = p.id;
  // A confirmed schedule so there are real medication_schedules rows to remind on.
  const medication = await request(app)
    .post('/api/patient/medications')
    .set({ Authorization: `Bearer ${patientToken}` })
    .send({ drug_name: 'paracetamol', frequency: 'TID', source: 'OTC_SELF', is_prn: false });
  await pool.execute("UPDATE medications SET schedule_status='APPROVED' WHERE id=?", [
    medication.body.id,
  ]);
  await pool.execute(
    `INSERT INTO medication_schedules
       (id,medication_id,patient_id,scheduled_time,generated_reason,is_confirmed,schedule_version,status)
     VALUES (?,?,?,NOW(),'reminder test',1,1,'scheduled')`,
    [uuidv4(), medication.body.id, patientId]
  );
});

afterAll(async () => {
  await pool.end();
});

/** Move one of the patient's doses to `when`, un-reminded and scheduled. */
async function anchorDoseAt(when) {
  const [[row]] = await pool.execute(
    `SELECT id FROM medication_schedules WHERE patient_id = ? ORDER BY scheduled_time ASC LIMIT 1`,
    [patientId]
  );
  await pool.execute(
    `UPDATE medication_schedules
     SET scheduled_time = ?, status = 'scheduled', reminder_sent_at = NULL, is_prn_slot = 0
     WHERE id = ?`,
    [when, row.id]
  );
  return row.id;
}

describe('Device-token registration', () => {
  test('PUT stores the token; DELETE clears it', async () => {
    const put = await request(app)
      .put('/api/patient/device-token')
      .set({ Authorization: `Bearer ${patientToken}` })
      .send({ token: 'fcm-test-token-abc123' });
    expect(put.status).toBe(200);

    const [[after]] = await pool.execute('SELECT fcm_token FROM patients WHERE id = ?', [
      patientId,
    ]);
    expect(after.fcm_token).toBe('fcm-test-token-abc123');

    const del = await request(app)
      .delete('/api/patient/device-token')
      .set({ Authorization: `Bearer ${patientToken}` });
    expect(del.status).toBe(200);
    const [[cleared]] = await pool.execute('SELECT fcm_token FROM patients WHERE id = ?', [
      patientId,
    ]);
    expect(cleared.fcm_token).toBeNull();
  });

  test('a missing token is rejected', async () => {
    const res = await request(app)
      .put('/api/patient/device-token')
      .set({ Authorization: `Bearer ${patientToken}` })
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('Reminder dispatch', () => {
  test('a due dose repeats after five minutes until taken', async () => {
    const now = new Date();
    const doseId = await anchorDoseAt(now);

    const before = await dueReminders(now);
    expect(before.some((d) => d.schedule_id === doseId)).toBe(true);

    const summary = await dispatchReminders(now);
    expect(summary.due).toBeGreaterThanOrEqual(1);

    const [[stamped]] = await pool.execute(
      'SELECT reminder_sent_at FROM medication_schedules WHERE id = ?',
      [doseId]
    );
    expect(stamped.reminder_sent_at).not.toBeNull();

    // Immediate scans do not duplicate the reminder.
    const after = await dueReminders(now);
    expect(after.some((d) => d.schedule_id === doseId)).toBe(false);
    expect(
      (await dueReminders(new Date(now.getTime() + 4 * 60000))).some(
        (d) => d.schedule_id === doseId
      )
    ).toBe(false);
    expect(
      (await dueReminders(new Date(now.getTime() + 5 * 60000))).some(
        (d) => d.schedule_id === doseId
      )
    ).toBe(true);
    await pool.execute("UPDATE medication_schedules SET status='taken' WHERE id=?", [doseId]);
    expect(
      (await dueReminders(new Date(now.getTime() + 10 * 60000))).some(
        (d) => d.schedule_id === doseId
      )
    ).toBe(false);
  });

  test('a PRN slot is never reminded (no fixed time)', async () => {
    const now = new Date();
    const doseId = await anchorDoseAt(now);
    await pool.execute(`UPDATE medication_schedules SET is_prn_slot = 1 WHERE id = ?`, [doseId]);

    const due = await dueReminders(now);
    expect(due.some((d) => d.schedule_id === doseId)).toBe(false);
  });

  test('a dose far in the future is not yet due', async () => {
    const now = new Date();
    const doseId = await anchorDoseAt(new Date(now.getTime() + 6 * 3600 * 1000));

    const due = await dueReminders(now);
    expect(due.some((d) => d.schedule_id === doseId)).toBe(false);
  });
});
