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
import { sendPush } from '../services/notifications.js';
import { decrypt, encrypt } from '../utils/crypto.js';
import {
  CAREGIVER_CODE_LENGTH,
  hashCaregiverCode,
  legacyCaregiverCodeHash,
  normalizeCaregiverCode,
} from '../utils/caregiverInvite.js';
import { publishCaregiverEvent, subscribeCaregiver } from '../services/caregiverEvents.js';
import { publishUser } from '../services/realtimeEvents.js';
import { parseFrequency } from '../../engine/frequencyParser.js';
import { findRestricted, resolveDrug, searchDrugs } from '../services/formulary.js';
import { confirmForPatient } from '../services/schedule.js';
import { todayDoses } from '../services/doses.js';
import { recordAudit } from '../services/audit.js';
import { createPortalNotification } from '../services/portalNotifications.js';
import {
  inquiryChanged,
  medicationChanged,
  orderChanged,
  scheduleChanged,
} from '../services/domainEvents.js';
import {
  stopMedication,
  updateMedication,
  validateMedicationPatch,
} from '../services/patientMedications.js';

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

// Pending links remain visible to the caregiver until the patient decides.
// Only the patient's privacy-safe code is returned; no patient PII is exposed.
router.get('/link-requests', async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT cp.id, p.patient_code, cp.relationship, cp.status, cp.linked_at AS requested_at
       FROM caregiver_patients cp
       JOIN patients p ON p.id=cp.patient_id
      WHERE cp.caregiver_id=? AND cp.status='pending'
      ORDER BY cp.linked_at DESC`,
    [req.user.sub]
  );
  res.json(rows);
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

router.patch('/alerts/read-all', async (req, res) => {
  await pool.execute(
    `UPDATE caregiver_alerts SET status = 'resolved'
     WHERE caregiver_id = ? AND channel = 'caregiver' AND status = 'unseen'`,
    [req.user.sub]
  );
  res.json({ message: 'Caregiver notifications marked as read' });
});

// ── GET /api/caregiver/patients ───────────────────────────────────────────────
// The caregiver's linked patients, by patient_code only (no PII).
router.get('/patients', async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT p.patient_code, cp.relationship, cp.linked_at,
            cp.can_manage_medications
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
            m.frequency, m.start_date, m.end_date, m.updated_at, dr.rx_class
     FROM medications m
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     WHERE m.patient_id = ? AND m.status = 'active'
     ORDER BY m.drug_name_raw`,
    [patientId]
  );
  res.json(rows);
});

router.get('/patients/:code/today', async (req, res) => {
  const patientId = await linkedPatientId(req.user.sub, req.params.code);
  if (!patientId) return res.status(404).json({ error: 'Patient not linked' });
  res.json(await todayDoses(patientId));
});

router.get('/drugs', async (req, res) => {
  res.json(await searchDrugs(req.query.q, req.query.limit || 20));
});

router.post('/patients/:code/medications', async (req, res) => {
  const patientId = await medicationManagementPatient(req, res);
  if (!patientId) return;
  const drugName = String(req.body?.drug_name || '').trim();
  const frequency = String(req.body?.frequency || '').trim();
  const dosageInstruction = String(req.body?.dosage_instruction || '').trim();
  if (!drugName || !frequency || !dosageInstruction) {
    return res
      .status(400)
      .json({ error: 'Medicine, frequency, and dose instructions are required' });
  }
  if (await findRestricted(drugName)) {
    return res.status(403).json({
      error: 'restricted_substance',
      message: 'This medicine must be handled in person at a pharmacy branch.',
    });
  }
  const drug = await resolveDrug(drugName);
  if (!drug) return res.status(400).json({ error: 'Choose a verified medicine from the list' });
  const frequencyCode = parseFrequency(frequency);
  if (frequencyCode === 'CONSULT') {
    return res.status(400).json({ error: 'Choose a supported medicine frequency' });
  }
  const id = uuidv4();
  await pool.execute(
    `INSERT INTO medications
       (id, patient_id, drug_id, drug_name_raw, source, is_prn, frequency,
        frequency_code, dosage_instruction, start_date, status)
     VALUES (?, ?, ?, ?, 'OTC_SELF', 0, ?, ?, ?, ?, 'active')`,
    [
      id,
      patientId,
      drug.id,
      drugName,
      frequency,
      frequencyCode,
      dosageInstruction,
      req.body?.start_date || new Date().toISOString().slice(0, 10),
    ]
  );
  await recordAudit({
    actor: { id: req.user.sub, role: 'caregiver' },
    action: 'MEDICATION_CREATED',
    entityType: 'medication',
    entityId: id,
    patientId,
    metadata: { delegated: true },
  });
  await medicationChanged(patientId, 'MEDICATION_CREATED', id, drugName);
  publishCaregiverEvent(req.user.sub, 'adherence-updated', { patient_code: req.params.code });
  res.status(201).json({ id, status: 'active', rx_class: drug.rx_class });
});

