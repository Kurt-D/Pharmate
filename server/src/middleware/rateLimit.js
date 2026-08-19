function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function prune(store, now) {
  for (const [key, record] of store) {
    if (record.resetAt <= now) store.delete(key);
  }
}

export function rateLimit({ windowMs, max, keyGenerator = clientKey }) {
  const store = new Map();

  return (req, res, next) => {
    const now = Date.now();
    prune(store, now);
    const key = keyGenerator(req);
    const record = store.get(key) || { count: 0, resetAt: now + windowMs };
    const remaining = Math.max(0, max - record.count);

    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(remaining));
    res.set('RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

    if (record.count >= max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((record.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Too many requests; try again later' });
    }

    record.count += 1;
    store.set(key, record);
    next();
  };
}

export function failedAttemptLimit({ windowMs, max, keyGenerator = clientKey }) {
  const store = new Map();

  return (req, res, next) => {
    const now = Date.now();
    prune(store, now);
    const key = keyGenerator(req);
    const record = store.get(key) || { count: 0, resetAt: now + windowMs };

    if (record.count >= max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((record.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Too many failed attempts; try again later' });
    }

    res.once('finish', () => {
      if (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 429) {
        record.count += 1;
        store.set(key, record);
      }
    });
    next();
  };
}
