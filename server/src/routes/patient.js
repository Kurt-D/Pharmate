import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { parseFrequency } from '../../engine/frequencyParser.js';
import { findRestricted, resolveDrug, searchDrugs } from '../services/formulary.js';
import { proposeForPatient, confirmForPatient, validateMove } from '../services/schedule.js';
import { uploadPrescription } from '../middleware/upload.js';
import { attachPhoto } from '../services/prescription.js';
import { todayDoses, logDose, syncLogs } from '../services/doses.js';
import {
  openThread,
  postMessage,
  getMessages,
  closeThread,
  patientThreads,
} from '../services/inquiry.js';
import { createRefill, createDelivery, listOrders } from '../services/orders.js';
import { verifyLabel } from '../services/labelScan.js';
import { loyaltyFor } from '../services/adherence.js';
import { encrypt } from '../utils/crypto.js';
import { serializePatient } from '../utils/serializer.js';
import { getPatientDashboard } from '../services/patientDashboard.js';

const router = Router();

// All patient routes require authentication + patient role
router.use(requireAuth, requireRole('patient'));

// A compact, PII-free summary for the signed-in patient's home screen.
router.get('/dashboard', async (req, res) => {
  res.json(await getPatientDashboard(req.user.sub));
});

// ── GET /api/patient/anchors ──────────────────────────────────────────────────
router.get('/anchors', async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT wake_anchor, sleep_anchor, breakfast_anchor, lunch_anchor, dinner_anchor, updated_at
     FROM patient_anchors WHERE patient_id = ?`,
    [req.user.sub]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Anchors not found' });
  res.json(rows[0]);
});

// ── PUT /api/patient/anchors ──────────────────────────────────────────────────
router.put('/anchors', async (req, res) => {
  const { wake_anchor, sleep_anchor, breakfast_anchor, lunch_anchor, dinner_anchor } = req.body;

  // Validate HH:MM format
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const fields = { wake_anchor, sleep_anchor, breakfast_anchor, lunch_anchor, dinner_anchor };
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined && !TIME_RE.test(val)) {
      return res.status(400).json({ error: `${key} must be HH:MM (24-hour)` });
    }
  }

  const updates = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (updates.length === 0) return res.status(400).json({ error: 'No anchor fields provided' });

  const setClauses = updates.map(([k]) => `${k} = ?`).join(', ');
  const values = updates.map(([, v]) => v);

  await pool.execute(`UPDATE patient_anchors SET ${setClauses} WHERE patient_id = ?`, [
    ...values,
    req.user.sub,
  ]);
  res.json({ message: 'Anchors updated' });
});

// ── GET /api/patient/profile ──────────────────────────────────────────────────
// The patient's own enrollment details, decrypted for themselves only — routed
// through serializePatient, the single PII enforcement point (PART 3). Staff can
// never reach this shape: the serializer emits full_name/condition only when the
// viewer is the record's own patient.
router.get('/profile', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM patients WHERE id = ?', [req.user.sub]);
  if (rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
  res.json(serializePatient(rows[0], req.user.role, req.user.sub));
});

// ── PUT /api/patient/profile ──────────────────────────────────────────────────
// Patient edits their own account: full_name and/or medical_condition (both
// encrypted PII). medical_condition is a plain self-declaration — NOT a severity
// or priority selector; whether it confers priority is decided later by the
// pharmacist during prescription validation (PART 2).
router.put('/profile', async (req, res) => {
  const body = req.body ?? {};
  const sets = [];
  const params = [];

  if ('full_name' in body) {
    if (body.full_name !== null && typeof body.full_name !== 'string') {
      return res.status(400).json({ error: 'full_name must be text' });
    }
    const name = String(body.full_name ?? '').trim();
    if (name.length > 200) {
      return res.status(400).json({ error: 'full_name is too long (max 200 characters)' });
    }
    sets.push('full_name_enc = ?');
    params.push(name ? encrypt(name) : null);
  }

  if ('medical_condition' in body) {
    if (body.medical_condition !== null && typeof body.medical_condition !== 'string') {
      return res.status(400).json({ error: 'medical_condition must be text' });
    }
    const value = String(body.medical_condition ?? '').trim();
    if (value.length > 500) {
      return res.status(400).json({ error: 'medical_condition is too long (max 500 characters)' });
    }
    sets.push('medical_condition_enc = ?');
    params.push(value ? encrypt(value) : null);
  }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }
  params.push(req.user.sub);
  await pool.execute(`UPDATE patients SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ message: 'Profile updated' });
});