router.post('/patients/:code/schedule/suggested', async (req, res) => {
  const patientId = await medicationManagementPatient(req, res);
  if (!patientId) return;
  const result = await confirmForPatient(patientId);
  if (result.error === 'invalid_layout') {
    return res.status(409).json({ error: 'A medicine spacing rule could not be satisfied' });
  }
  if (result.error) return res.status(400).json({ error: result.error });
  await recordAudit({
    actor: { id: req.user.sub, role: 'caregiver' },
    action: 'SCHEDULE_CONFIRMED',
    entityType: 'schedule',
    entityId: result.version,
    patientId,
  });
  await scheduleChanged(patientId, result.version);
  publishCaregiverEvent(req.user.sub, 'adherence-updated', { patient_code: req.params.code });
  res.status(201).json({ message: 'Suggested schedule created', ...result });
});

async function medicationManagementPatient(req, res) {
  const [[row]] = await pool.execute(
    `SELECT p.id, cp.can_manage_medications
     FROM caregiver_patients cp
     JOIN patients p ON p.id = cp.patient_id
     WHERE cp.caregiver_id = ? AND cp.status = 'active' AND p.patient_code = ?`,
    [req.user.sub, String(req.params.code || '').toUpperCase()]
  );
  if (!row) {
    res.status(404).json({ error: 'Patient not linked' });
    return null;
  }
  if (!row.can_manage_medications) {
    res.status(403).json({
      error: 'Medication management is not authorized by the patient',
      code: 'caregiver_medication_permission_required',
    });
    return null;
  }
  return row.id;
}

router.patch('/patients/:code/medications/:id', async (req, res) => {
  const patientId = await medicationManagementPatient(req, res);
  if (!patientId) return;
  const parsed = validateMedicationPatch(req.body);
  if (parsed.error) return res.status(parsed.error.status).json(parsed.error);
  const result = await updateMedication(patientId, req.params.id, parsed);
  if (result.error) return res.status(result.error.status).json(result.error);
  await recordAudit({
    actor: { id: req.user.sub, role: 'caregiver' },
    action: 'MEDICATION_UPDATED',
    entityType: 'medication',
    entityId: req.params.id,
    patientId,
  });
  await medicationChanged(
    patientId,
    'MEDICATION_UPDATED',
    req.params.id,
    result.medication?.drug_name_raw
  );
  publishCaregiverEvent(req.user.sub, 'adherence-updated', { patient_code: req.params.code });
  res.json(result);
});

router.post('/patients/:code/medications/:id/stop', async (req, res) => {
  const patientId = await medicationManagementPatient(req, res);
  if (!patientId) return;
  const result = await stopMedication(patientId, req.params.id, req.body?.expected_updated_at);
  if (result.error) return res.status(result.error.status).json(result.error);
  if (!result.already_stopped) {
    await recordAudit({
      actor: { id: req.user.sub, role: 'caregiver' },
      action: 'MEDICATION_STOPPED',
      entityType: 'medication',
      entityId: req.params.id,
      patientId,
    });
    await medicationChanged(
      patientId,
      'MEDICATION_STOPPED',
      req.params.id,
      result.medication?.drug_name_raw
    );
  }
  publishCaregiverEvent(req.user.sub, 'adherence-updated', { patient_code: req.params.code });
  res.json(result);
});

