import { createHmac, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { decrypt, encrypt } from '../utils/crypto.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STAFF_ROLES = new Set(['pharmacist', 'admin']);

export function staffMfaRequired(env = process.env) {
  return env.STAFF_MFA_REQUIRED === 'true' || env.NODE_ENV === 'production';
}

export function isStaffRole(role) {
  return STAFF_ROLES.has(role);
}

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let result = '';
  for (let index = 0; index < bits.length; index += 5) {
    result += ALPHABET[parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
  }
  return result;
}

function base32Decode(value) {
  const bits = String(value)
    .replace(/=+$/g, '')
    .toUpperCase()
    .split('')
    .map((character) => ALPHABET.indexOf(character).toString(2).padStart(5, '0'))
    .join('');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function encryptTotpSecret(secret) {
  return encrypt(secret);
}

export function decryptTotpSecret(secret) {
  return decrypt(secret);
}

export function totpUri(email, secret) {
  const label = encodeURIComponent(`PharMate:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=PharMate&algorithm=SHA1&digits=6&period=30`;
}

export function totpCode(secret, counter) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(bytes).digest();
  const position = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(position) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret, code, now = Date.now(), priorCounter = null) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const current = Math.floor(now / 30_000);
  for (let offset = -1; offset <= 1; offset += 1) {
    const counter = current + offset;
    if (priorCounter !== null && counter <= Number(priorCounter)) continue;
    if (totpCode(secret, counter) === String(code)) return counter;
  }
  return null;
}

export function signMfaToken(user, purpose, extra = {}) {
  return jwt.sign(
    { sub: user.id, role: user.role, purpose, sessionVersion: user.session_version, ...extra },
    process.env.JWT_REFRESH_SECRET,
    { audience: 'pharmate-staff-mfa', issuer: 'pharmate-api', expiresIn: '5m' }
  );
}

export function verifyMfaToken(token, purpose) {
  const claims = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
    audience: 'pharmate-staff-mfa',
    issuer: 'pharmate-api',
  });
  if (claims.purpose !== purpose || !isStaffRole(claims.role)) throw new Error('Invalid MFA token');
  return claims;
}