// ── PUT /api/patient/device-token ─────────────────────────────────────────────
// Register the device's FCM token for online dose reminders (feature #4). The
// native app sends this on login / token refresh. Stored per patient; a new
// token replaces the old (one active device). DELETE clears it on logout so a
// signed-out device stops receiving pushes.
router.put('/device-token', async (req, res) => {
  const token = req.body?.token;
  if (typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ error: 'token is required' });
  }
  if (token.length > 4096) {
    return res.status(400).json({ error: 'token is too long' });
  }
  await pool.execute('UPDATE patients SET fcm_token = ? WHERE id = ?', [
    token.trim(),
    req.user.sub,
  ]);
  res.json({ message: 'Device registered for reminders' });
});

router.delete('/device-token', async (req, res) => {
  await pool.execute('UPDATE patients SET fcm_token = NULL WHERE id = ?', [req.user.sub]);
  res.json({ message: 'Device unregistered' });
});

// ── POST /api/patient/invite ──────────────────────────────────────────────────
// Generate a single-use 8-char invite code for a caregiver to link with (D-G)
router.post('/invite', async (req, res) => {
  // Invalidate any existing unused codes for this patient first
  await pool.execute('UPDATE invite_codes SET used = 1 WHERE patient_id = ? AND used = 0', [
    req.user.sub,
  ]);

  const code = randomBytes(4).toString('hex').toUpperCase(); // 8 hex chars
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h

  await pool.execute(
    'INSERT INTO invite_codes (id, patient_id, code, expires_at) VALUES (?, ?, ?, ?)',
    [uuidv4(), req.user.sub, code, expiresAt]
  );

  res.status(201).json({ code, expires_at: expiresAt });
});

// ── GET /api/patient/drugs?q= ─────────────────────────────────────────────────
// Type-ahead drug picker for the encode form.
router.get('/drugs', async (req, res) => {
  const results = await searchDrugs(req.query.q, 20);
  res.json(results);
});