// Send a real reminder to the linked patient's notification inbox.
router.post('/patients/:code/notify', async (req, res) => {
  const patientId = await linkedPatientId(req.user.sub, req.params.code);
  if (!patientId) return res.status(404).json({ error: 'Patient not linked' });
  const medicineName = String(req.body?.drug_name || '').trim() || null;
  const eventId = uuidv4();
  const result = await createPatientNotification({
    patientId,
    type: 'dose_reminder',
    medicineName,
    eventKey: `caregiver:${req.user.sub}:${patientId}:${eventId}`,
  });
  let pushSent = false;
  if (result.created) {
    publishUser(patientId, 'notification-updated', {
      reason: 'caregiver-reminder',
      reminder: {
        id: eventId,
        message:
          String(req.body?.voice_message || '').trim() ||
          'It is time to take your scheduled medicine.',
        medicine: medicineName || 'scheduled medicine',
        caregiverName: 'your caregiver',
        createdAt: new Date().toISOString(),
      },
    });
    const [[patient]] = await pool.execute(
      `SELECT p.fcm_token, COALESCE(pp.lock_screen_detail, 'private') AS lock_screen_detail
       FROM patients p
       LEFT JOIN patient_preferences pp ON pp.patient_id = p.id
       WHERE p.id = ?`,
      [patientId]
    );
    if (patient?.fcm_token) {
      const body =
        patient.lock_screen_detail === 'medicine_name' && medicineName
          ? `Your caregiver says it is time for ${medicineName}.`
          : 'Your caregiver sent a medicine reminder.';
      const push = await sendPush(patient.fcm_token, {
        title: 'Caregiver medicine reminder',
        body,
        data: { type: 'caregiver_dose_reminder' },
      });
      pushSent = push.ok;
      if (push.stale) {
        await pool.execute('UPDATE patients SET fcm_token = NULL WHERE id = ?', [patientId]);
      }
    }
  }
  res.status(201).json({ notified: result.created, push_sent: pushSent });
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
  await orderChanged({
    patientId,
    kind: 'refill',
    orderId: result.id,
    status: result.status,
    created: true,
  });
  res.status(201).json(result);
});

// ── POST /api/caregiver/patients/:code/deliveries ─────────────────────────────
router.post('/patients/:code/deliveries', async (req, res) => {
  const patientId = await linkedPatientId(req.user.sub, req.params.code);
  if (!patientId) return res.status(404).json({ error: 'Patient not linked' });
  const result = await createDelivery(patientId, req.body ?? {});
  if (sendOrderError(res, result, 'delivery')) return;
  await orderChanged({
    patientId,
    kind: 'delivery',
    orderId: result.id,
    status: result.status,
    created: true,
  });
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
  await inquiryChanged({ patientId, threadId: result.thread_id, action: 'created' });
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
  let requestedPatientId = null;

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
    requestedPatientId = invite.patient_id;
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
    if (['active', 'pending'].includes(existing?.status)) {
      await conn.rollback();
      return res.status(409).json({
        error:
          existing.status === 'active'
            ? 'Already linked to this patient'
            : 'Link request is awaiting patient approval',
      });
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
    const eventType = 'requested';
    if (existing) {
      await conn.execute(
        `UPDATE caregiver_patients
         SET status = 'pending', relationship = ?, linked_at = NOW(3), revoked_at = NULL,
             revoked_by_patient_id = NULL WHERE id = ?`,
        [relationship, linkId]
      );
    } else {
      await conn.execute(
        `INSERT INTO caregiver_patients
           (id, caregiver_id, patient_id, relationship, status) VALUES (?, ?, ?, ?, 'pending')`,
        [linkId, req.user.sub, invite.patient_id, relationship]
      );
    }
    await conn.execute(
      `INSERT INTO caregiver_link_audit
         (id, link_id, caregiver_id, patient_id, event_type, actor_user_id, invite_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), linkId, req.user.sub, invite.patient_id, eventType, req.user.sub, invite.id]
    );
    await recordAudit({
      actor: { id: req.user.sub, role: 'caregiver' },
      action: 'CAREGIVER_LINK_REQUESTED',
      entityType: 'caregiver_link',
      entityId: linkId,
      patientId: invite.patient_id,
      metadata: { relationship },
      executor: conn,
    });
    await createPortalNotification({
      userId: invite.patient_id,
      type: 'CAREGIVER_LINK_UPDATED',
      title: 'Caregiver link request',
      body: 'A caregiver used your invitation code. Review and approve or reject the request.',
      actionPath: '/patient/profile',
      eventKey: `caregiver-link-request:${linkId}`,
      executor: conn,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  publishUser(requestedPatientId, 'CAREGIVER_LINK_UPDATED', { action: 'requested' });
  res.status(202).json({
    message: 'Link request sent. The patient must approve it.',
    relationship,
    status: 'pending',
  });
});

export default router;
