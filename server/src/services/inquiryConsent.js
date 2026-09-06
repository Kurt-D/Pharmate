import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { recordAudit } from './audit.js';
import { INQUIRY_PRIVACY_VERSION } from '../../../shared/inquiryPrivacy.mjs';

export const INQUIRY_CONSENT_REQUIRED = {
  error: 'inquiry_consent_required',
  message:
    'The patient must accept the current inquiry privacy notice before a new inquiry or message can be sent. Existing history remains available.',
};

export async function getInquiryConsent(patientId, executor = pool, lock = false) {
  const [[patient]] = await executor.execute(
    `SELECT inquiry_consent_policy_version, inquiry_consent_accepted_at,
            inquiry_consent_revoked_at FROM patients WHERE id = ?${lock ? ' FOR UPDATE' : ''}`,
    [patientId]
  );
  return {
    consented: Boolean(
      patient?.inquiry_consent_policy_version === INQUIRY_PRIVACY_VERSION &&
      patient?.inquiry_consent_accepted_at &&
      !patient?.inquiry_consent_revoked_at
    ),
    policy_version: INQUIRY_PRIVACY_VERSION,
    accepted_at: patient?.inquiry_consent_accepted_at || null,
    revoked_at: patient?.inquiry_consent_revoked_at || null,
  };
}

/** Patient-only routes invoke this; caregiver delegation cannot grant consent. */
export async function setInquiryConsent(patientId, accepted) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const previous = await getInquiryConsent(patientId, conn, true);
    // Retries must not invent another acceptance or withdrawal event.
    if ((accepted && previous.consented) || (!accepted && previous.revoked_at)) {
      await conn.commit();
      return previous;
    }
    if (accepted) {
      await conn.execute(
        `UPDATE patients SET inquiry_consent_policy_version = ?,
          inquiry_consent_accepted_at = NOW(3), inquiry_consent_revoked_at = NULL WHERE id = ?`,
        [INQUIRY_PRIVACY_VERSION, patientId]
      );
    } else {
      await conn.execute('UPDATE patients SET inquiry_consent_revoked_at = NOW(3) WHERE id = ?', [
        patientId,
      ]);
    }
    const action = accepted ? 'ACCEPTED' : 'WITHDRAWN';
    await conn.execute(
      `INSERT INTO inquiry_consent_events (id,patient_id,actor_user_id,action,policy_version)
       VALUES (?,?,?,?,?)`,
      [uuidv4(), patientId, patientId, action, INQUIRY_PRIVACY_VERSION]
    );
    await recordAudit({
      actor: { id: patientId, role: 'patient' },
      action: `INQUIRY_CONSENT_${action}`,
      entityType: 'inquiry_consent',
      patientId,
      metadata: { policy_version: INQUIRY_PRIVACY_VERSION },
      executor: conn,
    });
    const current = await getInquiryConsent(patientId, conn);
    await conn.commit();
    return current;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
