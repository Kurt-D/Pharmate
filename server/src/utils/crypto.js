/**
 * AES-256-GCM PII field encryption (D-H).
 *
 * Format stored in DB: base64(12-byte IV):base64(16-byte auth tag):base64(ciphertext)
 * Key source: AES_KEY env var — exactly 32 bytes expressed as 64 hex chars.
 *
 * Never call these functions with untrusted keys or outside the app layer.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function getKey() {
  const hex = process.env.AES_KEY;
  if (!hex || !/^[a-fA-F0-9]{64}$/.test(hex)) {
    throw new Error('AES_KEY must be exactly 64 hexadecimal characters');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string}  "base64iv:base64tag:base64ciphertext"
 */
export function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a value produced by encrypt().
 * @param {string} stored  "base64iv:base64tag:base64ciphertext"
 * @returns {string}
 */
export function decrypt(stored) {
  if (!stored) return null;
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted field format');
  const [ivB64, tagB64, ctB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
