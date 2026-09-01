import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { URLSearchParams } from 'node:url';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import svgCaptcha from 'svg-captcha';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_ALWAYS_PASS_TEST_SECRET = '1x0000000000000000000000000000000AA';
const TURNSTILE_TEST_HOSTNAME = 'dummy-key-pass';
const CAPTCHA_COOKIE = 'pm_captcha_challenge';
const CAPTCHA_TTL_SECONDS = 5 * 60;
const FAILURE = { error: 'Security check failed. Please verify you are human.' };
let bypassWarningShown = false;

function developmentBypassEnabled() {
  return process.env.NODE_ENV === 'development' && process.env.DISABLE_CAPTCHA === 'true';
}

function provider() {
  return String(process.env.CAPTCHA_PROVIDER || 'turnstile')
    .trim()
    .toLowerCase();
}

function signingSecret() {
  return (
    process.env.CAPTCHA_SIGNING_SECRET || process.env.RESET_TOKEN_SECRET || process.env.JWT_SECRET
  );
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        return separator < 0
          ? [part, '']
          : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      })
  );
}

function cookieOptions(maxAge = CAPTCHA_TTL_SECONDS) {
  const attributes = [
    `${CAPTCHA_COOKIE}=`,
    'Path=/api/auth',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes;
}

function clearCaptchaCookie(res) {
  res.setHeader('Set-Cookie', cookieOptions(0).join('; '));
}

function digest(value) {
  return createHash('sha256').update(String(value).trim().toLowerCase()).digest();
}

function expectedAction(req) {
  if (req.path.endsWith('/login')) return 'login';
  if (req.path.endsWith('/register')) return 'register';
  if (req.path.endsWith('/forgot-password')) return 'forgot_password';
  return '';
}

function allowedHostnames() {
  return new Set(
    String(process.env.TURNSTILE_ALLOWED_HOSTNAMES || '')
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function issueSelfHostedCaptcha(_req, res) {
  if (provider() !== 'self-hosted') {
    return res.status(404).json({ error: 'Self-hosted CAPTCHA is not enabled' });
  }

  const challenge = svgCaptcha.create({
    size: 5,
    noise: 3,
    color: true,
    background: '#f8fafc',
    width: 230,
    height: 72,
    ignoreChars: '0oO1ilI',
  });
  const token = jwt.sign(
    {
      purpose: 'self-hosted-captcha',
      challengeHash: digest(challenge.text).toString('hex'),
      jti: randomUUID(),
    },
    signingSecret(),
    { expiresIn: CAPTCHA_TTL_SECONDS, audience: 'pharmate-captcha', issuer: 'pharmate-api' }
  );
  const attributes = cookieOptions();
  attributes[0] = `${CAPTCHA_COOKIE}=${encodeURIComponent(token)}`;
  res.setHeader('Set-Cookie', attributes.join('; '));
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ svg: challenge.data, expiresIn: CAPTCHA_TTL_SECONDS });
}

function verifySelfHosted(req, res, next) {
  const answer = typeof req.body?.captchaAnswer === 'string' ? req.body.captchaAnswer : '';
  const signedChallenge = parseCookies(req.headers.cookie)[CAPTCHA_COOKIE];
  clearCaptchaCookie(res);
  if (!answer || !signedChallenge) return res.status(400).json(FAILURE);

  try {
    const claims = jwt.verify(signedChallenge, signingSecret(), {
      audience: 'pharmate-captcha',
      issuer: 'pharmate-api',
    });
    if (claims?.purpose !== 'self-hosted-captcha' || !claims?.challengeHash) {
      return res.status(400).json(FAILURE);
    }
    const expected = Buffer.from(claims.challengeHash, 'hex');
    const actual = digest(answer);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return res.status(400).json(FAILURE);
    }
    return next();
  } catch {
    return res.status(400).json(FAILURE);
  }
}

async function verifyTurnstile(req, res, next) {
  const token = String(req.body?.['cf-turnstile-response'] || req.body?.captchaToken || '').trim();
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !token || token.length > 2048) return res.status(400).json(FAILURE);

  try {
    const form = new URLSearchParams({
      secret,
      response: token,
      idempotency_key: randomUUID(),
    });
    if (req.ip) form.set('remoteip', req.ip);
    const { data } = await axios.post(TURNSTILE_VERIFY_URL, form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 7000,
    });

    const action = expectedAction(req);
    const hosts = allowedHostnames();
    const returnedHost = String(data?.hostname || '').toLowerCase();
    // Cloudflare's documented always-pass test pair deliberately returns the
    // sentinel hostname `dummy-key-pass`. Accept it only with the exact test
    // secret so localhost remains convenient without weakening production.
    const hostnameIsValid =
      secret === TURNSTILE_ALWAYS_PASS_TEST_SECRET
        ? returnedHost === TURNSTILE_TEST_HOSTNAME
        : hosts.size === 0 || hosts.has(returnedHost);
    const valid =
      data?.success === true &&
      (!action || !data.action || data.action === action) &&
      hostnameIsValid;
    return valid ? next() : res.status(400).json(FAILURE);
  } catch {
    return res.status(400).json(FAILURE);
  }
}

export function verifyCaptcha(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();
  if (developmentBypassEnabled()) {
    if (!bypassWarningShown) {
      console.warn('[DEV] Bot protection bypassed for local testing');
      bypassWarningShown = true;
    }
    return next();
  }
  if (provider() === 'self-hosted') return verifySelfHosted(req, res, next);
  if (provider() === 'turnstile') return verifyTurnstile(req, res, next);
  return res.status(400).json(FAILURE);
}

export { FAILURE as CAPTCHA_FAILURE };
