import { decrypt, encrypt } from '../utils/crypto.js';

const HEALTH_FIELDS = ['allergies', 'conditions', 'current_medicines'];
const STATUS_FIELDS = {
  kidney_status: ['YES', 'NO', 'UNSURE', 'UNANSWERED'],
  liver_status: ['YES', 'NO', 'UNSURE', 'UNANSWERED'],
  pregnancy_status: [
    'PREGNANT',
    'BREASTFEEDING',
    'NEITHER',
    'NOT_APPLICABLE',
    'UNSURE',
    'UNANSWERED',
  ],
};

export function serializeSafetyProfile(row = {}) {
  return {
    date_of_birth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().slice(0, 10) : '',
    weight_kg: row.weight_kg == null ? '' : Number(row.weight_kg),
    allergies: row.allergies_enc ? decrypt(row.allergies_enc) : '',
    conditions: row.conditions_enc ? decrypt(row.conditions_enc) : '',
    current_medicines: row.current_medicines_enc ? decrypt(row.current_medicines_enc) : '',
    kidney_status: row.kidney_status || 'UNANSWERED',
    liver_status: row.liver_status || 'UNANSWERED',
    pregnancy_status: row.pregnancy_status || 'UNANSWERED',
    caregiver_alerts: Boolean(row.caregiver_alerts),
    profile_completed: Boolean(row.profile_completed),
    updated_at: row.updated_at || null,
  };
}

export function validateSafetyProfile(body = {}) {
  const value = {};
  if ('date_of_birth' in body) {
    if (body.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(body.date_of_birth))
      return { error: 'Enter a valid date of birth.' };
    value.date_of_birth = body.date_of_birth || null;
  }
  if ('weight_kg' in body) {
    const weight = body.weight_kg === '' || body.weight_kg == null ? null : Number(body.weight_kg);
    if (weight !== null && (!Number.isFinite(weight) || weight < 2 || weight > 500))
      return { error: 'Weight must be between 2 and 500 kg.' };
    value.weight_kg = weight;
  }
  for (const field of HEALTH_FIELDS) {
    if (!(field in body)) continue;
    const text = String(body[field] || '').trim();
    if (text.length > 2000) return { error: `${field} is too long.` };
    value[`${field}_enc`] = text ? encrypt(text) : null;
  }
  for (const [field, choices] of Object.entries(STATUS_FIELDS)) {
    if (!(field in body)) continue;
    const choice = String(body[field]).toUpperCase();
    if (!choices.includes(choice)) return { error: `Invalid ${field}.` };
    value[field] = choice;
  }
  if ('caregiver_alerts' in body) value.caregiver_alerts = body.caregiver_alerts ? 1 : 0;
  if ('profile_completed' in body) value.profile_completed = body.profile_completed ? 1 : 0;
  return { value };
}

export function missingSafetyContext(profile) {
  const missing = [];
  if (!profile.date_of_birth) missing.push('date_of_birth');
  if (!profile.allergies) missing.push('allergies');
  if (!profile.conditions) missing.push('conditions');
  if (profile.kidney_status === 'UNANSWERED') missing.push('kidney_status');
  if (profile.liver_status === 'UNANSWERED') missing.push('liver_status');
  if (profile.pregnancy_status === 'UNANSWERED') missing.push('pregnancy_status');
  return missing;
}
