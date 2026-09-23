/**
 * Offline dose outbox (Sprint 6, D-F / TC-10 — web/PWA layer).
 *
 * When a dose is logged while offline (or a request fails), the log is appended
 * to a localStorage outbox with a client-generated id. On reconnect — or next
 * app load — the whole outbox is flushed to POST /doses/sync, which is idempotent
 * on that id, so a retried flush never duplicates. The native APK adds a SQLite
 * store + Capacitor local notifications on top of this same contract.
 */
const PREFIX = 'pm_dose_outbox:';

function key(patientId) {
  return `${PREFIX}${encodeURIComponent(String(patientId || 'unknown'))}`;
}

export function readOutbox(patientId) {
  try {
    return JSON.parse(localStorage.getItem(key(patientId)) || '[]');
  } catch {
    return [];
  }
}

function writeOutbox(patientId, list) {
  localStorage.setItem(key(patientId), JSON.stringify(list));
}

export function enqueue(patientId, log) {
  const list = readOutbox(patientId);
  list.push(log);
  writeOutbox(patientId, list);
}

/** Flush queued logs. Returns { applied, duplicates } on success, or leaves the queue intact. */
export async function flushOutbox(patientId, api) {
  const list = readOutbox(patientId);
  if (list.length === 0) return { applied: 0, duplicates: 0, pending: 0 };
  try {
    const r = await api('/api/patient/doses/sync', { method: 'POST', body: { logs: list } });
    writeOutbox(patientId, []); // server dedups on log_id, so clearing after a 2xx is safe
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