// ── POST /api/patient/medications ─────────────────────────────────────────────
// Encode a medication. Handles three outcomes:
//   1. Restricted substance  → 403 + "visit nearest branch" redirect (TC-11)
//   2. Uncurated drug        → pending_drug_request, med not schedulable (D-D)
//   3. Curated drug          → encoded, frequency normalized via the parser
router.post('/medications', async (req, res) => {
  const {
    drug_name,
    frequency,
    source = 'OTC_SELF',
    is_prn,
    dosage_instruction,
    start_date,
    end_date,
  } = req.body;

  if (!drug_name || !String(drug_name).trim()) {
    return res.status(400).json({ error: 'drug_name is required' });
  }
  if (!['RX_VALIDATED', 'OTC_SELF'].includes(source)) {
    return res.status(400).json({ error: 'source must be RX_VALIDATED or OTC_SELF' });
  }

  // 1. Restricted-substance check (TC-11) — decline before anything is stored.
  const restricted = await findRestricted(drug_name);
  if (restricted) {
    console.warn(
      `[restricted] patient ${req.user.sub} attempted to encode "${drug_name}" ` +
        `(matched ${restricted.generic_name}/${restricted.category})`
    );
    return res.status(403).json({
      error: 'restricted_substance',
      redirect: 'visit_nearest_branch',
      message:
        'This medication is a restricted substance and cannot be encoded here. ' +
        'Please visit your nearest branch.',
    });
  }

  // 2. Resolve against the curated formulary.
  const drug = await resolveDrug(drug_name);
  const frequencyCode = parseFrequency(frequency);
  const medId = uuidv4();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (drug) {
      // 3. Curated drug — encode as an active, schedulable medication.
      //
      // Encoding NEVER forces prescription validation: a patient may freely build
      // a schedule for any (non-restricted) medicine, including prescription-only
      // ones — they usually already have the medicine from their own pharmacy.
      // Whether a prescription is required is enforced LATER and only at
      // refill/delivery time (the UC-09 gate in services/orders.js), keyed on the
      // drug's PH FDA class. Restricted substances are the sole encode-time
      // exception and were already declined above (TC-11).
      //
      // A patient may still OPT IN to up-front validation by declaring the source
      // as a prescription (RX_VALIDATED) — that routes the med through the upload
      // + pharmacist-approval flow. The default (OTC_SELF) just adds it as active.
      const prn = is_prn !== undefined ? (is_prn ? 1 : 0) : drug.is_prn_default;
      const status = source === 'RX_VALIDATED' ? 'pending_validation' : 'active';
      await conn.execute(
        `INSERT INTO medications
           (id, patient_id, drug_id, drug_name_raw, source, is_prn, frequency,
            frequency_code, dosage_instruction, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          medId,
          req.user.sub,
          drug.id,
          drug_name,
          source,
          prn,
          frequency ?? null,
          frequencyCode,
          dosage_instruction ?? null,
          start_date ?? null,
          end_date ?? null,
          status,
        ]
      );
      await conn.commit();
      return res.status(201).json({
        id: medId,
        status,
        source,
        drug_id: drug.id,
        rx_class: drug.rx_class,
        // Informational only: an Rx-class drug will need a prescription IF the
        // patient later requests a refill/delivery through the app. It does NOT
        // block adding the medicine or building a schedule for it.
        requires_prescription: drug.rx_class === 'RX',
        frequency_code: frequencyCode,
        needs_frequency_review: frequencyCode === 'CONSULT',
        is_provisional_drug: !!drug.is_provisional,
      });
    }

    // Uncurated drug (D-D): create the med as pending_drug + raise a curation request.
    await conn.execute(
      `INSERT INTO medications
         (id, patient_id, drug_id, drug_name_raw, source, is_prn, frequency,
          frequency_code, dosage_instruction, start_date, end_date, status)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_drug')`,
      [
        medId,
        req.user.sub,
        drug_name,
        source,
        is_prn ? 1 : 0,
        frequency ?? null,
        frequencyCode,
        dosage_instruction ?? null,
        start_date ?? null,
        end_date ?? null,
      ]
    );
    await conn.execute(
      `INSERT INTO pending_drug_requests
         (id, patient_id, medication_id, drug_name_raw, frequency_raw)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), req.user.sub, medId, drug_name, frequency ?? null]
    );
    await conn.commit();
    return res.status(202).json({
      id: medId,
      status: 'pending_drug',
      message: 'Awaiting pharmacist verification',
      schedulable: false,
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// ── GET /api/patient/medications ──────────────────────────────────────────────
router.get('/medications', async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT m.id, m.drug_id, m.drug_name_raw, m.source, m.is_prn, m.frequency, m.frequency_code,
            m.dosage_instruction, m.start_date, m.end_date, m.status, m.created_at,
            dr.rx_class,
            pp.status AS prescription_status, pp.decision_reason AS prescription_reason
     FROM medications m
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     LEFT JOIN prescription_photos pp ON pp.id = m.prescription_photo_id
     WHERE m.patient_id = ? AND m.status != 'cancelled'
     ORDER BY m.created_at DESC`,
    [req.user.sub]
  );
  res.json(rows);
});

// ── POST /api/patient/medications/:id/prescription ────────────────────────────
// Upload the CLIENT-REDACTED prescription photo for an RX medication (UC-03, D-K).
// The unredacted original never leaves the device. Multer errors (size/type) → 400.
router.post(
  '/medications/:id/prescription',
  (req, res, next) => {
    uploadPrescription(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'photo file is required (field: photo)' });
    const result = await attachPhoto(req.user.sub, req.params.id, req.file.filename);
    if (result.error === 'not_found')
      return res.status(404).json({ error: 'Medication not found' });
    if (result.error === 'not_rx') {
      return res.status(400).json({ error: 'Only RX_VALIDATED medications need a prescription' });
    }
    if (result.error === 'not_pending') {
      return res.status(409).json({ error: 'This medication is not awaiting validation' });
    }
    res.status(201).json({ photo_id: result.photoId, status: 'pending' });
  }
);

