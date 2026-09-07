import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { setEmailDeliveryForTests } from '../services/emailService.js';

const deliveries = [];
const password = 'VerificationPassword!2026';

beforeAll(() => setEmailDeliveryForTests(async (message) => deliveries.push(message)));
afterAll(async () => {
  setEmailDeliveryForTests(null);
  await pool.end();
});

describe('registration email OTP', () => {
  test('verifies once, marks the timestamp, and isolates OTP purpose', async () => {
    const email = `verify.${Date.now()}@test.pharmate`;
    const registered = await request(app).post('/api/auth/register').send({
      email,
      password,
      role: 'patient',
      full_name: 'Email Verification Test',
    });
    expect(registered.status).toBe(201);
    expect(registered.body).not.toHaveProperty('accessToken');
    const verification = deliveries.at(-1);
    expect(verification.purpose).toBe('EMAIL_VERIFICATION');

    const wrongPurpose = await request(app)
      .post('/api/auth/verify-reset-otp')
      .send({ email, otp: verification.otp });
    expect(wrongPurpose.status).toBe(400);

    const verified = await request(app)
      .post('/api/auth/verify-email')
      .send({ email, otp: verification.otp });
    expect(verified.status).toBe(200);
    expect(verified.body.user.role).toBe('patient');
    const [[user]] = await pool.execute(
      'SELECT is_verified,email_verified_at FROM users WHERE email=?',
      [email]
    );
    expect(user.is_verified).toBe(1);
    expect(user.email_verified_at).toBeTruthy();

    const reused = await request(app)
      .post('/api/auth/verify-email')
      .send({ email, otp: verification.otp });
    expect(reused.status).toBe(409);
    expect(reused.body).not.toHaveProperty('accessToken');
    expect(deliveries.some((message) => JSON.stringify(message).includes(password))).toBe(false);
  });

  test('enforces the resend cooldown in the database-backed service', async () => {
    const email = `cooldown.${Date.now()}@test.pharmate`;
    await request(app).post('/api/auth/register').send({
      email,
      password,
      role: 'caregiver',
      full_name: 'Cooldown Test',
    });
    const response = await request(app).post('/api/auth/resend-verification-otp').send({ email });
    expect(response.status).toBe(429);
    expect(response.body.retryAfter).toBeGreaterThan(0);
  });

  test('allows an immediate retry when the provider rejected the original email', async () => {
    const email = `delivery-failure.${Date.now()}@test.pharmate`;
    setEmailDeliveryForTests(async () => {
      const error = new Error('simulated provider rejection');
      error.code = 'EMAIL_PROVIDER_ERROR';
      throw error;
    });
    const registered = await request(app).post('/api/auth/register').send({
      email,
      password,
      role: 'patient',
      full_name: 'Delivery Failure Test',
    });
    expect(registered.status).toBe(503);
    expect(registered.body.code).toBe('EMAIL_DELIVERY_FAILED');

    setEmailDeliveryForTests(async (message) => deliveries.push(message));
    const resent = await request(app)
      .post('/api/auth/resend-verification-otp')
      .send({ email });
    expect(resent.status).toBe(200);
    expect(deliveries.at(-1).email).toBe(email);
  });
});
