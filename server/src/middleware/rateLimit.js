import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../db/connection.js';

const testRunScope = process.env.NODE_ENV === 'test' ? randomUUID() : '';
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

function reportPersistenceFailure(error, operation) {
  // A response may finish just as Jest tears its database pool down. The
  // counter is no longer needed in that completed test run, so avoid an
  // asynchronous console write after Jest has finished.
  if (process.env.NODE_ENV === 'test' && /pool is closed/i.test(error?.message || '')) return;
  console.error(`Failed to ${operation} rate-limit counter`, { message: error.message });
}

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function digestKey(scope, key) {
  return createHash('sha256')
    .update(`${testRunScope}:${scope}:${String(key)}`)
    .digest('hex');
}

async function pruneExpiredCounters(now = Date.now()) {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  try {
    // A bounded batch keeps normal authentication requests inexpensive even if
    // an attacker has generated many distinct hashed keys.
    await pool.execute('DELETE FROM request_rate_limits WHERE reset_at<=NOW(3) LIMIT 1000');
  } catch (error) {
    // Counter expiration is automatic on read; cleanup failure must not make
    // authentication unavailable.
    reportPersistenceFailure(error, 'prune expired');
  }
}

async function increment(scope, key, windowMs) {
  const keyHash = digestKey(scope, key);
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  await pool.execute(
    `INSERT INTO request_rate_limits (key_hash,request_count,reset_at)
     VALUES (?,1,?)
     ON DUPLICATE KEY UPDATE
       request_count=IF(reset_at<=?,1,request_count+1),
       reset_at=IF(reset_at<=?,VALUES(reset_at),reset_at)`,
    [keyHash, resetAt, now, now]
  );
  const [[record]] = await pool.execute(
    'SELECT request_count,reset_at FROM request_rate_limits WHERE key_hash=?',
    [keyHash]
  );
  return { count: Number(record.request_count), resetAt: new Date(record.reset_at) };
}

async function current(scope, key) {
  const [[record]] = await pool.execute(
    `SELECT request_count,reset_at FROM request_rate_limits
     WHERE key_hash=? AND reset_at>NOW(3)`,
    [digestKey(scope, key)]
  );
  return record
    ? { count: Number(record.request_count), resetAt: new Date(record.reset_at) }
    : null;
}

function setHeaders(res, max, record) {
  const resetAt = record?.resetAt || new Date();
  res.set('RateLimit-Limit', String(max));
  res.set('RateLimit-Remaining', String(Math.max(0, max - Number(record?.count || 0))));
  res.set('RateLimit-Reset', String(Math.ceil(resetAt.getTime() / 1000)));
}

function reject(res, record, message) {
  const retryAfter = Math.max(1, Math.ceil((record.resetAt.getTime() - Date.now()) / 1000));
  res.set('Retry-After', String(retryAfter));
  return res.status(429).json({ error: message });
}

export function rateLimit({
  scope,
  windowMs,
  max,
  keyGenerator = clientKey,
  message = 'Too many requests; try again later',
}) {
  if (!scope) throw new Error('A unique rate-limit scope is required');

  return async (req, res, next) => {
    const key = keyGenerator(req);
    try {
      await pruneExpiredCounters();
      const record = await increment(scope, key, windowMs);
      setHeaders(res, max, record);
      if (record.count > max) return reject(res, record, message);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function failedAttemptLimit({
  scope,
  windowMs,
  max,
  keyGenerator = clientKey,
  message = 'Too many failed attempts; try again later',
}) {
  if (!scope) throw new Error('A unique rate-limit scope is required');

  return async (req, res, next) => {
    const key = keyGenerator(req);
    try {
      await pruneExpiredCounters();
      const record = await current(scope, key);
      if (record?.count >= max) {
        setHeaders(res, max, record);
        return reject(res, record, message);
      }
    } catch (error) {
      return next(error);
    }

    res.once('finish', () => {
      if (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 429) {
        void increment(scope, key, windowMs).catch((error) =>
          reportPersistenceFailure(error, 'persist')
        );
      }
    });
    return next();
  };
}
