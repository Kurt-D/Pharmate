import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { parseFrequency } from '../../engine/frequencyParser.js';
import { findRestricted, resolveDrug, searchDrugs } from '../services/formulary.js';

const router = Router();

// All patient routes require authentication + patient role
router.use(requireAuth, requireRole('patient'));

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
      // 3. Curated drug — encode normally.
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
        drug_id: drug.id,
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
    `SELECT id, drug_id, drug_name_raw, source, is_prn, frequency, frequency_code,
            dosage_instruction, start_date, end_date, status, created_at
     FROM medications WHERE patient_id = ? ORDER BY created_at DESC`,
    [req.user.sub]
  );
  res.json(rows);
});

export default router;
