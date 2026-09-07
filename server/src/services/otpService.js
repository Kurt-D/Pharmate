import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

export const OTP_PURPOSE = Object.freeze({
  PASSWORD_RESET: 'PASSWORD_RESET',
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
});
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MS = 60 * 1000;

function secret() {
  return process.env.OTP_SECRET || process.env.RESET_TOKEN_SECRET;
}

export function generateOtp() {
  return String(randomInt(100_000, 1_000_000));
}

export function hashOtp(userId, purpose, otp) {
  return createHmac('sha256', secret()).update(`${userId}:${purpose}:${otp}`).digest('hex');
}

export async function issueOtp(executor, userId, purpose, now = new Date()) {
  const [[latest]] = await executor.execute(
    `SELECT created_at FROM otp_codes
     WHERE user_id=? AND purpose=? AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [userId, purpose]
  );
  if (latest) {
    const remaining = OTP_RESEND_MS - (now.getTime() - new Date(latest.created_at).getTime());
    if (remaining > 0) return { cooldownSeconds: Math.ceil(remaining / 1000) };
  }
  await executor.execute(
    'UPDATE otp_codes SET used_at=? WHERE user_id=? AND purpose=? AND used_at IS NULL',
    [now, userId, purpose]
  );
  const otp = generateOtp();
  const id = uuidv4();
  await executor.execute(
    `INSERT INTO otp_codes (id,user_id,purpose,otp_hash,expires_at,created_at)
     VALUES (?,?,?,?,?,?)`,
    [
      id,
      userId,
      purpose,
      hashOtp(userId, purpose, otp),
      new Date(now.getTime() + OTP_TTL_MS),
      now,
    ]
  );
  return { id, otp, expiresAt: new Date(now.getTime() + OTP_TTL_MS) };
}

// A provider rejection means no usable code reached the user. Invalidate that
// code so the user can retry immediately instead of being trapped by cooldown.
export async function invalidateUndeliveredOtp(executor, otpId, now = new Date()) {
  if (!otpId) return;
  await executor.execute('UPDATE otp_codes SET used_at=? WHERE id=? AND used_at IS NULL', [
    now,
    otpId,
  ]);
}

export async function verifyOtp(executor, userId, purpose, otp, now = new Date()) {
  const [[record]] = await executor.execute(
    `SELECT id,otp_hash,expires_at,attempts,used_at FROM otp_codes
     WHERE user_id=? AND purpose=? ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [userId, purpose]
  );
  if (!record || record.used_at || new Date(record.expires_at) <= now) {
    return { valid: false, code: record && !record.used_at ? 'OTP_EXPIRED' : 'OTP_INVALID' };
  }
  if (Number(record.attempts) >= OTP_MAX_ATTEMPTS) return { valid: false, code: 'OTP_LOCKED' };
  const expected = Buffer.from(record.otp_hash, 'hex');
  const actual = Buffer.from(hashOtp(userId, purpose, otp), 'hex');
  const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!matches) {
    const attempts = Number(record.attempts) + 1;
    await executor.execute(
      'UPDATE otp_codes SET attempts=?,used_at=IF(? >= ?,?,used_at) WHERE id=?',
      [attempts, attempts, OTP_MAX_ATTEMPTS, now, record.id]
    );
    return { valid: false, code: attempts >= OTP_MAX_ATTEMPTS ? 'OTP_LOCKED' : 'OTP_INVALID' };
  }
  await executor.execute('UPDATE otp_codes SET used_at=? WHERE id=? AND used_at IS NULL', [
    now,
    record.id,
  ]);
  return { valid: true, id: record.id };
}
