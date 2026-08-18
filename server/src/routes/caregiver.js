import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { caregiverAlerts } from '../services/alerts.js';
import { createRefill, createDelivery, listOrders } from '../services/orders.js';
import { openThread } from '../services/inquiry.js';
import { failedAttemptLimit, rateLimit } from '../middleware/rateLimit.js';

const router = Router();

const inviteLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const failedInviteLimit = failedAttemptLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `${req.ip}:${req.user?.sub || 'anonymous'}`,
});

router.use(requireAuth, requireRole('caregiver'));

// The caregiver acts ONLY on patients they are linked to, and always by
// patient_code — never a name or any PII (PART 3). Resolve a code to the
// patient's id iff a link exists; otherwise the caller returns 404.
async function linkedPatientId(caregiverId, patientCode) {
  const [[row]] = await pool.execute(
    `SELECT p.id
     FROM caregiver_patients cp
     JOIN patients p ON p.id = cp.patient_id
     WHERE cp.caregiver_id = ? AND p.patient_code = ?`,
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
    `SELECT p.patient_code, cp.linked_at
     FROM caregiver_patients cp
     JOIN patients p ON p.id = cp.patient_id
     WHERE cp.caregiver_id = ?
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
    `SELECT m.id, m.drug_name_raw, m.status, m.source, dr.rx_class
     FROM medications m
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     WHERE m.patient_id = ? AND m.status = 'active'
     ORDER BY m.drug_name_raw`,
    [patientId]
  );
  res.json(rows);
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
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });

  const [rows] = await pool.execute(
    `SELECT ic.id, ic.patient_id, ic.expires_at, ic.used
     FROM invite_codes ic
     WHERE ic.code = ?`,
    [String(code).toUpperCase()]
  );
  const invite = rows[0];

  if (!invite) return res.status(404).json({ error: 'Invalid invite code' });
  if (invite.used) return res.status(409).json({ error: 'Invite code already used' });
  if (new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Invite code has expired' });
  }

  // Check for existing link
  const [existing] = await pool.execute(
    'SELECT id FROM caregiver_patients WHERE caregiver_id = ? AND patient_id = ?',
    [req.user.sub, invite.patient_id]
  );
  if (existing.length > 0) {
    return res.status(409).json({ error: 'Already linked to this patient' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      'INSERT INTO caregiver_patients (id, caregiver_id, patient_id) VALUES (?, ?, ?)',
      [uuidv4(), req.user.sub, invite.patient_id]
    );
    await conn.execute('UPDATE invite_codes SET used = 1, used_at = NOW(3) WHERE id = ?', [
      invite.id,
    ]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  res.status(201).json({ message: 'Linked to patient', patient_id: invite.patient_id });
});

export default router;
