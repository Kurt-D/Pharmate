import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { caregiverAlerts } from '../services/alerts.js';
import { createRefill, createDelivery, listOrders } from '../services/orders.js';
import { openThread } from '../services/inquiry.js';
import { failedAttemptLimit, rateLimit } from '../middleware/rateLimit.js';
import { createPatientNotification } from '../services/patientNotifications.js';
import { decrypt, encrypt } from '../utils/crypto.js';
import {
  CAREGIVER_CODE_LENGTH,
  hashCaregiverCode,
  legacyCaregiverCodeHash,
  normalizeCaregiverCode,
} from '../utils/caregiverInvite.js';
import { publishCaregiverEvent, subscribeCaregiver } from '../services/caregiverEvents.js';

const router = Router();

const inviteLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const failedInviteLimit = failedAttemptLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `${req.ip}:${req.user?.sub || 'anonymous'}`,
});

router.use(requireAuth, requireRole('caregiver'));

router.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const unsubscribe = subscribeCaregiver(req.user.sub, res);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.get('/profile', async (req, res) => {
  const [[row]] = await pool.execute(
    `SELECT u.email, u.created_at, cp.display_name_enc
     FROM users u LEFT JOIN caregiver_profiles cp ON cp.caregiver_id=u.id
     WHERE u.id=?`,
    [req.user.sub]
  );
  if (!row) return res.status(404).json({ error: 'Caregiver not found' });
  res.json({
    email: row.email,
    created_at: row.created_at,
    display_name: row.display_name_enc ? decrypt(row.display_name_enc) : '',
  });
});

router.put('/profile', async (req, res) => {
  const displayName = String(req.body?.display_name || '').trim();
  if (!displayName) return res.status(400).json({ error: 'Display name is required' });
  if (displayName.length > 120) return res.status(400).json({ error: 'Display name is too long' });
  await pool.execute(
    `INSERT INTO caregiver_profiles (caregiver_id,display_name_enc) VALUES (?,?)
     ON DUPLICATE KEY UPDATE display_name_enc=VALUES(display_name_enc)`,
    [req.user.sub, encrypt(displayName)]
  );
  res.json({ display_name: displayName });
});

// The caregiver acts ONLY on patients they are linked to, and always by
// patient_code — never a name or any PII (PART 3). Resolve a code to the
// patient's id iff a link exists; otherwise the caller returns 404.
async function linkedPatientId(caregiverId, patientCode) {
  const [[row]] = await pool.execute(
    `SELECT p.id
     FROM caregiver_patients cp
     JOIN patients p ON p.id = cp.patient_id
     WHERE cp.caregiver_id = ? AND cp.status = 'active' AND p.patient_code = ?`,
    [caregiverId, String(patientCode ?? '').toUpperCase()]
  );
  return row?.id ?? null;
}

// Map an order-service result error to an HTTP response (shared by refill +
// delivery). Returns true if it handled (sent) a response.
function sendOrderError(res, result, kind) {
  if (result.error === 'branch_required') {
    res.status(400).json({ error: 'A branch must be selected' });
  } else if (result.error === 'medication_not_found') {
    res.status(404).json({ error: 'Medication not found' });
  } else if (result.error === 'branch_not_found') {
    res.status(404).json({ error: 'Branch not found' });
  } else if (result.error === 'no_delivery_coverage') {
    res.status(400).json({ error: 'The selected branch does not offer delivery' });
  } else if (result.error === 'restricted') {
    res.status(403).json({
      error: 'restricted_substance',
      redirect: 'visit_nearest_branch', // TC-11
      message: `This medication requires in-person verification. Please have the patient visit their nearest branch — it can’t be requested for ${kind} here.`,
    });
  } else if (result.error === 'no_valid_prescription') {
    res.status(403).json({
      error: 'prescription_required',
      message: `This medication needs an approved prescription on record before a ${kind} can be requested. The patient must upload their prescription for validation first.`,
    });
  } else {
    return false;
  }
  return true;
}

