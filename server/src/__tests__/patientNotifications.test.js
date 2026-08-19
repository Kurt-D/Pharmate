import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createPrivilegedTestUser, createAccessToken } from './helpers/testUsers.js';
import {
  createPatientNotification,
  NOTIFICATION_TYPES,
  purgeReadNotifications,
} from '../services/patientNotifications.js';

const PASSWORD = 'TestPass@123';
const stamp = Date.now();
const auth = (token) => ({ Authorization: `Bearer ${token}` });
let a;
let b;
let pharmacistToken;

async function patient(label) {
  const email = `${label}.notifications.${stamp}@test.pharmate`;
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, role: 'patient' });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { id: login.body.user.id, token: login.body.accessToken };
}

beforeAll(async () => {
  a = await patient('a');
  b = await patient('b');
  const pharmacistId = await createPrivilegedTestUser({
    email: `pharmacist.notifications.${stamp}@test.pharmate`,
    password: PASSWORD,
    role: 'pharmacist',
    fullName: 'Notification Tester',
  });
  pharmacistToken = await createAccessToken(pharmacistId);
});

afterAll(async () => pool.end());

describe('patient notification authorization and event contracts', () => {
  test('requires authentication and patient role on every endpoint', async () => {
    const paths = ['/notifications', '/notifications/unread-count'];
    for (const path of paths) {
      expect((await request(app).get(`/api/patient${path}`)).status).toBe(401);
      expect(
        (await request(app).get(`/api/patient${path}`).set(auth(pharmacistToken))).status
      ).toBe(403);
    }
  });

  test('supports every event type and de-duplicates event keys', async () => {
    for (const type of NOTIFICATION_TYPES) {
      const args = {
        patientId: a.id,
        type,
        eventKey: `test:${stamp}:${type}`,
        medicineName: 'SecretMedicine',
        metadata: { schedule_id: `schedule-${type}`, address: 'must-not-store' },
      };
      expect((await createPatientNotification(args)).created).toBe(true);
      expect((await createPatientNotification(args)).created).toBe(false);
    }
    const [rows] = await pool.execute(
      `SELECT type, metadata FROM patient_notifications
       WHERE patient_id = ? AND event_key LIKE ?`,
      [a.id, `test:${stamp}:%`]
    );
    expect(rows).toHaveLength(NOTIFICATION_TYPES.length);
    expect(new Set(rows.map((row) => row.type))).toEqual(new Set(NOTIFICATION_TYPES));
    expect(JSON.stringify(rows)).not.toContain('must-not-store');
  });

  test('private wording and metadata never leak a medicine name', async () => {
    const res = await request(app).get('/api/patient/notifications').set(auth(a.token));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('SecretMedicine');
    expect(JSON.stringify(res.body)).not.toContain('patient_id');
  });

  test('medicine names appear only after explicit detail opt-in', async () => {
    await request(app)
      .put('/api/patient/preferences')
      .set(auth(b.token))
      .send({ lock_screen_detail: 'medicine_name' });
    await createPatientNotification({
      patientId: b.id,
      type: 'dose_missed',
      eventKey: `named:${stamp}`,
      medicineName: 'OptInMedicine',
      metadata: { schedule_id: 'named-schedule' },
    });
    const res = await request(app).get('/api/patient/notifications').set(auth(b.token));
    expect(res.body.notifications[0].message).toContain('OptInMedicine');
    expect(JSON.stringify(res.body.notifications[0].metadata)).not.toContain('OptInMedicine');
  });

  test('disabled reminders are not created', async () => {
    await request(app)
      .put('/api/patient/preferences')
      .set(auth(b.token))
      .send({ reminders_enabled: false });
    const result = await createPatientNotification({
      patientId: b.id,
      type: 'dose_reminder',
      eventKey: `disabled:${stamp}`,
      medicineName: 'Hidden',
    });
    expect(result.created).toBe(false);
  });
});

describe('listing, isolation, filters, and read state', () => {
  test('validates pagination and filters', async () => {
    for (const query of [
      'limit=0',
      'limit=101',
      'limit=nope',
      'type=unknown',
      'unread_only=1',
      'cursor=bad',
    ]) {
      const res = await request(app).get(`/api/patient/notifications?${query}`).set(auth(a.token));
      expect(res.status).toBe(400);
    }
  });

  test('paginates newest-first with opaque cursors and filters', async () => {
    const first = await request(app).get('/api/patient/notifications?limit=2').set(auth(a.token));
    expect(first.status).toBe(200);
    expect(first.body.notifications).toHaveLength(2);
    expect(first.body.pagination.has_more).toBe(true);
    const second = await request(app)
      .get(`/api/patient/notifications?limit=2&cursor=${first.body.pagination.next_cursor}`)
      .set(auth(a.token));
    expect(second.status).toBe(200);
    expect(second.body.notifications.map((n) => n.id)).not.toContain(
      first.body.notifications[0].id
    );
    const filtered = await request(app)
      .get('/api/patient/notifications?type=prescription_approved&unread_only=true')
      .set(auth(a.token));
    expect(filtered.body.notifications.every((n) => n.type === 'prescription_approved')).toBe(true);
  });

  test('mark-one is idempotent; foreign notification modification is hidden as 404', async () => {
    const list = await request(app).get('/api/patient/notifications').set(auth(a.token));
    const id = list.body.notifications[0].id;
    const one = await request(app)
      .patch(`/api/patient/notifications/${id}/read`)
      .set(auth(a.token));
    const two = await request(app)
      .patch(`/api/patient/notifications/${id}/read`)
      .set(auth(a.token));
    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
    expect(two.body.read_at).toEqual(one.body.read_at);
    expect(
      (await request(app).patch(`/api/patient/notifications/${id}/read`).set(auth(b.token))).status
    ).toBe(404);
  });

  test('unread count and read-all are isolated to the authenticated patient', async () => {
    const beforeB = await request(app)
      .get('/api/patient/notifications/unread-count')
      .set(auth(b.token));
    const readAll = await request(app)
      .post('/api/patient/notifications/read-all')
      .set(auth(a.token));
    expect(readAll.status).toBe(200);
    expect(
      (await request(app).get('/api/patient/notifications/unread-count').set(auth(a.token))).body
        .unread_count
    ).toBe(0);
    expect(
      (await request(app).get('/api/patient/notifications/unread-count').set(auth(b.token))).body
        .unread_count
    ).toBe(beforeB.body.unread_count);
  });
});

test('retention purges only old read notifications', async () => {
  const old = new Date('2020-01-01T00:00:00Z');
  await pool.execute(
    `INSERT INTO patient_notifications
       (id, patient_id, type, title, message, event_key, created_at, read_at)
     VALUES (?, ?, 'schedule_changed', 'Schedule changed', 'Generic', ?, ?, ?),
            (?, ?, 'schedule_changed', 'Schedule changed', 'Generic', ?, ?, NULL)`,
    [
      `old-read-${stamp}`,
      a.id,
      `old-read:${stamp}`,
      old,
      old,
      `old-unread-${stamp}`,
      a.id,
      `old-unread:${stamp}`,
      old,
    ]
  );
  expect(await purgeReadNotifications(new Date(), 90)).toBeGreaterThanOrEqual(1);
  const [rows] = await pool.execute('SELECT id FROM patient_notifications WHERE id IN (?, ?)', [
    `old-read-${stamp}`,
    `old-unread-${stamp}`,
  ]);
  expect(rows.map((row) => row.id)).toEqual([`old-unread-${stamp}`]);
});
