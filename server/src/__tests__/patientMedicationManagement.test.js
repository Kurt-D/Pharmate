import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createPrivilegedTestUser } from './helpers/testUsers.js';

const PASSWORD = 'TestPass@123';
const stamp = Date.now();
let token;
let otherToken;
let patientId;
let otherId;
let pharmacistToken;

const auth = (value = token) => ({ Authorization: `Bearer ${value}` });

async function register(email) {
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, role: 'patient', full_name: 'Medication Tester' });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  const [[user]] = await pool.execute('SELECT id FROM users WHERE email=?', [email]);
  return { token: login.body.accessToken, id: user.id };
}

async function add(body = {}) {
  return request(app)
    .post('/api/patient/medications')
    .set(auth())
    .send({ drug_name: 'paracetamol', frequency: 'BID', source: 'OTC_SELF', ...body });
}

beforeAll(async () => {
  ({ token, id: patientId } = await register(`med.manage.${stamp}@test.pharmate`));
  ({ token: otherToken, id: otherId } = await register(`med.other.${stamp}@test.pharmate`));
  await createPrivilegedTestUser({
    email: `med.pharm.${stamp}@test.pharmate`,
    password: PASSWORD,
    role: 'pharmacist',
    fullName: 'Reviewer',
  });
  pharmacistToken = (
    await request(app)
      .post('/api/auth/login')
      .send({ email: `med.pharm.${stamp}@test.pharmate`, password: PASSWORD })
  ).body.accessToken;
});

afterAll(async () => {
  await pool.end();
});

