const REQUIRED_VARIABLES = [
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'AES_KEY',
];

const MIN_JWT_SECRET_LENGTH = 64;

export function validateEnvironment(env = process.env) {
  const missing = REQUIRED_VARIABLES.filter((name) => !env[name]?.trim());
  const errors = [];

  if (missing.length > 0) {
    errors.push(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (env.JWT_SECRET && env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }
  if (env.JWT_REFRESH_SECRET && env.JWT_REFRESH_SECRET.length < MIN_JWT_SECRET_LENGTH) {
    errors.push(`JWT_REFRESH_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }
  if (env.JWT_SECRET && env.JWT_REFRESH_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (env.AES_KEY && !/^[a-fA-F0-9]{64}$/.test(env.AES_KEY)) {
    errors.push('AES_KEY must be exactly 64 hexadecimal characters');
  }

  if (env.NODE_ENV === 'production') {
    if (!env.GOOGLE_CLIENT_ID?.trim()) errors.push('GOOGLE_CLIENT_ID is required in production');
    if (!env.OTP_SECRET?.trim() || env.OTP_SECRET.length < 64) {
      errors.push('OTP_SECRET must be at least 64 characters in production');
    }
  }
  const captchaProvider = String(env.CAPTCHA_PROVIDER || 'turnstile')
    .trim()
    .toLowerCase();
  const captchaDisabledInDevelopment =
    env.NODE_ENV === 'development' && env.DISABLE_CAPTCHA === 'true';
  if (env.DISABLE_CAPTCHA === 'true' && !['development', 'test'].includes(env.NODE_ENV)) {
    errors.push('DISABLE_CAPTCHA is allowed only when NODE_ENV=development');
  }
  if (!['turnstile', 'self-hosted'].includes(captchaProvider)) {
    errors.push('CAPTCHA_PROVIDER must be turnstile or self-hosted');
  }
  if (
    !captchaDisabledInDevelopment &&
    captchaProvider === 'turnstile' &&
    (env.NODE_ENV === 'production' || env.CAPTCHA_PROVIDER) &&
    !env.TURNSTILE_SECRET_KEY?.trim()
  ) {
    errors.push('TURNSTILE_SECRET_KEY is required when CAPTCHA_PROVIDER=turnstile');
  }
  if (env.CAPTCHA_SIGNING_SECRET && env.CAPTCHA_SIGNING_SECRET.length < 64) {
    errors.push('CAPTCHA_SIGNING_SECRET must be at least 64 characters');
  }
  if (env.PASSWORD_RESET_JWT_SECRET && env.PASSWORD_RESET_JWT_SECRET.length < 64) {
    errors.push('PASSWORD_RESET_JWT_SECRET must be at least 64 characters');
  }
  if (env.RESET_TOKEN_SECRET && env.RESET_TOKEN_SECRET.length < 64) {
    errors.push('RESET_TOKEN_SECRET must be at least 64 characters');
  }
  if (env.TRUST_PROXY_HOPS && !/^[1-9]\d*$/.test(env.TRUST_PROXY_HOPS)) {
    errors.push('TRUST_PROXY_HOPS must be a positive integer');
  }
  if (env.NODE_ENV === 'production' && env.STAFF_MFA_REQUIRED === 'false') {
    errors.push('STAFF_MFA_REQUIRED cannot be disabled in production');
  }

  if (
    (env.EMAIL_ENABLED === 'true' || env.PASSWORD_RESET_EMAIL_ENABLED === 'true') &&
    env.NODE_ENV !== 'test'
  ) {
    const emailProvider = String(env.EMAIL_PROVIDER || 'smtp').toLowerCase();
    if (!['smtp', 'resend'].includes(emailProvider)) {
      errors.push('EMAIL_PROVIDER must be smtp or resend');
    } else if (emailProvider === 'resend') {
      if (!env.RESEND_API_KEY?.trim()) errors.push('RESEND_API_KEY is required for Resend');
    } else {
      const smtpRequired = ['SMTP_HOST', 'SMTP_PORT'];
      const missingSmtp = smtpRequired.filter((name) => !env[name]?.trim());
      if (!(env.SMTP_USER || env.SMTP_USERNAME)?.trim()) missingSmtp.push('SMTP_USER');
      if (!(env.SMTP_PASS || env.SMTP_PASSWORD)?.trim()) missingSmtp.push('SMTP_PASS');
      if (missingSmtp.length) errors.push(`Missing email variables: ${missingSmtp.join(', ')}`);
      if (env.SMTP_PORT && !/^\d+$/.test(env.SMTP_PORT)) {
        errors.push('SMTP_PORT must be numeric');
      }
    }
    if (!(env.EMAIL_FROM || env.SMTP_FROM || env.SMTP_SENDER)?.trim()) {
      errors.push('EMAIL_FROM is required when email delivery is enabled');
    }
  }
  if (env.PASSWORD_RESET_DEV_LOG_TOKEN === 'true' && env.NODE_ENV !== 'development') {
    errors.push('PASSWORD_RESET_DEV_LOG_TOKEN is allowed only when NODE_ENV=development');
  }

  if (errors.length > 0) {
    const error = new Error(`Invalid server configuration: ${errors.join('; ')}`);
    error.code = 'INVALID_SERVER_CONFIGURATION';
    throw error;
  }
}

export function trustedProxyHops(env = process.env) {
  return env.TRUST_PROXY_HOPS ? Number(env.TRUST_PROXY_HOPS) : 0;
}

export function trustedOrigins(env = process.env) {
  const configured = (env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const localDevelopment =
    env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  return new Set([...configured, ...localDevelopment]);
}

export { MIN_JWT_SECRET_LENGTH, REQUIRED_VARIABLES };
