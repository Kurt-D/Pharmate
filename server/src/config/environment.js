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
  if (
    env.JWT_SECRET &&
    env.JWT_REFRESH_SECRET &&
    env.JWT_SECRET === env.JWT_REFRESH_SECRET
  ) {
    errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (env.AES_KEY && !/^[a-fA-F0-9]{64}$/.test(env.AES_KEY)) {
    errors.push('AES_KEY must be exactly 64 hexadecimal characters');
  }

  if (errors.length > 0) {
    const error = new Error(`Invalid server configuration: ${errors.join('; ')}`);
    error.code = 'INVALID_SERVER_CONFIGURATION';
    throw error;
  }
}

export function trustedOrigins(env = process.env) {
  const configured = (env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const localDevelopment =
    env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  return new Set([...configured, ...localDevelopment]);
}

export { MIN_JWT_SECRET_LENGTH, REQUIRED_VARIABLES };
