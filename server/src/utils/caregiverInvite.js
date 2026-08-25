import { createHash, createHmac, randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CAREGIVER_CODE_LENGTH = 6;
export const CAREGIVER_CODE_TTL_MS = 15 * 60 * 1000;

export function normalizeCaregiverCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function generateCaregiverCode() {
  let code = '';
  for (let index = 0; index < CAREGIVER_CODE_LENGTH; index += 1) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}

export function displayCaregiverCode(value) {
  const code = normalizeCaregiverCode(value);
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function hashCaregiverCode(value) {
  const secret = process.env.INVITE_CODE_PEPPER || process.env.JWT_SECRET;
  if (!secret) throw new Error('INVITE_CODE_PEPPER or JWT_SECRET is required');
  return createHmac('sha256', secret).update(normalizeCaregiverCode(value)).digest('hex');
}

// Temporary compatibility for an invite issued before migration 021.
export function legacyCaregiverCodeHash(value) {
  return createHash('sha256')
    .update(String(value || '').trim())
    .digest('hex');
}
