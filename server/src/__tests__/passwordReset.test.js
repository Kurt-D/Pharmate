import bcrypt from 'bcryptjs';
import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { setPasswordResetDeliveryForTests } from '../services/passwordResetDelivery.js';
import { createPrivilegedTestUser } from './helpers/testUsers.js';

const OLD_PASSWORD = 'OriginalPassword2026';
const NEW_PASSWORD = 'ReplacementPassword!2026';
const deliveries = [];

beforeAll(() => setPasswordResetDeliveryForTests(async (message) => deliveries.push(message)));
afterAll(async () => {
  setPasswordResetDeliveryForTests(null);
  await pool.end();
});

async function register(email) {
  const normalized = email.trim().toLowerCase();
  const id = await createPrivilegedTestUser({
    email: normalized,
    password: OLD_PASSWORD,
    role: 'caregiver',
    fullName: 'Password Reset Test',
  });
  return { id, email: normalized };
}

async function requestPin(email) {
  const before = deliveries.length;
  const response = await request(app).post('/api/auth/forgot-password').send({ email });
  expect(response.status).toBe(200);
  expect(deliveries).toHaveLength(before + 1);
  return { response, ...deliveries.at(-1) };
}

async function verifyPin(email, pin) {
  return request(app).post('/api/auth/verify-pin').send({ email, pin });
}

describe('PIN password recovery', () => {
  test('existing and nonexistent emails have indistinguishable HTTP responses', async () => {
    const email = `forgot.equal.${Date.now()}@test.pharmate`;
    await register(email);
    const existing = await request(app).post('/api/auth/forgot-password').send({ email });
    const missing = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: `missing.${Date.now()}@test.pharmate` });
    expect({ status: existing.status, body: existing.body }).toEqual({
      status: missing.status,
      body: missing.body,
    });
  });

  test('stores only a bcrypt PIN hash and never returns the PIN over HTTP', async () => {
    const email = `forgot.hash.${Date.now()}@test.pharmate`;
    const user = await register(email);
    const { response, pin } = await requestPin(email);
    const [rows] = await pool.execute(
      'SELECT pin_hash FROM password_resets WHERE user_id = ? ORDER BY created_at DESC',
      [user.id]
    );
    expect(await bcrypt.compare(pin, rows[0].pin_hash)).toBe(true);
    expect(rows[0].pin_hash).not.toBe(pin);
    expect(JSON.stringify(response.body)).not.toContain(pin);
  });

  test('rejects an expired PIN and locks a PIN after three incorrect attempts', async () => {
    const expiredEmail = `reset.expired.${Date.now()}@test.pharmate`;
    const expiredUser = await register(expiredEmail);
    const expired = await requestPin(expiredEmail);
    await pool.execute(
      'UPDATE password_resets SET expires_at = DATE_SUB(NOW(3), INTERVAL 1 SECOND) WHERE user_id = ?',
      [expiredUser.id]
    );
    expect((await verifyPin(expiredEmail, expired.pin)).status).toBe(400);

    const lockedEmail = `reset.locked.${Date.now()}@test.pharmate`;
    await register(lockedEmail);
    const current = await requestPin(lockedEmail);
    const wrongPin = current.pin === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await verifyPin(lockedEmail, wrongPin)).status).toBe(400);
    }
    expect((await verifyPin(lockedEmail, current.pin)).status).toBe(400);
  });

  test('resets once, revokes sessions, and clears account lockout state', async () => {
    const email = `reset.sessions.${Date.now()}@test.pharmate`;
    const user = await register(email);
    const login = await request(app).post('/api/auth/login').send({ email, password: OLD_PASSWORD });
    const { pin } = await requestPin(email);
    const verified = await verifyPin(email, pin);
    expect(verified.status).toBe(200);
    expect(verified.body.resetToken).toBeTruthy();

    await pool.execute(
      'UPDATE users SET failed_login_attempts = 5, account_locked_until = DATE_ADD(NOW(3), INTERVAL 15 MINUTE) WHERE id = ?',
      [user.id]
    );
    const reset = await request(app).post('/api/auth/reset-password').send({
      token: verified.body.resetToken,
      new_password: NEW_PASSWORD,
      confirm_password: NEW_PASSWORD,
    });
    expect(reset.status).toBe(200);
    expect(
      (await request(app).post('/api/auth/login').send({ email, password: NEW_PASSWORD })).status
    ).toBe(200);
    expect(
      (await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken }))
        .status
    ).toBe(401);
    expect(
      (
        await request(app).post('/api/auth/reset-password').send({
          token: verified.body.resetToken,
          new_password: 'ThirdReplacement!2026',
        })
      ).status
    ).toBe(400);
  });
});