// ── GET /api/patient/schedule ─────────────────────────────────────────────────
// Generate a schedule proposal for today from active medications (ENG §5). The
// engine is deterministic and pure; this endpoint does NOT persist — the patient
// reviews the proposal and confirms it separately (UC-03 steps 4–6).
router.get('/schedule', async (req, res) => {
  const proposal = await proposeForPatient(req.user.sub);
  res.json(proposal);
});

// ── POST /api/patient/schedule/validate ───────────────────────────────────────
// Live re-validation of a single dragged dose against the rest of the layout
// (D-E). Returns { ok } or { ok:false, violation:{ drug, min_gap_hours } }.
router.post('/schedule/validate', async (req, res) => {
  const { doses, index } = req.body ?? {};
  if (!Array.isArray(doses) || typeof index !== 'number') {
    return res.status(400).json({ error: 'doses[] and index are required' });
  }
  res.json(await validateMove(req.user.sub, doses, index));
});

// ── POST /api/patient/schedule/confirm ────────────────────────────────────────
// Persist the confirmed plan (is_confirmed = TRUE), bumping schedule_version.
// An optional `slots` body carries the patient's ±60-min adjustments (D-E),
// re-validated server-side before persisting. Replaces prior not-yet-taken doses.
router.post('/schedule/confirm', async (req, res) => {
  const result = await confirmForPatient(req.user.sub, req.body?.slots);
  if (result.error === 'invalid_layout') {
    return res
      .status(409)
      .json({ error: 'A dose violates a spacing rule', violation: result.violation });
  }
  if (result.error === 'unknown_medication') {
    return res.status(400).json({ error: 'Unknown medication in the adjusted layout' });
  }
  res.status(201).json({ message: 'Schedule confirmed', ...result });
});

// ── GET /api/patient/doses/today ──────────────────────────────────────────────
// The current confirmed day plan with each dose's status — drives the dose
// confirmation UI and the on-device notification schedule.
router.get('/doses/today', async (req, res) => {
  res.json(await todayDoses(req.user.sub));
});

// ── POST /api/patient/doses/:scheduleId/log ───────────────────────────────────
// Log a dose. Timing decides taken/taken_late/missed (D-C) unless action:'snooze'.
// A late intake returns a reflow suggestion (ENG §8). TC-03: manual method logs.
router.post('/doses/:scheduleId/log', async (req, res) => {
  const { logged_at, method, notes, log_id, action } = req.body ?? {};
  const result = await logDose(req.user.sub, req.params.scheduleId, {
    logged_at,
    method,
    notes,
    log_id,
    action,
  });
  if (result.error === 'not_found') return res.status(404).json({ error: 'Dose not found' });
  res.status(201).json(result);
});

// ── POST /api/patient/doses/sync ──────────────────────────────────────────────
// Flush the offline outbox (D-F). Idempotent on each log's client-generated id.
router.post('/doses/sync', async (req, res) => {
  const logs = req.body?.logs;
  if (!Array.isArray(logs)) return res.status(400).json({ error: 'logs[] is required' });
  res.json(await syncLogs(req.user.sub, logs));
});

// ── Ask Your Pharmacist (UC obj 5, D-I) ───────────────────────────────────────
// Anonymous inquiry: pharmacist sees patient_code only; server purges on close.

// Open a thread. A restricted-substance subject is declined with a branch visit.
router.post('/inquiries', async (req, res) => {
  const { subject, branch_id, drug_name } = req.body ?? {};
  const result = await openThread(req.user.sub, {
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
        'Please visit your nearest branch.',
    });
  }
  res.status(201).json(result);
});

