import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { encrypt } from '../utils/crypto.js';
import { generatePatientCode } from '../utils/patientCode.js';
import { requireAuth } from '../middleware/auth.js';
import { failedAttemptLimit, rateLimit } from '../middleware/rateLimit.js';
import { issueSelfHostedCaptcha, verifyCaptcha } from '../middleware/verifyTurnstile.js';
import { validatePassword } from '../utils/passwordPolicy.js';
import { normalizeEmail } from '../utils/email.js';
import { sendOtpEmail } from '../services/emailService.js';
import {
  invalidateUndeliveredOtp,
  issueOtp,
  OTP_PURPOSE,
  OTP_RESEND_MS,
  verifyOtp,
} from '../services/otpService.js';
import { recordAudit } from '../services/audit.js';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  isStaffRole,
  signMfaToken,
  staffMfaRequired,
  totpUri,
  verifyMfaToken,
  verifyTotp,
} from '../services/staffMfa.js';

const router = Router();

// Authentication responses can contain access, refresh, MFA, or password-reset
// credentials. Never allow browsers, proxies, or CDNs to retain them.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_DAYS = Number(process.env.JWT_REFRESH_EXPIRES_DAYS) || 30;
// bcrypt cost is 12 in production (D-G). Overridable so CI/tests aren't dominated
// by intentionally-slow hashing; production must leave BCRYPT_COST unset.
const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 12;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ACCOUNT_LOCK_THRESHOLD = 5;
const ACCOUNT_LOCK_BASE_MINUTES = 15;
const FORGOT_RESPONSE = {
  message: 'If the email exists, a 6-digit code has been sent',
};
const INVALID_RESET_RESPONSE = { error: 'Invalid or expired password reset request' };
const INVALID_PIN_RESPONSE = { error: 'Invalid or expired PIN' };
const REFRESH_COOKIE = 'pm_refresh';
const CSRF_COOKIE = 'pm_csrf';

