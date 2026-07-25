/**
 * Role-aware patient serializer (Sprint 2).
 *
 * Staff-facing views (pharmacist, admin, caregiver) receive ONLY patient_code
 * and safe metadata — never decrypted PII fields.
 * Patient-facing views receive their own decrypted PII.
 *
 * This is the single enforcement point. No route handler may bypass it.
 */
import { decrypt } from './crypto.js';

const PII_FIELDS = ['full_name_enc', 'contact_num_enc', 'address_enc', 'medical_condition_enc'];

/**
 * @param {Object} row         - raw DB row from patients table
 * @param {string} viewerRole  - 'patient' | 'pharmacist' | 'caregiver' | 'admin'
 * @param {string} viewerUserId - the requesting user's id
 */
export function serializePatient(row, viewerRole, viewerUserId) {
  const isOwnRecord = viewerRole === 'patient' && viewerUserId === row.id;

  const safe = {
    id: row.id,
    patient_code: row.patient_code,
    fcm_token: undefined,       // never expose FCM token outside patient's own view
    created_at: row.created_at,
  };

  if (isOwnRecord) {
    // Patient sees their own decrypted PII
    safe.full_name      = row.full_name_enc      ? decrypt(row.full_name_enc)      : null;
    safe.contact_num    = row.contact_num_enc     ? decrypt(row.contact_num_enc)    : null;
    safe.address        = row.address_enc         ? decrypt(row.address_enc)        : null;
    safe.medical_condition = row.medical_condition_enc
      ? decrypt(row.medical_condition_enc)
      : null;
  }

  // Guarantee: PII fields never leak into the output for non-patient viewers
  for (const f of PII_FIELDS) {
    delete safe[f];
  }

  return safe;
}
