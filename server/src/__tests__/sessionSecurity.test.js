import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createAccessToken, createPrivilegedTestUser } from './helpers/testUsers.js';

const CURRENT_PASSWORD = 'CorrectHorseBattery1';
const NEW_PASSWORD = 'EvenSaferPassword2026';

async function createUser(role = 'caregiver') {
  const email = `${role}.session.${Date.now()}.${Math.random()}@test.pharmate`;
  const id = await createPrivilegedTestUser({ email, password: CURRENT_PASSWORD, role });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email, password: CURRENT_PASSWORD });
  expect(login.status).toBe(200);
  return { id, email, ...login.body };
}

async function protectedRequest(accessToken) {
  return request(app)
    .post('/api/auth/logout')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({});
}

describe('password changes and immediate session invalidation', () => {
  test('changes a password, revokes every refresh token, and invalidates old access', async () => {
    const user = await createUser();
    const secondLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: CURRENT_PASSWORD });

    const changed = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ current_password: CURRENT_PASSWORD, new_password: NEW_PASSWORD });

    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({ message: 'Password changed successfully' });
    expect(await protectedRequest(user.accessToken)).toHaveProperty('status', 401);
    for (const refreshToken of [user.refreshToken, secondLogin.body.refreshToken]) {
      const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken });
      expect(refreshed.status).toBe(401);
    }
    expect(
      (
        await request(app).post('/api/auth/login').send({
          email: user.email,
          password: CURRENT_PASSWORD,
        })
      ).status
    ).toBe(401);
    expect(
      (
        await request(app).post('/api/auth/login').send({
          email: user.email,
          password: NEW_PASSWORD,
        })
      ).status
    ).toBe(200);
  });

  test('rejects a wrong current password', async () => {
    const user = await createUser('pharmacist');
    const response = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ current_password: 'WrongPassword123', new_password: NEW_PASSWORD });
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid credentials' });
  });

  test.each([
    ['short', 'too-short'],
    ['excessively long', 'x'.repeat(73)],
    ['the current password', CURRENT_PASSWORD],
  ])('rejects %s new passwords', async (_case, newPassword) => {
    const user = await createUser('admin');
    const response = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ current_password: CURRENT_PASSWORD, new_password: newPassword });
    expect(response.status).toBe(400);
  });

  test('registration uses the same password length policy', async () => {
    const email = `policy.${Date.now()}@test.pharmate`;
    const short = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'too-short', role: 'patient' });
    const long = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'x'.repeat(73), role: 'patient' });
    expect(short.status).toBe(400);
    expect(long.status).toBe(400);
  });

  test('logout-all invalidates access and all refresh sessions', async () => {
    const user = await createUser();
    const secondLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: CURRENT_PASSWORD });
    const response = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({});
    expect(response.status).toBe(200);
    expect(await protectedRequest(secondLogin.body.accessToken)).toHaveProperty('status', 401);
    for (const refreshToken of [user.refreshToken, secondLogin.body.refreshToken]) {
      expect((await request(app).post('/api/auth/refresh').send({ refreshToken })).status).toBe(
        401
      );
    }
  });

  test('ordinary logout revokes only the supplied refresh token', async () => {
    const user = await createUser();
    const secondLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: CURRENT_PASSWORD });
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ refreshToken: user.refreshToken });
    expect(
      (await request(app).post('/api/auth/refresh').send({ refreshToken: user.refreshToken }))
        .status
    ).toBe(401);
    expect(
      (
        await request(app).post('/api/auth/refresh').send({
          refreshToken: secondLogin.body.refreshToken,
        })
      ).status
    ).toBe(200);
  });
});

describe('database-backed access authentication', () => {
  test('rejects an admin-deactivated account immediately for access and refresh', async () => {
    const user = await createUser();
    await pool.execute('UPDATE users SET is_active = 0 WHERE id = ?', [user.id]);
    expect(await protectedRequest(user.accessToken)).toHaveProperty('status', 401);
    expect(
      (await request(app).post('/api/auth/refresh').send({ refreshToken: user.refreshToken }))
        .status
    ).toBe(401);
  });

  test('rejects a token after its user is deleted', async () => {
    const user = await createUser();
    await pool.execute('DELETE FROM users WHERE id = ?', [user.id]);
    expect(await protectedRequest(user.accessToken)).toHaveProperty('status', 401);
  });

  test('rejects a token-version mismatch', async () => {
    const user = await createUser();
    const mismatched = await createAccessToken(user.id, { sessionVersion: 999 });
    expect(await protectedRequest(mismatched)).toHaveProperty('status', 401);
  });

  test('rejects legacy tokens without a session version', async () => {
    const user = await createUser();
    const legacy = jwt.sign({ sub: user.id, role: 'caregiver' }, process.env.JWT_SECRET, {
      expiresIn: '5m',
    });
    expect(await protectedRequest(legacy)).toHaveProperty('status', 401);
  });
});
