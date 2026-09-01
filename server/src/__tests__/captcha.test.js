import svgCaptcha from 'svg-captcha';
import axios from 'axios';
import { jest } from '@jest/globals';
import {
  CAPTCHA_FAILURE,
  issueSelfHostedCaptcha,
  verifyCaptcha,
} from '../middleware/verifyTurnstile.js';

function responseDouble() {
  return {
    body: null,
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe('CAPTCHA verification', () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.DISABLE_CAPTCHA;
    process.env.CAPTCHA_SIGNING_SECRET = 'captcha-test-secret-'.padEnd(64, 'x');
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.restoreAllMocks();
  });

  test('fails closed when a Turnstile token is missing', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.TURNSTILE_SECRET_KEY = 'configured-secret';
    const response = responseDouble();
    const next = jest.fn();
    await verifyCaptcha({ body: {}, ip: '127.0.0.1', path: '/login' }, response, next);
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual(CAPTCHA_FAILURE);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows the explicit CAPTCHA bypass only in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DISABLE_CAPTCHA = 'true';
    const response = responseDouble();
    const next = jest.fn();
    await verifyCaptcha({ body: {}, ip: '127.0.0.1', path: '/login' }, response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('does not allow the development CAPTCHA flag in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DISABLE_CAPTCHA = 'true';
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.TURNSTILE_SECRET_KEY = 'configured-secret';
    const response = responseDouble();
    const next = jest.fn();
    await verifyCaptcha({ body: {}, ip: '127.0.0.1', path: '/login' }, response, next);
    expect(response.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('accepts Cloudflare dummy hostname only with the documented test secret', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile';
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = 'localhost,127.0.0.1';
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: { success: true, hostname: 'dummy-key-pass', action: 'login' },
    });

    const response = responseDouble();
    const next = jest.fn();
    await verifyCaptcha(
      { body: { captchaToken: 'dummy-token' }, ip: '127.0.0.1', path: '/login' },
      response,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);
  });

  test('issues and verifies the explicitly selected self-hosted challenge once', () => {
    process.env.CAPTCHA_PROVIDER = 'self-hosted';
    jest.spyOn(svgCaptcha, 'create').mockReturnValue({ text: 'AbC23', data: '<svg />' });

    const issued = responseDouble();
    issueSelfHostedCaptcha({}, issued);
    expect(issued.statusCode).toBe(200);
    expect(issued.body).toEqual({ svg: '<svg />', expiresIn: 300 });

    const cookie = issued.headers['set-cookie'].split(';')[0];
    const verified = responseDouble();
    const next = jest.fn();
    verifyCaptcha(
      { body: { captchaAnswer: 'abc23' }, headers: { cookie }, path: '/login' },
      verified,
      next
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(verified.headers['set-cookie']).toContain('Max-Age=0');
  });

  test('rejects an incorrect self-hosted answer', () => {
    process.env.CAPTCHA_PROVIDER = 'self-hosted';
    jest.spyOn(svgCaptcha, 'create').mockReturnValue({ text: 'Right', data: '<svg />' });
    const issued = responseDouble();
    issueSelfHostedCaptcha({}, issued);

    const response = responseDouble();
    const next = jest.fn();
    verifyCaptcha(
      {
        body: { captchaAnswer: 'wrong' },
        headers: { cookie: issued.headers['set-cookie'].split(';')[0] },
        path: '/register',
      },
      response,
      next
    );
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual(CAPTCHA_FAILURE);
    expect(next).not.toHaveBeenCalled();
  });
});