function cookieValue(req, name) {
  return String(req.headers.cookie || '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}
function authCookieOptions(httpOnly) {
  const secure = process.env.NODE_ENV === 'production' || process.env.AUTH_COOKIE_SECURE === 'true';
  return { httpOnly, secure, sameSite: process.env.AUTH_COOKIE_SAME_SITE || 'lax', path: '/api/auth' };
}
function issueSession(res, session, status = 200) {
  const csrfToken = randomBytes(32).toString('hex');
  const lifetime = session.persistent ? { maxAge: REFRESH_DAYS * 86400000 } : {};
  res.cookie(REFRESH_COOKIE, session.refreshToken, { ...authCookieOptions(true), ...lifetime });
  res.cookie(CSRF_COOKIE, csrfToken, { ...authCookieOptions(false), ...lifetime });
  const safeSession = { ...session };
  delete safeSession.refreshToken;
  return res.status(status).json({ ...safeSession, csrfToken });
}
function clearSessionCookies(res) {
  res.clearCookie(REFRESH_COOKIE, authCookieOptions(true));
  res.clearCookie(CSRF_COOKIE, authCookieOptions(false));
}
function requireCsrf(req, res, next) {
  const cookie = cookieValue(req, CSRF_COOKIE);
  const header = req.get('x-csrf-token');
  if (!cookie || !header || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) return res.status(403).json({ error: 'CSRF validation failed' });
  return next();
}

const registerLimit = rateLimit({
  scope: 'auth-register',
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 5,
});
const loginLimit = failedAttemptLimit({
  scope: 'auth-login',
  windowMs: FIFTEEN_MINUTES,
  max: 5,
  keyGenerator: (req) => `${req.ip || 'unknown'}:${normalizeEmail(req.body?.email) || '-'}`,
});
const refreshLimit = rateLimit({ scope: 'auth-refresh', windowMs: FIFTEEN_MINUTES, max: 30 });
const forgotIpLimit = rateLimit({
  scope: 'auth-forgot-ip',
  windowMs: FIFTEEN_MINUTES,
  max: process.env.NODE_ENV === 'test' ? 1000 : 3,
});
const forgotEmailLimit = rateLimit({
  scope: 'auth-forgot-email',
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 3,
  keyGenerator: (req) => normalizeEmail(req.body?.email) || 'invalid-email',
});
const otpResendLimit = rateLimit({
  scope: 'auth-otp-resend',
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 1,
  keyGenerator: (req) => normalizeEmail(req.body?.email) || req.ip || 'invalid-email',
});
const resetLimit = rateLimit({ scope: 'auth-reset', windowMs: FIFTEEN_MINUTES, max: 10 });
const verifyPinLimit = rateLimit({
  scope: 'auth-verify-pin',
  windowMs: FIFTEEN_MINUTES,
  max: 10,
});
const captchaIssueLimit = rateLimit({
  scope: 'auth-captcha',
  windowMs: FIFTEEN_MINUTES,
  max: 30,
});
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const PATIENT_CHALLENGE_THRESHOLD = 3;

async function requireRiskBasedHumanVerification(req, res, next) {
  const email = normalizeEmail(req.body?.email);
  if (!email) return next();

  try {
    const [[candidate]] = await pool.execute(
      `SELECT id, role, failed_login_attempts
       FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    // Patients are challenged only after repeated failures. Staff retains the
    // existing stricter bot-verification posture before its MFA step.
    const required = Boolean(
      candidate &&
        (isStaffRole(candidate.role) ||
          (candidate.role === 'patient' &&
            Number(candidate.failed_login_attempts || 0) >= PATIENT_CHALLENGE_THRESHOLD))
    );
    if (!required) return next();

    req.humanVerificationRequired = true;
    await recordAudit({
      actor: candidate,
      action: 'human_verification_required',
      entityType: 'user_security',
      entityId: candidate.id,
      metadata: { reason: isStaffRole(candidate.role) ? 'staff_login' : 'repeated_failed_logins' },
    });
    res.once('finish', () => {
      if (res.statusCode >= 400) {
        void recordAudit({
          actor: candidate,
          action: 'human_verification_failed',
          entityType: 'user_security',
          entityId: candidate.id,
          metadata: { reason: 'verification_denied' },
        }).catch((error) => {
          console.error('Unable to record human-verification failure', { message: error.message });
        });
      }
    });
    return verifyCaptcha(req, res, next);
  } catch (error) {
    return next(error);
  }
}

function validateRecoveryPassword(password) {
  const policyError = validatePassword(password);
  if (policyError) return policyError;
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter';
  if (!/\d/.test(password)) return 'Password must include a number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must include a special character';
  return null;
}

function validateRegistrationEmail(email) {
  if (!email) return 'Email address is required';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return 'Enter a valid email address';
  }
  return null;
}

function validateFullName(fullName) {
  // Older public registration clients collect this later in the patient
  // profile. Keep the field optional at account creation, but validate it
  // strictly whenever a value is supplied.
  if (fullName === undefined || fullName === null) return null;
  if (typeof fullName !== 'string') return 'Full name is required';
  const value = fullName.trim();
  const containsControlCharacter = [...value].some((character) => {
    const code = character.codePointAt(0);
    return code <= 31 || code === 127;
  });
  if (value.length < 2 || value.length > 100 || containsControlCharacter) {
    return 'Enter a valid full name (2 to 100 characters)';
  }
  const letters = value.match(/\p{L}/gu) || [];
  if (letters.length < 1) return 'Full name must contain at least one letter';
  return null;
}

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}

function signResetToken({ userId, resetId, sessionVersion }) {
  return jwt.sign(
    {
      sub: userId,
      jti: String(resetId),
      userId,
      resetId,
      purpose: 'password-reset',
      sessionVersion,
    },
    process.env.RESET_TOKEN_SECRET ||
      process.env.PASSWORD_RESET_JWT_SECRET ||
      process.env.JWT_REFRESH_SECRET,
    {
      audience: 'pharmate-password-reset',
      issuer: 'pharmate-api',
      expiresIn: '10m',
    }
  );
}

function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

function refreshExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_DAYS);
  return d;
}

function lockDurationMinutes(failedAttempts) {
  const lockLevel = Math.max(0, Math.floor((failedAttempts - ACCOUNT_LOCK_THRESHOLD) / 5));
  return Math.min(60, ACCOUNT_LOCK_BASE_MINUTES * 2 ** lockLevel);
}

async function createSession(user, executor = pool, options = {}) {
  let extra = {};
  if (user.role === 'patient') {
    const [patientRows] = await executor.execute('SELECT patient_code FROM patients WHERE id = ?', [
      user.id,
    ]);
    extra = { patientCode: patientRows[0]?.patient_code ?? null };
  }
  const accessToken = signAccess({
    sub: user.id,
    id: user.id,
    email: user.email,
    role: user.role,
    sessionVersion: user.session_version,
  });
  const rawRefresh = randomBytes(40).toString('hex');
  const refreshId = uuidv4();
  // Staff keep the pre-existing persistent-session behavior. Patients opt in
  // explicitly, so closing a browser normally clears their session cookie.
  const persistent = user.role === 'patient' ? Boolean(options.persistent) : true;
  const deviceLabel = String(options.deviceLabel || '').trim().slice(0, 160) || null;
  await executor.execute(
    `INSERT INTO refresh_tokens (id,user_id,family_id,token_hash,expires_at,persistent,device_label,last_used_at)
     VALUES (?,?,?,?,?,?,?,NOW(3))`,
    [refreshId, user.id, refreshId, hashToken(rawRefresh), refreshExpiresAt(), persistent ? 1 : 0, deviceLabel]
  );
  const profile = { id: user.id, email: user.email, role: user.role, ...extra };
  return { accessToken, refreshToken: rawRefresh, role: user.role, profile, user: profile, persistent };
}

async function createPatientRecords(conn, userId, fullName) {
  const patientCode = await generatePatientCode();
  await conn.execute('INSERT INTO patients (id, patient_code, full_name_enc) VALUES (?, ?, ?)', [
    userId,
    patientCode,
    fullName ? encrypt(fullName) : null,
  ]);
  await conn.execute('INSERT INTO patient_anchors (patient_id) VALUES (?)', [userId]);
  await conn.execute('INSERT INTO patient_preferences (patient_id) VALUES (?)', [userId]);
  await conn.execute('INSERT INTO patient_safety_profiles (patient_id) VALUES (?)', [userId]);
}

async function createPublicRoleRecords(conn, userId, role, fullName) {
  if (role === 'patient') {
    await createPatientRecords(conn, userId, fullName);
    return;
  }
  await conn.execute('INSERT INTO caregivers (id, full_name) VALUES (?, ?)', [
    userId,
    fullName || 'PharMate Caregiver',
  ]);
  await conn.execute(
    'INSERT INTO caregiver_profiles (caregiver_id, display_name_enc) VALUES (?, ?)',
    [userId, fullName ? encrypt(fullName) : null]
  );
}

// ── GET /api/auth/captcha (explicit self-hosted fallback only) ────────────────
router.get('/captcha', captchaIssueLimit, issueSelfHostedCaptcha);

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', registerLimit, verifyCaptcha, async (req, res) => {
  const testRequiresVerification =
    process.env.NODE_ENV === 'test' && req.get('x-test-email-verification') === 'required';
  const testAutoVerify = process.env.NODE_ENV === 'test' && !testRequiresVerification;
  const developmentAutoVerify =
    process.env.NODE_ENV === 'development' &&
    process.env.EMAIL_ENABLED !== 'true' &&
    process.env.PASSWORD_RESET_EMAIL_ENABLED !== 'true';
  const {
    password,
    confirmPassword,
    confirm_password: confirmPasswordSnake,
    role,
    full_name,
    contact_num,
    address,
    medical_condition,
  } = req.body;
  const email = normalizeEmail(req.body.email);

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password, and role are required' });
  }
  const emailError = validateRegistrationEmail(email);
  if (emailError) return res.status(400).json({ error: emailError });
  if (!['patient', 'caregiver'].includes(role)) {
    return res
      .status(403)
      .json({ error: 'Public registration is available to patients and caregivers' });
  }
  const confirmation = confirmPassword ?? confirmPasswordSnake;
  if (confirmation !== undefined && password !== confirmation) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }
  const [existing] = await pool.execute(
    'SELECT id,email,role,is_verified,session_version,password_hash FROM users WHERE email = ?',
    [email]
  );
  if (existing.length > 0) {
    if (!existing[0].is_verified) {
      if (developmentAutoVerify) {
        const passwordMatches = await bcrypt.compare(password, existing[0].password_hash);
        if (!passwordMatches || existing[0].role !== role) {
          return res.status(409).json({ error: 'Email already registered' });
        }
        await pool.execute(
          'UPDATE users SET is_verified=1,email_verified_at=COALESCE(email_verified_at,NOW(3)) WHERE id=?',
          [existing[0].id]
        );
        return issueSession(res, await createSession(existing[0]));
      }
      const otpConn = await pool.getConnection();
      let issued;
      try {
        await otpConn.beginTransaction();
        issued = await issueOtp(otpConn, existing[0].id, OTP_PURPOSE.EMAIL_VERIFICATION);
        await otpConn.commit();
      } catch (error) {
        await otpConn.rollback();
        throw error;
      } finally {
        otpConn.release();
      }
      if (issued.cooldownSeconds) {
        return res.status(200).json({
          message: 'A verification code was sent recently. Check your email or wait to resend.',
          verificationRequired: true,
          codeSent: false,
          retryAfter: issued.cooldownSeconds,
          email,
        });
      }
      try {
        await sendOtpEmail({
          email,
          otp: issued.otp,
          purpose: OTP_PURPOSE.EMAIL_VERIFICATION,
        });
      } catch (error) {
        await invalidateUndeliveredOtp(pool, issued.id);
        console.error('Email verification delivery failed', {
          code: error?.code || 'EMAIL_PROVIDER_ERROR',
          status: error?.response?.status || null,
        });
        return res.status(503).json({
          code: 'EMAIL_DELIVERY_FAILED',
          message: 'The verification email could not be sent. Please retry.',
          verificationRequired: true,
          email,
        });
      }
      return res.status(200).json({
        message: 'A new verification code was sent to your email.',
        verificationRequired: true,
        codeSent: true,
        retryAfter: Math.ceil(OTP_RESEND_MS / 1000),
        email,
      });
    }
    return res.status(409).json({ error: 'Email already registered' });
  }

  const fullNameError = validateFullName(full_name);
  if (fullNameError) return res.status(400).json({ error: fullNameError });
  const passwordError = validateRecoveryPassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const userId = uuidv4();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO users (id, email, password_hash, role, is_verified, email_verified_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        email,
        passwordHash,
        role,
        testAutoVerify || developmentAutoVerify ? 1 : 0,
        testAutoVerify || developmentAutoVerify ? new Date() : null,
      ]
    );

    if (role === 'patient') {
      await createPatientRecords(conn, userId, full_name?.trim());
      const patientDetails = { contact_num, address, medical_condition };
      const patientUpdates = Object.entries(patientDetails).filter(([, value]) => value);
      if (patientUpdates.length) {
        await conn.execute(
          `UPDATE patients SET ${patientUpdates.map(([field]) => `${field}_enc=?`).join(',')} WHERE id=?`,
          [...patientUpdates.map(([, value]) => encrypt(value)), userId]
        );
      }
    } else {
      await createPublicRoleRecords(conn, userId, role, full_name?.trim());
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Existing integration suites provision accounts through this public route.
  // Production can never enter this branch; OTP-specific tests opt in explicitly.
  if (testAutoVerify) return res.status(201).json({ message: 'Account created.' });
  if (developmentAutoVerify) {
    return issueSession(res, await createSession({ id: userId, email, role, session_version: 0 }), 201);
  }

  const connForOtp = await pool.getConnection();
  let issued;
  try {
    await connForOtp.beginTransaction();
    issued = await issueOtp(connForOtp, userId, OTP_PURPOSE.EMAIL_VERIFICATION);
    await connForOtp.commit();
  } catch (error) {
    await connForOtp.rollback();
    throw error;
  } finally {
    connForOtp.release();
  }
  try {
    await sendOtpEmail({ email, otp: issued.otp, purpose: OTP_PURPOSE.EMAIL_VERIFICATION });
  } catch (error) {
    await invalidateUndeliveredOtp(pool, issued.id);
    console.error('Email verification delivery failed', {
      code: error?.code || 'EMAIL_PROVIDER_ERROR',
      status: error?.response?.status || null,
    });
    return res.status(503).json({
      code: 'EMAIL_DELIVERY_FAILED',
      message: 'Account created, but the verification email could not be sent. Please retry.',
      verificationRequired: true,
      email,
    });
  }
  res.status(201).json({
    message: 'Account created. Enter the verification code sent to your email.',
    verificationRequired: true,
    codeSent: true,
    retryAfter: Math.ceil(OTP_RESEND_MS / 1000),
    email,
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', loginLimit, requireRiskBasedHumanVerification, async (req, res) => {
  const { password, role: selectedRole, accountGroup } = req.body;
  const email = normalizeEmail(req.body.email);
  if (!email || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const emailError = validateRegistrationEmail(email);
  if (emailError) return res.status(400).json({ error: emailError });
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Password must not exceed 72 UTF-8 bytes' });
  }
  if (selectedRole !== undefined && !['patient', 'caregiver'].includes(selectedRole)) {
    return res.status(400).json({ error: 'Invalid mobile account type' });
  }
  if (accountGroup !== undefined && accountGroup !== 'staff') {
    return res.status(400).json({ error: 'Invalid account group' });
  }
  if (selectedRole && accountGroup) {
    return res.status(400).json({ error: 'Choose either a mobile role or the staff portal' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT id, email, password_hash, role, is_active, is_verified, session_version,
              failed_login_attempts, account_locked_until, mfa_secret_enc,
              mfa_enabled, mfa_last_counter
       FROM users WHERE email = ? FOR UPDATE`,
      [email]
    );
    const user = rows[0];
    const humanVerificationUsed = req.humanVerificationRequired === true;
    const lockedUntil = user?.account_locked_until
      ? new Date(user.account_locked_until).getTime()
      : 0;
    if (user && lockedUntil > Date.now()) {
      const retryAfter = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
      await recordAudit({
        actor: user,
        action: 'login_blocked',
        entityType: 'user_security',
        entityId: user.id,
        metadata: { reason: 'account_locked' },
        executor: conn,
      });
      await conn.commit();
      res.set('Retry-After', String(retryAfter));
      return res.status(423).json({ error: 'Account temporarily locked', retryAfter });
    }

    // Always perform bcrypt work, including for unknown and OAuth-only accounts.
    const hashToCheck =
      user?.password_hash ?? '$2a$12$invalidhashpadding000000000000000000000000000000000000000';
    const match = await bcrypt.compare(password, hashToCheck);

    if (!user || !match || !user.is_active) {
      let retryAfter = 0;
      let failedAttempts = null;
      if (user) {
        failedAttempts = Number(user.failed_login_attempts || 0) + 1;
        const lockMinutes =
          failedAttempts >= ACCOUNT_LOCK_THRESHOLD ? lockDurationMinutes(failedAttempts) : 0;
        const lockUntil = lockMinutes ? new Date(Date.now() + lockMinutes * 60 * 1000) : null;
        retryAfter = lockUntil ? lockMinutes * 60 : 0;
        await conn.execute(
          `UPDATE users
           SET failed_login_attempts = ?, account_locked_until = ?
           WHERE id = ?`,
          [failedAttempts, lockUntil, user.id]
        );
      }
      await recordAudit({
        actor: user || null,
        action: 'login_failed',
        entityType: 'user_security',
        entityId: user?.id || null,
        metadata: {
          reason: 'invalid_credentials',
          accountKnown: Boolean(user),
          accountLocked: Boolean(retryAfter),
          failedAttempts,
        },
        executor: conn,
      });
      await conn.commit();
      if (retryAfter) {
        res.set('Retry-After', String(retryAfter));
        return res.status(423).json({ error: 'Account temporarily locked', retryAfter });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_verified) {
      await recordAudit({
        actor: user,
        action: 'login_blocked',
        entityType: 'user_security',
        entityId: user.id,
        metadata: { reason: 'email_verification_required' },
        executor: conn,
      });
      await conn.commit();
      return res.status(403).json({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        error: 'Verify your email before signing in.',
      });
    }

    const roleMismatch = selectedRole && user.role !== selectedRole;
    const staffMismatch = accountGroup === 'staff' && !['pharmacist', 'admin'].includes(user.role);
    if (roleMismatch || staffMismatch) {
      await recordAudit({
        actor: user,
        action: 'login_blocked',
        entityType: 'user_security',
        entityId: user.id,
        metadata: { reason: 'account_type_mismatch' },
        executor: conn,
      });
      await conn.commit();
      return res.status(403).json({ error: 'This account does not match the selected login type' });
    }

    if (staffMfaRequired() && isStaffRole(user.role)) {
      await conn.execute(
        'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL WHERE id = ?',
        [user.id]
      );
      await conn.commit();
      if (!user.mfa_enabled) {
        const secret = generateTotpSecret();
        return res.status(428).json({
          code: 'MFA_SETUP_REQUIRED',
          setupToken: signMfaToken(user, 'mfa-setup', { secret: encryptTotpSecret(secret) }),
          secret,
          otpauthUri: totpUri(user.email, secret),
        });
      }
      return res.status(202).json({
        code: 'MFA_REQUIRED',
        mfaToken: signMfaToken(user, 'mfa-challenge'),
      });
    }

    await conn.execute(
      'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL WHERE id = ?',
      [user.id]
    );
    const session = await createSession(user, conn, {
      persistent: user.role === 'patient' && req.body?.staySignedIn === true,
      deviceLabel: req.get('user-agent'),
    });
    await recordAudit({
      actor: user,
      action: 'login_succeeded',
      entityType: 'session',
      entityId: user.id,
      metadata: { method: 'password' },
      executor: conn,
    });
    if (humanVerificationUsed) {
      await recordAudit({
        actor: user,
        action: 'human_verification_passed',
        entityType: 'user_security',
        entityId: user.id,
        metadata: { method: 'risk_based_login' },
        executor: conn,
      });
    }
    await conn.commit();
    return issueSession(res, session);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

router.post('/mfa/enroll/verify', resetLimit, async (req, res) => {
  let claims;
  try {
    claims = verifyMfaToken(req.body?.setupToken, 'mfa-setup');
  } catch {
    return res.status(401).json({ error: 'MFA enrollment expired. Sign in again.' });
  }
  const secret = decryptTotpSecret(claims.secret);
  const counter = verifyTotp(secret, req.body?.code);
  if (counter === null) return res.status(401).json({ error: 'Invalid authenticator code' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      'SELECT id,email,role,is_active,session_version FROM users WHERE id=? FOR UPDATE',
      [claims.sub]
    );
    const user = rows[0];
    if (
      !user?.is_active ||
      user.session_version !== claims.sessionVersion ||
      !isStaffRole(user.role)
    ) {
      await conn.rollback();
      return res.status(401).json({ error: 'MFA enrollment expired. Sign in again.' });
    }
    await conn.execute(
      'UPDATE users SET mfa_secret_enc=?,mfa_enabled=1,mfa_last_counter=? WHERE id=?',
      [encryptTotpSecret(secret), counter, user.id]
    );
    const session = await createSession(user, conn);
    await recordAudit({
      actor: user,
      action: 'mfa_enrolled',
      entityType: 'user_security',
      entityId: user.id,
      metadata: { method: 'totp' },
      executor: conn,
    });
    await recordAudit({
      actor: user,
      action: 'login_succeeded',
      entityType: 'session',
      entityId: user.id,
      metadata: { method: 'password_totp_enrollment' },
      executor: conn,
    });
    await conn.commit();
    return issueSession(res, session);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

router.post('/mfa/verify', resetLimit, async (req, res) => {
  let claims;
  try {
    claims = verifyMfaToken(req.body?.mfaToken, 'mfa-challenge');
  } catch {
    return res.status(401).json({ error: 'MFA challenge expired. Sign in again.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT id,email,role,is_active,session_version,mfa_secret_enc,mfa_last_counter
       FROM users WHERE id=? FOR UPDATE`,
      [claims.sub]
    );
    const user = rows[0];
    if (
      !user?.is_active ||
      user.session_version !== claims.sessionVersion ||
      !user.mfa_secret_enc
    ) {
      await conn.rollback();
      return res.status(401).json({ error: 'MFA challenge expired. Sign in again.' });
    }
    const counter = verifyTotp(
      decryptTotpSecret(user.mfa_secret_enc),
      req.body?.code,
      Date.now(),
      user.mfa_last_counter
    );
    if (counter === null) {
      await conn.rollback();
      return res.status(401).json({ error: 'Invalid authenticator code' });
    }
    await conn.execute('UPDATE users SET mfa_last_counter=? WHERE id=?', [counter, user.id]);
    const session = await createSession(user, conn);
    await recordAudit({
      actor: user,
      action: 'login_succeeded',
      entityType: 'session',
      entityId: user.id,
      metadata: { method: 'password_totp' },
      executor: conn,
    });
    await conn.commit();
    return issueSession(res, session);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

// ── POST /api/auth/google ─────────────────────────────────────────────────────
router.post('/google', loginLimit, async (req, res) => {
  const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
  const requestedRole = req.body?.role === undefined ? null : String(req.body.role).toLowerCase();
  const audience = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!credential || !audience) {
    return res.status(400).json({ error: 'Google sign-in is not configured or is incomplete' });
  }

  let googleProfile;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience });
    googleProfile = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Google authentication could not be verified' });
  }
  const email = normalizeEmail(googleProfile?.email);
  const googleId = googleProfile?.sub;
  if (!email || !googleId || googleProfile?.email_verified !== true) {
    return res.status(401).json({ error: 'A verified Google email is required' });
  }
  if (requestedRole && !['patient', 'caregiver'].includes(requestedRole)) {
    return res.status(400).json({ error: 'Google sign-up supports patient or caregiver accounts' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT id, email, role, google_id, is_active, session_version
       FROM users WHERE google_id = ? OR email = ? FOR UPDATE`,
      [googleId, email]
    );
    let user = rows.find((row) => row.google_id === googleId) || rows[0];

    if (user && (!user.is_active || !['patient', 'caregiver'].includes(user.role))) {
      await conn.rollback();
      return res
        .status(403)
        .json({ error: 'Google sign-in is available only to patient and caregiver accounts' });
    }
    if (user && requestedRole && user.role !== requestedRole) {
      await conn.rollback();
      return res
        .status(403)
        .json({ error: 'This account does not match the selected account type' });
    }
    if (user && user.google_id && user.google_id !== googleId) {
      await conn.rollback();
      return res.status(409).json({ error: 'This email is already linked to another sign-in' });
    }

    if (!user) {
      const userId = uuidv4();
      const role = requestedRole || 'patient';
      await conn.execute(
        `INSERT INTO users
           (id, email, password_hash, google_id, role, is_verified, email_verified_at)
         VALUES (?, ?, NULL, ?, ?, 1, NOW(3))`,
        [userId, email, googleId, role]
      );
      await createPublicRoleRecords(
        conn,
        userId,
        role,
        String(
          googleProfile.name || (role === 'caregiver' ? 'PharMate Caregiver' : 'PharMate Patient')
        )
      );
      user = { id: userId, email, role, session_version: 0 };
    } else if (!user.google_id) {
      await conn.execute(
        `UPDATE users
         SET google_id = ?, is_verified = 1, email_verified_at = COALESCE(email_verified_at, NOW(3)),
             failed_login_attempts = 0, account_locked_until = NULL
         WHERE id = ?`,
        [googleId, user.id]
      );
    }

    const session = await createSession(user, conn);
    await conn.commit();
    return issueSession(res, session);
  } catch (error) {
    await conn.rollback();
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This Google account is already linked' });
    }
    throw error;
  } finally {
    conn.release();
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post(
  '/forgot-password',
  forgotIpLimit,
  verifyCaptcha,
  otpResendLimit,
  forgotEmailLimit,
  async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    let delivery = null;

    if (email) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.execute(
          'SELECT id, email, role FROM users WHERE email = ? AND is_active = 1 FOR UPDATE',
          [email]
        );
        const user = rows[0];
        if (user) {
          const issued = await issueOtp(conn, user.id, OTP_PURPOSE.PASSWORD_RESET);
          if (!issued.cooldownSeconds) {
            delivery = { email: user.email, otp: issued.otp, otpId: issued.id };
            if (user.role === 'admin') {
              await recordAudit({
                actor: { id: user.id, role: 'admin' }, action: 'ADMIN_RECOVERY_REQUESTED',
                entityType: 'user_security', entityId: user.id,
                metadata: { recovery_method: 'email_otp' }, executor: conn,
              });
            }
          }
        }
        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    }

    // Delivery happens after persistence. Failure is deliberately hidden so this endpoint's
    // status and body cannot disclose whether an eligible account was found.
    if (delivery) {
      try {
        await sendOtpEmail({ ...delivery, purpose: OTP_PURPOSE.PASSWORD_RESET });
      } catch (error) {
        await invalidateUndeliveredOtp(pool, delivery.otpId);
        console.error('Password-reset email delivery failed', {
          code: error?.code || 'EMAIL_PROVIDER_ERROR',
          status: error?.response?.status || null,
        });
      }
    }
    return res.status(200).json(FORGOT_RESPONSE);
  }
);

// ── POST /api/auth/verify-pin ────────────────────────────────────────────────
router.post(
  ['/verify-pin', '/verify-reset-pin', '/verify-reset-otp'],
  verifyPinLimit,
  async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const pin = String(req.body?.otp ?? req.body?.pin ?? '').trim();
    if (!email || !/^\d{6}$/.test(pin)) return res.status(400).json(INVALID_PIN_RESPONSE);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[user]] = await conn.execute(
        'SELECT id,is_active,session_version FROM users WHERE email=? FOR UPDATE',
        [email]
      );
      const result = user
        ? await verifyOtp(conn, user.id, OTP_PURPOSE.PASSWORD_RESET, pin)
        : { valid: false };
      if (!user?.is_active || !result.valid) {
        await conn.commit();
        return res.status(400).json({
          ...INVALID_PIN_RESPONSE,
          code: result.code === 'OTP_EXPIRED' ? 'OTP_EXPIRED' : 'OTP_INVALID',
        });
      }

      const resetToken = signResetToken({
        userId: user.id,
        resetId: result.id,
        sessionVersion: user.session_version,
      });
      await conn.commit();
      return res.json({ reset_token: resetToken, resetToken, expiresIn: 600 });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
);

router.post('/verify-email', verifyPinLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const otp = String(req.body?.otp ?? '').trim();
  if (!email || !/^\d{6}$/.test(otp)) return res.status(400).json(INVALID_PIN_RESPONSE);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[user]] = await conn.execute(
      'SELECT id,email,role,is_active,is_verified,session_version FROM users WHERE email=? FOR UPDATE',
      [email]
    );
    if (!user?.is_active) {
      await conn.rollback();
      return res.status(400).json(INVALID_PIN_RESPONSE);
    }
    if (user.is_verified) {
      await conn.rollback();
      return res.status(409).json({ error: 'Email is already verified', code: 'ALREADY_VERIFIED' });
    }
    const result = await verifyOtp(conn, user.id, OTP_PURPOSE.EMAIL_VERIFICATION, otp);
    if (!result.valid) {
      await conn.commit();
      return res.status(400).json({
        ...INVALID_PIN_RESPONSE,
        code: result.code === 'OTP_EXPIRED' ? 'OTP_EXPIRED' : 'OTP_INVALID',
      });
    }
    await conn.execute('UPDATE users SET is_verified=1,email_verified_at=NOW(3) WHERE id=?', [
      user.id,
    ]);
    const session = await createSession(user, conn);
    await conn.commit();
    res.set('X-Session-Message', 'Email verified successfully');
    return issueSession(res, session);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

router.post('/resend-verification-otp', forgotEmailLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const conn = await pool.getConnection();
  let delivery = null;
  let cooldownSeconds = 0;
  try {
    await conn.beginTransaction();
    const [[user]] = await conn.execute(
      'SELECT id,email,is_verified FROM users WHERE email=? AND is_active=1 FOR UPDATE',
      [email]
    );
    if (user && !user.is_verified) {
      const issued = await issueOtp(conn, user.id, OTP_PURPOSE.EMAIL_VERIFICATION);
      cooldownSeconds = issued.cooldownSeconds || 0;
      if (!cooldownSeconds) delivery = { email: user.email, otp: issued.otp, otpId: issued.id };
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  if (cooldownSeconds) {
    res.set('Retry-After', String(cooldownSeconds));
    return res
      .status(429)
      .json({ error: 'Please wait before requesting another code', retryAfter: cooldownSeconds });
  }
  if (delivery) {
    try {
      await sendOtpEmail({ ...delivery, purpose: OTP_PURPOSE.EMAIL_VERIFICATION });
    } catch (error) {
      await invalidateUndeliveredOtp(pool, delivery.otpId);
      console.error('Email verification delivery failed', {
        code: error?.code || 'EMAIL_PROVIDER_ERROR',
        status: error?.response?.status || null,
      });
      return res.status(503).json({
        code: 'EMAIL_DELIVERY_FAILED',
        error: 'Verification email could not be sent',
      });
    }
  }
  return res.json({ message: 'If verification is required, a code has been sent.' });
});

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post('/reset-password', resetLimit, async (req, res) => {
  const {
    token,
    reset_token: resetTokenSnake,
    new_password: newPassword,
    confirm_password: confirmPassword,
    confirmPassword: confirmPasswordCamel,
  } = req.body || {};
  const passwordError = validateRecoveryPassword(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  const confirmation = confirmPassword ?? confirmPasswordCamel;
  if (confirmation !== undefined && confirmation !== newPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  let claims;
  try {
    claims = jwt.verify(
      resetTokenSnake || token,
      process.env.RESET_TOKEN_SECRET ||
        process.env.PASSWORD_RESET_JWT_SECRET ||
        process.env.JWT_REFRESH_SECRET,
      { audience: 'pharmate-password-reset', issuer: 'pharmate-api' }
    );
  } catch {
    return res.status(400).json(INVALID_RESET_RESPONSE);
  }
  const resetUserId = claims?.userId || claims?.sub;
  const resetId = claims?.resetId || claims?.jti;
  if (claims?.purpose !== 'password-reset' || !resetUserId || !resetId) {
    return res.status(400).json(INVALID_RESET_RESPONSE);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT oc.id, oc.user_id, oc.expires_at, oc.used_at, u.is_active, u.session_version, u.role
       FROM otp_codes oc
       JOIN users u ON u.id = oc.user_id
       WHERE oc.id = ? AND oc.user_id = ? AND oc.purpose='PASSWORD_RESET'
       FOR UPDATE`,
      [resetId, resetUserId]
    );
    const record = rows[0];
    if (
      !record ||
      !record.used_at ||
      !record.is_active ||
      Number(record.session_version) !== Number(claims.sessionVersion) ||
      new Date(record.expires_at) <= new Date()
    ) {
      await conn.rollback();
      return res.status(400).json(INVALID_RESET_RESPONSE);
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await conn.execute(
      `UPDATE users
       SET password_hash = ?, session_version = session_version + 1,
           failed_login_attempts = 0, account_locked_until = NULL
       WHERE id = ?`,
      [passwordHash, record.user_id]
    );
    await conn.execute(
      `UPDATE otp_codes SET used_at=COALESCE(used_at,NOW(3))
       WHERE user_id=? AND purpose='PASSWORD_RESET'`,
      [record.user_id]
    );
    await conn.execute(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW(3) WHERE user_id = ? AND revoked = 0',
      [record.user_id]
    );
    await recordAudit({
      actor: { id: record.user_id, role: record.role },
      action: record.role === 'admin' ? 'ADMIN_PASSWORD_RESET_COMPLETED' : 'password_reset_completed',
      entityType: 'user_security',
      entityId: record.user_id,
      metadata: { sessionsRevoked: true, recovery_method: 'email_otp' },
      executor: conn,
    });
    await conn.commit();
    return res.json({ message: 'Password reset successfully' });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post('/refresh', refreshLimit, requireCsrf, async (req, res) => {
  const refreshToken = cookieValue(req, REFRESH_COOKIE);
  if (!refreshToken) return res.status(401).json({ error: 'Invalid or expired refresh token' });

  const tokenHash = hashToken(refreshToken);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      `SELECT rt.id,rt.user_id,rt.family_id,rt.persistent,rt.device_label,rt.expires_at,rt.revoked,rt.replaced_by_id,
              u.email,u.role,u.is_active,u.session_version
       FROM refresh_tokens rt
       JOIN users u ON u.id=rt.user_id
       WHERE rt.token_hash=? FOR UPDATE`,
      [tokenHash]
    );
    const record = rows[0];
    if (!record || !record.is_active || new Date(record.expires_at) < new Date()) {
      await conn.rollback();
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    if (req.get('x-patient-session-restore') === '1' && record.role !== 'patient') {
      await conn.rollback();
      return res.status(401).json({ error: 'A patient session is required.' });
    }
    if (record.revoked) {
      if (record.replaced_by_id) {
        await conn.execute(
          `UPDATE refresh_tokens SET revoked=1,revoked_at=COALESCE(revoked_at,NOW(3))
           WHERE family_id=? AND revoked=0`,
          [record.family_id]
        );
        await recordAudit({
          actor: { id: record.user_id, role: record.role },
          action: 'refresh_token_reuse_detected',
          entityType: 'user_security',
          entityId: record.user_id,
          metadata: { tokenFamilyRevoked: true },
          executor: conn,
        });
        await conn.commit();
      } else {
        await conn.rollback();
      }
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const replacementId = uuidv4();
    const newRaw = randomBytes(40).toString('hex');
    await conn.execute(
      `UPDATE refresh_tokens
       SET revoked=1,revoked_at=NOW(3),replaced_by_id=? WHERE id=? AND revoked=0`,
      [replacementId, record.id]
    );
    await conn.execute(
      `INSERT INTO refresh_tokens (id,user_id,family_id,token_hash,expires_at,persistent,device_label,last_used_at)
       VALUES (?,?,?,?,?,?,?,NOW(3))`,
      [replacementId, record.user_id, record.family_id, hashToken(newRaw), refreshExpiresAt(), record.persistent, record.device_label]
    );
    const accessToken = signAccess({
      sub: record.user_id,
      id: record.user_id,
      email: record.email,
      role: record.role,
      sessionVersion: record.session_version,
    });
    await conn.commit();
    const profile = { id: record.user_id, email: record.email, role: record.role };
    return issueSession(res, { accessToken, refreshToken: newRaw, user: profile, profile, persistent: Boolean(record.persistent) });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', requireAuth, requireCsrf, async (req, res) => {
  const refreshToken = cookieValue(req, REFRESH_COOKIE);
  let revokedCurrentSession = false;
  if (refreshToken) {
    const [result] = await pool.execute(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW(3) WHERE token_hash = ? AND user_id = ?',
      [hashToken(refreshToken), req.user.sub]
    );
    revokedCurrentSession = result.affectedRows > 0;
  }
  await recordAudit({
    actor: req.user,
    action: 'logout_completed',
    entityType: 'user_security',
    entityId: req.user.sub,
    metadata: { revokedCurrentSession },
  });
  clearSessionCookies(res);
  res.json({ message: 'Logged out' });
});

// ── POST /api/auth/change-password ───────────────────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password: currentPassword, new_password: newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  const passwordError = validateRecoveryPassword(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      'SELECT password_hash FROM users WHERE id = ? AND is_active = 1 FOR UPDATE',
      [req.user.sub]
    );
    const user = rows[0];
    const matches = user?.password_hash
      ? await bcrypt.compare(currentPassword, user.password_hash)
      : false;
    if (!matches) {
      await conn.rollback();
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.password_hash && (await bcrypt.compare(newPassword, user.password_hash))) {
      await conn.rollback();
      return res.status(400).json({ error: 'New password must differ from current password' });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await conn.execute(
      'UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?',
      [passwordHash, req.user.sub]
    );
    await conn.execute(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW(3) WHERE user_id = ? AND revoked = 0',
      [req.user.sub]
    );
    await recordAudit({
      actor: req.user,
      action: 'password_changed',
      entityType: 'user_security',
      entityId: req.user.sub,
      metadata: { sessionsRevoked: true },
      executor: conn,
    });
    await conn.commit();
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

// ── POST /api/auth/logout-all ────────────────────────────────────────────────
router.post('/logout-all', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('UPDATE users SET session_version = session_version + 1 WHERE id = ?', [
      req.user.sub,
    ]);
    await conn.execute(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = NOW(3) WHERE user_id = ? AND revoked = 0',
      [req.user.sub]
    );
    await recordAudit({
      actor: req.user,
      action: 'logout_all_completed',
      entityType: 'user_security',
      entityId: req.user.sub,
      metadata: { sessionsRevoked: true },
      executor: conn,
    });
    await conn.commit();
    res.json({ message: 'Logged out from all sessions' });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

export default router;
