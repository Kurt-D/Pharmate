import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index.js';
import { validateEnvironment } from '../config/environment.js';

const PASSWORD = 'TestPass@123';

describe('authentication rate limits', () => {
  test('blocks repeated failed login attempts before the general login limit', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post('/api/auth/login').send({ password: PASSWORD });
      expect(response.status).toBe(400);
    }

    const blocked = await request(app).post('/api/auth/login').send({ password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.headers).toHaveProperty('retry-after');
    expect(blocked.body).toEqual({ error: 'Too many failed attempts; try again later' });
  });

  test('limits registration requests', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post('/api/auth/register').send({});
      expect(response.status).toBe(400);
    }
    const blocked = await request(app).post('/api/auth/register').send({});
    expect(blocked.status).toBe(429);
  });

  test('limits refresh requests', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await request(app).post('/api/auth/refresh').send({});
      expect(response.status).toBe(400);
    }
    const blocked = await request(app).post('/api/auth/refresh').send({});
    expect(blocked.status).toBe(429);
  });

  test('applies the stricter failed-attempt limit to caregiver invite redemption', async () => {
    const accessToken = jwt.sign(
      { sub: 'security-test-caregiver', role: 'caregiver' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    const authorization = `Bearer ${accessToken}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post('/api/caregiver/link')
        .set('Authorization', authorization)
        .send({});
      expect(response.status).toBe(400);
    }
    const blocked = await request(app)
      .post('/api/caregiver/link')
      .set('Authorization', authorization)
      .send({});
    expect(blocked.status).toBe(429);
  });
});

describe('request boundary controls', () => {
  test('allows configured local development origins', async () => {
    const response = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  test('rejects an untrusted browser origin', async () => {
    const response = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Origin not allowed' });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('rejects oversized JSON request bodies', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'large@test.pharmate', password: 'x'.repeat(33 * 1024) });
    expect(response.status).toBe(413);
  });
});

describe('startup environment validation', () => {
  const validEnvironment = {
    DB_HOST: 'localhost',
    DB_NAME: 'pharmate',
    DB_USER: 'pharmate',
    JWT_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    AES_KEY: '0123456789abcdef'.repeat(4),
  };

  test('rejects missing required settings without exposing values', () => {
    const secret = 'do-not-expose-this-value';
    expect(() => validateEnvironment({ ...validEnvironment, DB_HOST: '', DB_PASS: secret })).toThrow(
      /Missing required environment variables: DB_HOST/
    );
    try {
      validateEnvironment({ ...validEnvironment, DB_HOST: '', DB_PASS: secret });
    } catch (error) {
      expect(error.message).not.toContain(secret);
    }
  });

  test('rejects short or shared JWT secrets', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, JWT_SECRET: 'short' })
    ).toThrow(/JWT_SECRET must be at least 64 characters/);
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_REFRESH_SECRET: validEnvironment.JWT_SECRET,
      })
    ).toThrow(/must be different/);
  });

  test('rejects AES keys that are not exactly 64 hexadecimal characters', () => {
    expect(() => validateEnvironment({ ...validEnvironment, AES_KEY: 'g'.repeat(64) })).toThrow(
      /AES_KEY must be exactly 64 hexadecimal characters/
    );
  });
});
