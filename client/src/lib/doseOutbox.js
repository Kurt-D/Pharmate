/**
 * Offline dose outbox (Sprint 6, D-F / TC-10 — web/PWA layer).
 *
 * When a dose is logged while offline (or a request fails), the log is appended
 * to a localStorage outbox with a client-generated id. On reconnect — or next
 * app load — the whole outbox is flushed to POST /doses/sync, which is idempotent
 * on that id, so a retried flush never duplicates. The native APK adds a SQLite
 * store + Capacitor local notifications on top of this same contract.
 */
const KEY = 'pm_dose_outbox';

export function readOutbox() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function writeOutbox(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function enqueue(log) {
  const list = readOutbox();
  list.push(log);
  writeOutbox(list);
}

/** Flush queued logs. Returns { applied, duplicates } on success, or leaves the queue intact. */
export async function flushOutbox(api) {
  const list = readOutbox();
  if (list.length === 0) return { applied: 0, duplicates: 0, pending: 0 };
  try {
    const r = await api('/api/patient/doses/sync', { method: 'POST', body: { logs: list } });
    writeOutbox([]); // server dedups on log_id, so clearing after a 2xx is safe
    return { ...r.data, pending: 0 };
  } catch {
    return { applied: 0, duplicates: 0, pending: list.length };
  }
}

export function newLogId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `log-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
