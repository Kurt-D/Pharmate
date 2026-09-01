import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createPrivilegedTestUser } from './helpers/testUsers.js';
import { authorizedRooms } from '../realtime/socketServer.js';

const PASSWORD = 'TestPass@123';
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const suffix = `${Date.now()}.${Math.random().toString(16).slice(2)}`;
let patient;
let caregiver;

async function login(email) {
  const response = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { id: response.body.user.id, token: response.body.accessToken, email };
}

beforeAll(async () => {
  const patientEmail = `portal.patient.${suffix}@test.pharmate`;
  await request(app).post('/api/auth/register').send({
    email: patientEmail, password: PASSWORD, role: 'patient', full_name: 'Portal Patient',
  });
  patient = await login(patientEmail);

  const caregiverEmail = `portal.caregiver.${suffix}@test.pharmate`;
  await createPrivilegedTestUser({ email: caregiverEmail, password: PASSWORD, role: 'caregiver' });
  caregiver = await login(caregiverEmail);
});

afterAll(async () => {
  await pool.end();
});

test('caregiver socket rooms are derived from active database links only', async () => {
  expect(await authorizedRooms({ id: caregiver.id, role: 'caregiver' })).toEqual(
    expect.arrayContaining([`user:${caregiver.id}`, `caregiver:${caregiver.id}`])
  );
  expect((await authorizedRooms({ id: caregiver.id, role: 'caregiver' })).some((room) => room.startsWith('caregiver_patient:'))).toBe(false);

  await pool.execute(
    `INSERT INTO caregiver_patients (id,caregiver_id,patient_id,relationship,status)
     VALUES (?,?,?,?, 'active')`,
    [uuidv4(), caregiver.id, patient.id, 'Family']
  );
  expect(await authorizedRooms({ id: caregiver.id, role: 'caregiver' })).toContain(
    `caregiver_patient:${patient.id}`
  );
});

test('notification ownership prevents cross-account reads and mutations', async () => {
  const notificationId = uuidv4();
  await pool.execute(
    `INSERT INTO portal_notifications (id,user_id,type,title,body,event_key)
     VALUES (?,?,?,?,?,?)`,
    [notificationId, caregiver.id, 'TEST', 'Caregiver notice', 'Private body', `test:${notificationId}`]
  );

  const patientList = await request(app).get('/api/notifications').set(auth(patient.token));
  expect(patientList.status).toBe(200);
  expect(patientList.body.notifications).toEqual([]);

  const denied = await request(app)
    .patch(`/api/notifications/${notificationId}/read`)
    .set(auth(patient.token));
  expect(denied.status).toBe(404);

  const ownerList = await request(app).get('/api/notifications').set(auth(caregiver.token));
  expect(ownerList.body.unread_count).toBe(1);
  expect(ownerList.body.notifications[0].id).toBe(notificationId);
  const marked = await request(app)
    .patch(`/api/notifications/${notificationId}/read`)
    .set(auth(caregiver.token));
  expect(marked.status).toBe(200);
});
