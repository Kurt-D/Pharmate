/**
 * Small, patient-scoped offline cache for essential medication information.
 * This deliberately stores only the views needed to take and record medicine;
 * API responses are never placed in the browser's shared HTTP cache.
 */
const PREFIX = 'pm_offline_patient:';

function key(patientId, name) {
  return `${PREFIX}${encodeURIComponent(String(patientId || 'unknown'))}:${name}`;
}

export function readPatientOfflineCache(patientId, name, fallback) {
  try {
    const record = JSON.parse(localStorage.getItem(key(patientId, name)) || 'null');
    return record && Object.hasOwn(record, 'data') ? record.data : fallback;
  } catch {
    return fallback;
  }
}

export function writePatientOfflineCache(patientId, name, data) {
  if (!patientId) return;
  try {
    localStorage.setItem(key(patientId, name), JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // A full storage quota must not block medicine viewing or dose logging.
  }
}
