import { createHash } from 'node:crypto';
import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { setPasswordResetDeliveryForTests } from '../services/passwordResetDelivery.js';
import { createPrivilegedTestUser } from './helpers/testUsers.js';

const OLD_PASSWORD = 'OriginalPassword2026';
const NEW_PASSWORD = 'ReplacementPassword2026';
const deliveries = [];

beforeAll(() => {
  setPasswordResetDeliveryForTests(async (message) => deliveries.push(message));
});

afterAll(async () => {
  setPasswordResetDeliveryForTests(null);
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

async function requestToken(email) {
  const before = deliveries.length;
  const response = await request(app).post('/api/auth/forgot-password').send({ email });
  expect(response.status).toBe(202);
  expect(deliveries).toHaveLength(before + 1);
  return { response, ...deliveries.at(-1) };
}

describe('forgot-password', () => {
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

  test('normalizes email for registration, login, and reset lookup', async () => {
    const canonical = `normalized.${Date.now()}@test.pharmate`;
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: `  ${canonical.toUpperCase()}  `, password: OLD_PASSWORD, role: 'patient' });
    expect(response.status).toBe(201);
    const [rows] = await pool.execute('SELECT id, email FROM users WHERE email = ?', [canonical]);
    const user = rows[0];
    expect(user.email).toBe(canonical);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: ` ${canonical.toUpperCase()} `, password: OLD_PASSWORD })
      ).status
    ).toBe(200);
    const delivery = await requestToken(` ${canonical.toUpperCase()} `);
    expect(delivery.email).toBe(canonical);
  });

  test('stores only the SHA-256 token hash and does not expose the token over HTTP', async () => {
    const email = `forgot.hash.${Date.now()}@test.pharmate`;
    const user = await register(email);
    const { response, rawToken } = await requestToken(email);
    const [rows] = await pool.execute(
      'SELECT token_hash FROM password_reset_tokens WHERE user_id = ? ORDER BY created_at DESC',
      [user.id]
    );
    expect(rows[0].token_hash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(rows[0].token_hash).not.toBe(rawToken);
    expect(JSON.stringify(response.body)).not.toContain(rawToken);
  });

  test('does not deliver reset mail for an inactive account', async () => {
    const email = `forgot.inactive.${Date.now()}@test.pharmate`;
    const user = await register(email);
    await pool.execute('UPDATE users SET is_active = 0 WHERE id = ?', [user.id]);
    const before = deliveries.length;
    const response = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(response.status).toBe(202);
    expect(deliveries).toHaveLength(before);
  });

  test('an issued token cannot reset an account after it becomes inactive', async () => {
    const email = `reset.inactive.${Date.now()}@test.pharmate`;
    const user = await register(email);
    const { rawToken } = await requestToken(email);
    await pool.execute('UPDATE users SET is_active = 0 WHERE id = ?', [user.id]);
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, new_password: NEW_PASSWORD });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid or expired reset token' });
  });
});

describe('reset-password', () => {
  test('rejects expired, malformed, and superseded tokens with one generic response', async () => {
    const email = `reset.invalid.${Date.now()}@test.pharmate`;
    const user = await register(email);
    const first = await requestToken(email);
    const second = await requestToken(email);
    await pool.execute(
      'UPDATE password_reset_tokens SET expires_at = DATE_SUB(NOW(3), INTERVAL 1 SECOND) WHERE token_hash = ?',
      [createHash('sha256').update(second.rawToken).digest('hex')]
    );
    const attempts = [first.rawToken, second.rawToken, 'malformed-token'];
    const responses = await Promise.all(
      attempts.map((token) =>
        request(app).post('/api/auth/reset-password').send({ token, new_password: NEW_PASSWORD })
      )
    );
    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid or expired reset token' });
    }
    expect(user.id).toBeTruthy();
  });

  test('enforces password policy before consuming a token', async () => {
    const email = `reset.policy.${Date.now()}@test.pharmate`;
    await register(email);
    const { rawToken } = await requestToken(email);
    const rejected = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, new_password: 'short' });
    expect(rejected.status).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/auth/reset-password')
          .send({ token: rawToken, new_password: NEW_PASSWORD })
      ).status
    ).toBe(200);
  });

  test('is single-use and permits only one concurrent reset', async () => {
    const email = `reset.concurrent.${Date.now()}@test.pharmate`;
    await register(email);
    const { rawToken } = await requestToken(email);
    const results = await Promise.all(
      [NEW_PASSWORD, 'AnotherReplacement2026'].map((new_password) =>
        request(app).post('/api/auth/reset-password').send({ token: rawToken, new_password })
      )
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    const reused = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, new_password: 'ThirdReplacement2026' });
    expect(reused.status).toBe(400);
  });

  test('changes login credentials and invalidates all access and refresh sessions', async () => {
    const email = `reset.sessions.${Date.now()}@test.pharmate`;
    await register(email);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: OLD_PASSWORD });
    const secondLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: OLD_PASSWORD });
    const { rawToken, url } = await requestToken(email);
    expect(url).toBe(`https://test.pharmate.example/reset-password?token=${rawToken}`);
    expect(
      (
        await request(app)
          .post('/api/auth/reset-password')
          .send({ token: rawToken, new_password: NEW_PASSWORD })
      ).status
    ).toBe(200);
    expect(
      (await request(app).post('/api/auth/login').send({ email, password: OLD_PASSWORD })).status
    ).toBe(401);
    expect(
      (await request(app).post('/api/auth/login').send({ email, password: NEW_PASSWORD })).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${login.body.accessToken}`)
          .send({})
      ).status
    ).toBe(401);
    for (const refreshToken of [login.body.refreshToken, secondLogin.body.refreshToken]) {
      expect((await request(app).post('/api/auth/refresh').send({ refreshToken })).status).toBe(
        401
      );
    }
  });
});