describe('patient medication access and edits', () => {
  test('requires authentication and patient role', async () => {
    expect((await request(app).get(`/api/patient/medications/${uuidv4()}`)).status).toBe(401);
    expect(
      (await request(app).get(`/api/patient/medications/${uuidv4()}`).set(auth(pharmacistToken)))
        .status
    ).toBe(403);
  });

  test('fetches one medication and isolates patients with 404', async () => {
    const created = await add();
    const own = await request(app).get(`/api/patient/medications/${created.body.id}`).set(auth());
    expect(own.status).toBe(200);
    expect(own.body.updated_at).toBeTruthy();
    expect(
      (await request(app).get(`/api/patient/medications/${created.body.id}`).set(auth(otherToken)))
        .status
    ).toBe(404);
    const otherPatch = await request(app)
      .patch(`/api/patient/medications/${created.body.id}`)
      .set(auth(otherToken))
      .send({ expected_updated_at: own.body.updated_at, frequency: 'QD' });
    expect(otherPatch.status).toBe(404);
  });

  test('updates valid OTC fields, audits, invalidates future only, and notifies', async () => {
    const created = await add();
    const med = (await request(app).get(`/api/patient/medications/${created.body.id}`).set(auth()))
      .body;
    const past = uuidv4(),
      acted = uuidv4(),
      future = uuidv4();
    await pool.execute(
      `INSERT INTO medication_schedules (id,medication_id,patient_id,scheduled_time,generated_reason,status) VALUES (?, ?, ?, DATE_SUB(NOW(3), INTERVAL 1 DAY),'test','scheduled'), (?, ?, ?, DATE_ADD(NOW(3), INTERVAL 1 DAY),'test','taken'), (?, ?, ?, DATE_ADD(NOW(3), INTERVAL 2 DAY),'test','scheduled')`,
      [past, med.id, patientId, acted, med.id, patientId, future, med.id, patientId]
    );
    await pool.execute(
      `INSERT INTO dose_logs (id,schedule_id,patient_id,logged_at,confirmation_method,status) VALUES (?, ?, ?, NOW(3),'manual','taken')`,
      [uuidv4(), acted, patientId]
    );
    const beforeLogs = (
      await pool.execute('SELECT COUNT(*) count FROM dose_logs WHERE patient_id=?', [patientId])
    )[0][0].count;
    const res = await request(app).patch(`/api/patient/medications/${med.id}`).set(auth()).send({
      expected_updated_at: med.updated_at,
      frequency: 'QD',
      dosage_instruction: 'Take with water',
      is_prn: false,
      start_date: '2026-08-18',
      end_date: '2026-08-25',
    });
    expect(res.status).toBe(200);
    expect(res.body.medication.frequency_code).toBe('QD');
    expect(res.body.schedule_reconfirmation_required).toBe(true);
    const [schedules] = await pool.execute(
      'SELECT id FROM medication_schedules WHERE id IN (?,?,?)',
      [past, acted, future]
    );
    expect(schedules.map((r) => r.id)).toEqual(expect.arrayContaining([past, acted]));
    expect(schedules.map((r) => r.id)).not.toContain(future);
    expect(
      (
        await pool.execute('SELECT COUNT(*) count FROM dose_logs WHERE patient_id=?', [patientId])
      )[0][0].count
    ).toBe(beforeLogs);
    const [[notice]] = await pool.execute(
      "SELECT id FROM patient_notifications WHERE patient_id=? AND type='schedule_changed' AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.medication_id'))=?",
      [patientId, med.id]
    );
    expect(notice).toBeTruthy();
    const [[audit]] = await pool.execute(
      "SELECT before_info,after_info FROM medication_history WHERE medication_id=? AND event_type='updated'",
      [med.id]
    );
    expect(audit.after_info.frequency_code).toBe('QD');
    expect(JSON.stringify(audit)).not.toMatch(/patient_id|drug_id|prescription/i);
  });

  test.each([
    [{ frequency: 'whenever' }, /frequency/],
    [{ start_date: '18-08-2026' }, /start_date/],
    [{ is_prn: 'yes' }, /is_prn/],
    [{ start_date: '2026-08-20', end_date: '2026-08-19' }, /end_date/],
  ])('rejects invalid editing input %#', async (patch, pattern) => {
    const created = await add();
    const med = (await request(app).get(`/api/patient/medications/${created.body.id}`).set(auth()))
      .body;
    const res = await request(app)
      .patch(`/api/patient/medications/${med.id}`)
      .set(auth())
      .send({ expected_updated_at: med.updated_at, ...patch });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(pattern);
  });

  test('rejects forbidden field injection and pending activation', async () => {
    const created = await add();
    const med = (await request(app).get(`/api/patient/medications/${created.body.id}`).set(auth()))
      .body;
    for (const field of [
      'patient_id',
      'drug_id',
      'source',
      'status',
      'pharmacist_id',
      'validated_at',
      'prescription_status',
      'rx_class',
    ]) {
      const res = await request(app)
        .patch(`/api/patient/medications/${med.id}`)
        .set(auth())
        .send({
          expected_updated_at: med.updated_at,
          [field]: field === 'status' ? 'active' : 'injected',
        });
      expect(res.status).toBe(400);
    }
  });

  test('denies validated-RX clinical edits with pharmacist guidance', async () => {
    const created = await add({ source: 'RX_VALIDATED' });
    await pool.execute("UPDATE medications SET status='active', validated_at=NOW(3) WHERE id=?", [
      created.body.id,
    ]);
    const med = (await request(app).get(`/api/patient/medications/${created.body.id}`).set(auth()))
      .body;
    const res = await request(app)
      .patch(`/api/patient/medications/${med.id}`)
      .set(auth())
      .send({ expected_updated_at: med.updated_at, frequency: 'QD' });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toMatch(/pharmacist/i);
  });

  test('returns 409 for a stale edit', async () => {
    const created = await add();
    const med = (await request(app).get(`/api/patient/medications/${created.body.id}`).set(auth()))
      .body;
    await pool.execute(
      'UPDATE medications SET dosage_instruction=?, updated_at=DATE_ADD(updated_at, INTERVAL 1 SECOND) WHERE id=?',
      ['changed', med.id]
    );
    expect(
      (
        await request(app)
          .patch(`/api/patient/medications/${med.id}`)
          .set(auth())
          .send({ expected_updated_at: med.updated_at, frequency: 'QD' })
      ).status
    ).toBe(409);
  });
});