router.get('/inquiries', async (req, res) => {
  res.json(await patientThreads(req.user.sub));
});

router.post('/inquiries/:id/messages', async (req, res) => {
  const message = String(req.body?.message ?? '').trim();
  if (!message) return res.status(400).json({ error: 'message is required' });
  const result = await postMessage(req.params.id, 'patient', req.user.sub, message);
  if (result.error === 'not_found') return res.status(404).json({ error: 'Thread not found' });
  if (result.error === 'closed') return res.status(409).json({ error: 'This inquiry is closed' });
  res.status(201).json(result);
});

router.get('/inquiries/:id/messages', async (req, res) => {
  const result = await getMessages(req.params.id, 'patient', req.user.sub);
  if (result.error === 'not_found') return res.status(404).json({ error: 'Thread not found' });
  res.json(result.messages);
});

router.post('/inquiries/:id/close', async (req, res) => {
  const result = await closeThread(req.params.id, 'patient', req.user.sub);
  if (result.error === 'not_found') return res.status(404).json({ error: 'Thread not found' });
  res.json({ message: 'Inquiry closed; server-side messages purged', ...result });
});

// ── Refill & delivery (Tier 2b, D-4 — request + status only, no payments) ─────
router.get('/orders', async (req, res) => {
  res.json(await listOrders(req.user.sub));
});

router.post('/refills', async (req, res) => {
  const result = await createRefill(req.user.sub, req.body ?? {});
  if (result.error === 'branch_required') {
    return res.status(400).json({ error: 'A branch must be selected' });
  }
  if (result.error === 'medication_not_found') {
    return res.status(404).json({ error: 'Medication not found' });
  }
  if (result.error === 'restricted') {
    return res.status(403).json({
      error: 'restricted_substance',
      redirect: 'visit_nearest_branch', // TC-11
      message:
        'This medication requires in-person verification. Please visit your nearest branch — ' +
        'it can’t be requested for refill here.',
    });
  }
  if (result.error === 'no_valid_prescription') {
    return res.status(403).json({
      error: 'prescription_required',
      message:
        'This medication needs an approved prescription on record before you can request a refill. ' +
        'Please upload your prescription for validation first.',
    });
  }
  res.status(201).json(result);
});

router.post('/deliveries', async (req, res) => {
  const result = await createDelivery(req.user.sub, req.body ?? {});
  if (result.error === 'branch_required') {
    return res.status(400).json({ error: 'A branch must be selected for delivery' }); // TC-08
  }
  if (result.error === 'medication_not_found') {
    return res.status(404).json({ error: 'Medication not found' });
  }
  if (result.error === 'branch_not_found') {
    return res.status(404).json({ error: 'Branch not found' });
  }
  if (result.error === 'no_delivery_coverage') {
    return res.status(400).json({ error: 'The selected branch does not offer delivery' });
  }
  if (result.error === 'restricted') {
    return res.status(403).json({
      error: 'restricted_substance',
      redirect: 'visit_nearest_branch', // TC-11
      message:
        'This medication requires in-person verification. Please visit your nearest branch — ' +
        'it can’t be requested for delivery here.',
    });
  }
  if (result.error === 'no_valid_prescription') {
    return res.status(403).json({
      error: 'prescription_required',
      message:
        'This medication needs an approved prescription on record before you can request delivery. ' +
        'Please upload your prescription for validation first.',
    });
  }
  res.status(201).json(result);
});

// ── Label-scan verification (TC-02) ───────────────────────────────────────────
router.post('/label/verify', async (req, res) => {
  const name = String(req.body?.scanned_name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'scanned_name is required' });
  res.json(await verifyLabel(req.user.sub, name));
});

// ── Loyalty flag (adherence-derived; no purchase identity) ────────────────────
router.get('/loyalty', async (req, res) => {
  res.json(await loyaltyFor(req.user.sub));
});

export default router;
