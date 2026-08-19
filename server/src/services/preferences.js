import { pool } from '../db/connection.js';

export const PREFERENCE_DEFAULTS = Object.freeze({
  reminders_enabled: true,
  voice_enabled: true,
  voice_detail: 'private',
  vibration_enabled: true,
  reminder_lead_minutes: 0,
  caregiver_missed_alerts_enabled: true,
  lock_screen_detail: 'private',
  timezone: 'Asia/Manila',
});

const FIELDS = Object.keys(PREFERENCE_DEFAULTS);
const BOOLEAN_FIELDS = new Set([
  'reminders_enabled',
  'voice_enabled',
  'vibration_enabled',
  'caregiver_missed_alerts_enabled',
]);
const DETAIL_FIELDS = new Set(['voice_detail', 'lock_screen_detail']);
const TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));
TIMEZONES.add('UTC');

function normalize(row = {}) {
  return {
    reminders_enabled: Boolean(row.reminders_enabled ?? PREFERENCE_DEFAULTS.reminders_enabled),
    voice_enabled: Boolean(row.voice_enabled ?? PREFERENCE_DEFAULTS.voice_enabled),
    voice_detail: row.voice_detail ?? PREFERENCE_DEFAULTS.voice_detail,
    vibration_enabled: Boolean(row.vibration_enabled ?? PREFERENCE_DEFAULTS.vibration_enabled),
    reminder_lead_minutes: Number(
      row.reminder_lead_minutes ?? PREFERENCE_DEFAULTS.reminder_lead_minutes
    ),
    caregiver_missed_alerts_enabled: Boolean(
      row.caregiver_missed_alerts_enabled ??
        PREFERENCE_DEFAULTS.caregiver_missed_alerts_enabled
    ),
    lock_screen_detail: row.lock_screen_detail ?? PREFERENCE_DEFAULTS.lock_screen_detail,
    timezone: row.timezone ?? PREFERENCE_DEFAULTS.timezone,
  };
}

export function validatePreferencePatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }
  const keys = Object.keys(body);
  const unknown = keys.filter((key) => !FIELDS.includes(key));
  if (unknown.length > 0) return { error: `Unknown preference field: ${unknown[0]}` };
  if (keys.length === 0) return { error: 'At least one preference field is required' };

  for (const key of keys) {
    const value = body[key];
    if (BOOLEAN_FIELDS.has(key) && typeof value !== 'boolean') {
      return { error: `${key} must be a boolean` };
    }
    if (DETAIL_FIELDS.has(key) && !['private', 'medicine_name'].includes(value)) {
      return { error: `${key} must be private or medicine_name` };
    }
    if (
      key === 'reminder_lead_minutes' &&
      (!Number.isInteger(value) || value < 0 || value > 60)
    ) {
      return { error: 'reminder_lead_minutes must be an integer from 0 through 60' };
    }
    if (key === 'timezone' && (typeof value !== 'string' || !TIMEZONES.has(value))) {
      return { error: 'timezone must be a supported IANA timezone' };
    }
  }
  return { value: Object.fromEntries(keys.map((key) => [key, body[key]])) };
}

export async function getPreferences(patientId) {
  await pool.execute('INSERT IGNORE INTO patient_preferences (patient_id) VALUES (?)', [patientId]);
  const [[row]] = await pool.execute(
    `SELECT ${FIELDS.join(', ')} FROM patient_preferences WHERE patient_id = ?`,
    [patientId]
  );
  return normalize(row);
}

export async function updatePreferences(patientId, patch) {
  await pool.execute('INSERT IGNORE INTO patient_preferences (patient_id) VALUES (?)', [patientId]);
  const entries = Object.entries(patch);
  await pool.execute(
    `UPDATE patient_preferences SET ${entries.map(([key]) => `${key} = ?`).join(', ')}
     WHERE patient_id = ?`,
    [...entries.map(([, value]) => value), patientId]
  );
  return getPreferences(patientId);
}
