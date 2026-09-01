import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../index.js';
import { pool } from '../db/connection.js';
import {
  evaluateStreakDay,
  manilaDayKey,
} from '../services/streakLifecycle.js';

const PASSWORD = 'TestPass@123';
const stamp = Date.now();
let patientId;
let token;
let medicationId;

function shiftDay(dayKey, amount) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function manilaTime(dayKey, hour) {
  return new Date(`${dayKey}T${String(hour).padStart(2, '0')}:00:00+08:00`);
}

async function addDay(dayKey, statuses) {
  for (let index = 0; index < statuses.length; index++) {
    await pool.execute(
      `INSERT INTO medication_schedules
       (id, medication_id, patient_id, scheduled_time, generated_reason,
        is_confirmed, is_prn_slot, status)
       VALUES (?, ?, ?, ?, 'streak lifecycle test', 1, 0, ?)`,
      [uuidv4(), medicationId, patientId, manilaTime(dayKey, 8 + index), statuses[index]]
    );
  }
}

beforeAll(async () => {
  const email = `streak.${stamp}@test.pharmate`;
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD, role: 'patient', full_name: 'Streak Tester' });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  patientId = login.body.user.id;
  token = login.body.accessToken;
  medicationId = uuidv4();
  await pool.execute(
    `INSERT INTO medications
     (id, patient_id, drug_name_raw, source, frequency, status)
     VALUES (?, ?, 'Test Medicine', 'OTC_SELF', 'QD', 'active')`,
    [medicationId, patientId]
  );
});

afterAll(async () => pool.end());

test('a complete third day awards one token exactly once', async () => {
  const day = shiftDay(manilaDayKey(), -10);
  const previous = shiftDay(day, -1);
  await pool.execute(
    `INSERT INTO patient_streaks
     (patient_id, current_days, priority_tokens, last_completed_date)
     VALUES (?, 2, 0, ?)`,
    [patientId, previous]
  );
  await addDay(day, ['taken', 'taken_late']);

  const first = await evaluateStreakDay(patientId, day);
  const second = await evaluateStreakDay(patientId, day);
  expect(first).toMatchObject({ processed: true, result: 'complete', nextDays: 3, tokens: 1 });
  expect(second.processed).toBe(false);

  const [[streak]] = await pool.execute(
    'SELECT current_days, priority_tokens FROM patient_streaks WHERE patient_id = ?',
    [patientId]
  );
  expect(Number(streak.current_days)).toBe(3);
  expect(Number(streak.priority_tokens)).toBe(1);
  const [[notices]] = await pool.execute(
    `SELECT COUNT(*) AS count FROM patient_notifications
     WHERE patient_id = ? AND type = 'reward_earned'`,
    [patientId]
  );
  expect(Number(notices.count)).toBe(1);
});

test('a missed day resets the streak and creates one reset notice', async () => {
  const day = shiftDay(manilaDayKey(), -8);
  await addDay(day, ['taken', 'missed']);
  const result = await evaluateStreakDay(patientId, day);
  expect(result).toMatchObject({ processed: true, result: 'broken', nextDays: 0, tokens: 0 });
  const [[streak]] = await pool.execute(
    'SELECT current_days, priority_tokens FROM patient_streaks WHERE patient_id = ?',
    [patientId]
  );
  expect(Number(streak.current_days)).toBe(0);
  expect(Number(streak.priority_tokens)).toBe(1);
});

test('status endpoint returns the synchronized lifecycle contract', async () => {
  const response = await request(app)
    .get('/api/patient/streak/status')
    .set({ Authorization: `Bearer ${token}` });
  expect(response.status).toBe(200);
  expect(response.body).toEqual(
    expect.objectContaining({
      state: expect.stringMatching(/^(active|safe|at_risk|reward_ready|broken)$/),
      current_days: expect.any(Number),
      priority_tokens: expect.any(Number),
      reward_ready: expect.any(Boolean),
      today: expect.objectContaining({
        total: expect.any(Number),
        taken: expect.any(Number),
        missed: expect.any(Number),
        pending: expect.any(Number),
      }),
    })
  );
});