describe('stop and history', () => {
  test('stopping a medicine removes active reminders but preserves taken and missed history', async () => {
    const created = await add();
    const med = (await request(app).get(`/api/patient/medications/${created.body.id}`).set(auth()))
      .body;
    const scheduledId = uuidv4();
    const takenId = uuidv4();
    const missedId = uuidv4();
    await pool.execute(
      `INSERT INTO medication_schedules
       (id,medication_id,patient_id,scheduled_time,generated_reason,is_confirmed,status)
       VALUES (?, ?, ?, NOW(3), 'active reminder', 1, 'scheduled'),
              (?, ?, ?, DATE_SUB(NOW(3), INTERVAL 1 HOUR), 'taken history', 1, 'taken'),
              (?, ?, ?, DATE_SUB(NOW(3), INTERVAL 2 HOUR), 'missed history', 1, 'missed')`,
      [scheduledId, med.id, patientId, takenId, med.id, patientId, missedId, med.id, patientId]
    );
    await pool.execute(
      `INSERT INTO dose_logs
       (id,schedule_id,patient_id,logged_at,confirmation_method,status,synced)
       VALUES (?, ?, ?, DATE_SUB(NOW(3), INTERVAL 1 HOUR), 'manual', 'taken', 1)`,
      [uuidv4(), takenId, patientId]
    );

    const stopped = await request(app)
      .post(`/api/patient/medications/${med.id}/stop`)
      .set(auth())
      .send({ expected_updated_at: med.updated_at })
      .expect(200);
    expect(stopped.body.future_schedules_invalidated).toBe(1);

    const [remaining] = await pool.execute(
      'SELECT id,status FROM medication_schedules WHERE medication_id=? ORDER BY status',
      [med.id]
    );
    expect(remaining).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: takenId, status: 'taken' }),
        expect.objectContaining({ id: missedId, status: 'missed' }),
      ])
    );
    expect(remaining.some((row) => row.id === scheduledId)).toBe(false);
    const [[log]] = await pool.execute('SELECT id FROM dose_logs WHERE schedule_id=?', [takenId]);
    expect(log.id).toBeTruthy();
  });

  test.each([
    ['OTC_SELF', 'active', 'completed'],
    ['RX_VALIDATED', 'pending_validation', 'cancelled'],
  ])('stops %s %s as %s and is idempotent', async (source, initial, expected) => {
    const created = await add({ source });
    expect(created.body.status).toBe(initial);
    const med = (await request(app).get(`/api/patient/medications/${created.body.id}`).set(auth()))
      .body;
    const first = await request(app)
      .post(`/api/patient/medications/${med.id}/stop`)
      .set(auth())
      .send({ expected_updated_at: med.updated_at });
    expect(first.status).toBe(200);
    expect(first.body.medication.status).toBe(expected);
    expect(first.body.already_stopped).toBe(false);
    const second = await request(app)
      .post(`/api/patient/medications/${med.id}/stop`)
      .set(auth())
      .send({ expected_updated_at: med.updated_at });
    expect(second.status).toBe(200);
    expect(second.body.already_stopped).toBe(true);
    const [[count]] = await pool.execute(
      'SELECT COUNT(*) count FROM medication_history WHERE medication_id=?',
      [med.id]
    );
    expect(Number(count.count)).toBe(1);
  });

  test('history is filtered, cursor-paginated, and patient-scoped', async () => {
    for (let i = 0; i < 3; i++) {
      const created = await add();
      const med = (
        await request(app).get(`/api/patient/medications/${created.body.id}`).set(auth())
      ).body;
      await request(app)
        .post(`/api/patient/medications/${med.id}/stop`)
        .set(auth())
        .send({ expected_updated_at: med.updated_at });
    }
    const first = await request(app)
      .get('/api/patient/medications/history?event_type=stopped&status=completed&limit=2')
      .set(auth());
    expect(first.status).toBe(200);
    expect(first.body.history).toHaveLength(2);
    expect(first.body.pagination.has_more).toBe(true);
    const second = await request(app)
      .get(
        `/api/patient/medications/history?event_type=stopped&status=completed&limit=2&cursor=${encodeURIComponent(first.body.pagination.next_cursor)}`
      )
      .set(auth());
    expect(second.status).toBe(200);
    expect(second.body.history.length).toBeGreaterThan(0);
    const other = await request(app).get('/api/patient/medications/history').set(auth(otherToken));
    expect(other.body.history).toHaveLength(0);
    expect(
      (await request(app).get('/api/patient/medications/history?event_type=hacked').set(auth()))
        .status
    ).toBe(400);
    expect(otherId).toBeTruthy();
  });
});
