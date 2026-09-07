import { pool } from '../db/connection.js';

export function assessPharmacistCredential(credential = {}, today = new Date()) {
  const reasons = [];
  if (!credential.id || !Number(credential.is_active)) reasons.push('account_inactive');
  if (!String(credential.license_number || '').trim()) reasons.push('license_number_missing');
  if (!String(credential.license_jurisdiction || '').trim())
    reasons.push('license_jurisdiction_missing');
  if (credential.license_status !== 'VERIFIED') reasons.push('license_not_verified');
  if (!credential.license_verified_at) reasons.push('license_verification_not_recorded');
  if (!credential.license_expires_on) {
    reasons.push('license_expiry_missing');
  } else {
    const rawExpiry = credential.license_expires_on;
    const expiry =
      rawExpiry instanceof Date
        ? new Date(rawExpiry.getTime())
        : new Date(`${String(rawExpiry).slice(0, 10)}T23:59:59Z`);
    if (rawExpiry instanceof Date) expiry.setUTCHours(23, 59, 59, 999);
    if (Number.isNaN(expiry.getTime()) || expiry < today) reasons.push('license_expired');
  }
  return { valid: reasons.length === 0, reasons };
}

export async function pharmacistCredential(pharmacistId, executor = pool, options = {}) {
  const [[row]] = await executor.execute(
    `SELECT pharmacist.id,pharmacist.full_name,pharmacist.license_number,
            pharmacist.license_jurisdiction,pharmacist.license_status,
            pharmacist.license_expires_on,pharmacist.license_evidence_url,
            pharmacist.license_verified_at,pharmacist.license_verified_by,
            user.is_active
     FROM pharmacists pharmacist
     JOIN users user ON user.id=pharmacist.id
     WHERE pharmacist.id=?${options.forUpdate ? ' FOR UPDATE' : ''}`,
    [pharmacistId]
  );
  const assessment = assessPharmacistCredential(row || {});
  return {
    ...(row || {}),
    credential_valid: assessment.valid,
    credential_issues: assessment.reasons,
  };
}

export function publicCredential(credential = {}) {
  return {
    license_number: credential.license_number || null,
    license_jurisdiction: credential.license_jurisdiction || null,
    license_status: credential.license_status || 'PENDING',
    license_expires_on: credential.license_expires_on || null,
    license_verified_at: credential.license_verified_at || null,
    credential_valid: Boolean(credential.credential_valid),
    credential_issues: credential.credential_issues || [],
  };
}