// ── GET /api/caregiver/alerts ─────────────────────────────────────────────────
// Missed-dose alerts for this caregiver's linked patients (UC-08). Patients are
// shown by patient_code only — the payload carries no PII.
router.get('/alerts', async (req, res) => {
  res.json(await caregiverAlerts(req.user.sub));
});

// ── GET /api/caregiver/patients ───────────────────────────────────────────────
// The caregiver's linked patients, by patient_code only (no PII).
router.get('/patients', async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT p.patient_code, cp.relationship, cp.linked_at
     FROM caregiver_patients cp
     JOIN patients p ON p.id = cp.patient_id
     WHERE cp.caregiver_id = ? AND cp.status = 'active'
     ORDER BY p.patient_code`,
    [req.user.sub]
  );
  res.json(rows);
});

// ── GET /api/caregiver/patients/:code/medications ─────────────────────────────
// A linked patient's active medications — needed to pick one for a refill or
// delivery (UC-09). Drug names + rx_class only; never a name or condition.
router.get('/patients/:code/medications', async (req, res) => {
  const patientId = await linkedPatientId(req.user.sub, req.params.code);
  if (!patientId) return res.status(404).json({ error: 'Patient not linked' });
  const [rows] = await pool.execute(
    `SELECT m.id, m.drug_name_raw, m.status, m.source, m.dosage_instruction,
            m.frequency, dr.rx_class
     FROM medications m
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     WHERE m.patient_id = ? AND m.status = 'active'
     ORDER BY m.drug_name_raw`,
    [patientId]
  );
  res.json(rows);
});

// Send a real reminder to the linked patient's notification inbox.
router.post('/patients/:code/notify', async (req, res) => {
  const patientId = await linkedPatientId(req.user.sub, req.params.code);
  if (!patientId) return res.status(404).json({ error: 'Patient not linked' });
  const medicineName = String(req.body?.drug_name || '').trim() || null;
  const result = await createPatientNotification({
    patientId,
    type: 'dose_reminder',
    medicineName,
    eventKey: `caregiver:${req.user.sub}:${patientId}:${uuidv4()}`,
  });
  res.status(201).json({ notified: result.created });
});

// ── GET /api/caregiver/patients/:code/orders ──────────────────────────────────
// Status of the linked patient's refill/delivery requests (no decrypted address).
router.get('/patients/:code/orders', async (req, res) => {
  const patientId = await linkedPatientId(req.user.sub, req.params.code);
  if (!patientId) return res.status(404).json({ error: 'Patient not linked' });
  res.json(await listOrders(patientId));
});

// ── POST /api/caregiver/patients/:code/refills ────────────────────────────────
// Request a refill on the patient's behalf (UC-09). Same gating as the patient
// path — Rx needs an approved prescription; restricted → branch visit (TC-11).
router.post('/patients/:code/refills', async (req, res) => {
  const patientId = await linkedPatientId(req.user.sub, req.params.code);
  if (!patientId) return res.status(404).json({ error: 'Patient not linked' });
  const result = await createRefill(patientId, req.body ?? {});
  if (sendOrderError(res, result, 'refill')) return;
  res.status(201).json(result);
});

// ── POST /api/caregiver/patients/:code/deliveries ─────────────────────────────
router.post('/patients/:code/deliveries', async (req, res) => {
  const patientId = await linkedPatientId(req.user.sub, req.params.code);
  if (!patientId) return res.status(404).json({ error: 'Patient not linked' });
  const result = await createDelivery(patientId, req.body ?? {});
  if (sendOrderError(res, result, 'delivery')) return;
  res.status(201).json(result);
});

// ── POST /api/caregiver/patients/:code/inquiries ──────────────────────────────
// Open a Medication Inquiry on the patient's behalf (UC-09). The pharmacist sees
// it by patient_code only; a restricted-substance subject is declined (TC-11).
router.post('/patients/:code/inquiries', async (req, res) => {
  const patientId = await linkedPatientId(req.user.sub, req.params.code);
  if (!patientId) return res.status(404).json({ error: 'Patient not linked' });
  const { subject, branch_id, drug_name } = req.body ?? {};
  const result = await openThread(patientId, {
    subject,
    branchId: branch_id ?? null,
    drugName: drug_name ?? null,
  });
  if (result.error === 'restricted') {
    return res.status(403).json({
      error: 'restricted_substance',
      redirect: 'visit_nearest_branch',
      message:
        'This medication is a restricted substance — we can’t advise on it here. ' +
        'Please have the patient visit their nearest branch.',
    });
  }
  res.status(201).json(result);
});

// ── POST /api/caregiver/link ──────────────────────────────────────────────────
// Caregiver submits a patient's invite code to link accounts
router.post('/link', inviteLimit, failedInviteLimit, async (req, res) => {
  const submittedCode = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const code = normalizeCaregiverCode(submittedCode);
  const relationship = String(req.body?.relationship || 'Caregiver').trim();
  if (code.length !== CAREGIVER_CODE_LENGTH) {
    return res.status(400).json({ error: 'Enter the complete 6-character link code' });
  }
  if (!relationship || relationship.length > 50) {
    return res.status(400).json({ error: 'Choose a valid relationship' });
  }
  const tokenHash = hashCaregiverCode(code);
  const legacyTokenHash = legacyCaregiverCodeHash(submittedCode);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[invite]] = await conn.execute(
      `SELECT id, patient_id, expires_at, used, revoked_at
       FROM invite_codes WHERE token_hash IN (?, ?) FOR UPDATE`,
      [tokenHash, legacyTokenHash]
    );
    if (!invite) {
      await conn.rollback();
      return res.status(404).json({ error: 'Invalid invite code' });
    }
    if (invite.revoked_at) {
      await conn.rollback();
      return res.status(404).json({ error: 'Invalid invite code' });
    }
    if (invite.used) {
      await conn.rollback();
      return res.status(409).json({ error: 'Invite code already used' });
    }
    if (new Date(invite.expires_at) <= new Date()) {
      await conn.rollback();
      return res.status(410).json({ error: 'Invite code has expired' });
    }

    const [[existing]] = await conn.execute(
      `SELECT id, status FROM caregiver_patients
       WHERE caregiver_id = ? AND patient_id = ? FOR UPDATE`,
      [req.user.sub, invite.patient_id]
    );
    if (existing?.status === 'active') {
      await conn.rollback();
      return res.status(409).json({ error: 'Already linked to this patient' });
    }

    const [claimed] = await conn.execute(
      `UPDATE invite_codes SET used = 1, used_at = NOW(3), used_by_caregiver_id = ?
       WHERE id = ? AND used = 0 AND revoked_at IS NULL AND expires_at > NOW(3)`,
      [req.user.sub, invite.id]
    );
    if (claimed.affectedRows !== 1) {
      await conn.rollback();
      return res.status(409).json({ error: 'Invite code already used' });
    }

    const linkId = existing?.id ?? uuidv4();
    const eventType = existing ? 'relinked' : 'linked';
    if (existing) {
      await conn.execute(
        `UPDATE caregiver_patients
         SET status = 'active', relationship = ?, linked_at = NOW(3), revoked_at = NULL,
             revoked_by_patient_id = NULL WHERE id = ?`,
        [relationship, linkId]
      );
    } else {
      await conn.execute(
        `INSERT INTO caregiver_patients
           (id, caregiver_id, patient_id, relationship) VALUES (?, ?, ?, ?)`,
        [linkId, req.user.sub, invite.patient_id, relationship]
      );
    }
    await conn.execute(
      `INSERT INTO caregiver_link_audit
         (id, link_id, caregiver_id, patient_id, event_type, actor_user_id, invite_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), linkId, req.user.sub, invite.patient_id, eventType, req.user.sub, invite.id]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  publishCaregiverEvent(req.user.sub, 'patient-linked', { linked: true });
  res.status(201).json({ message: 'Linked to patient', relationship });
});

export default router;
