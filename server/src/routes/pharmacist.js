import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { canonicalName } from '../services/formulary.js';
import { pendingValidations, photoFilePath, decideValidation } from '../services/prescription.js';
import { pharmacistFollowups } from '../services/alerts.js';
import { pharmacistQueue, postMessage, getMessages, closeThread } from '../services/inquiry.js';
import { orderQueue, updateOrderStatus } from '../services/orders.js';

const router = Router();

router.use(requireAuth, requireRole('pharmacist'));

// ── GET /api/pharmacist/summary ───────────────────────────────────────────────
// Dashboard counts for the pharmacist's work queues. Aggregates only — no PII.
router.get('/summary', async (_req, res) => {
  const [[validations]] = await pool.execute(
    "SELECT COUNT(*) AS c FROM prescription_photos WHERE status = 'pending'"
  );
  const [[curation]] = await pool.execute(
    "SELECT COUNT(*) AS c FROM pending_drug_requests WHERE status = 'pending'"
  );
  const [[inquiries]] = await pool.execute(
    "SELECT COUNT(*) AS c FROM inquiry_threads WHERE status = 'open'"
  );
  const [[refills]] = await pool.execute(
    "SELECT COUNT(*) AS c FROM refill_requests WHERE status IN ('pending','processing')"
  );
  const [[deliveries]] = await pool.execute(
    "SELECT COUNT(*) AS c FROM delivery_requests WHERE status IN ('pending','processing','out_for_delivery')"
  );
  const [[followups]] = await pool.execute(
    "SELECT COUNT(*) AS c FROM caregiver_alerts WHERE channel = 'pharmacist' AND status = 'unseen'"
  );
  const [[patients]] = await pool.execute('SELECT COUNT(*) AS c FROM patients');

  res.json({
    pending_validations: validations.c,
    pending_curation: curation.c,
    open_inquiries: inquiries.c,
    open_orders: refills.c + deliveries.c,
    followups: followups.c,
    patients: patients.c,
  });
});

// ── GET /api/pharmacist/followups ─────────────────────────────────────────────
// No-caregiver missed-dose flags (UC-08). patient_code only — no PII.
router.get('/followups', async (_req, res) => {
  res.json(await pharmacistFollowups());
});

// ── GET /api/pharmacist/patients ──────────────────────────────────────────────
// Roster for the pharmacist console (PART 3). patient_code only, with columns:
// priority badge (boolean), active meds, adherence. Never a name or the clinical
// condition itself (TC-05).
router.get('/patients', async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT p.patient_code,
            p.priority_flag,
            COUNT(DISTINCT CASE WHEN m.status = 'active' THEN m.id END) AS active_meds,
            COUNT(ms.id) AS scheduled,
            SUM(ms.status IN ('taken','taken_late')) AS taken
     FROM patients p
     LEFT JOIN medications m ON m.patient_id = p.id
     LEFT JOIN medication_schedules ms ON ms.patient_id = p.id
     GROUP BY p.id, p.patient_code, p.priority_flag
     ORDER BY p.priority_flag DESC, p.patient_code`
  );
  res.json(
    rows.map((r) => ({
      patient_code: r.patient_code,
      priority: !!r.priority_flag,
      active_meds: Number(r.active_meds ?? 0),
      adherence_pct: r.scheduled
        ? Math.round((Number(r.taken ?? 0) / Number(r.scheduled)) * 100)
        : null,
    }))
  );
});

// ── Ask Your Pharmacist — pharmacist side (D-I) ───────────────────────────────
// Queue and threads show patient_code only; never a name.
router.get('/inquiries', async (_req, res) => {
  res.json(await pharmacistQueue());
});

router.get('/inquiries/:id/messages', async (req, res) => {
  res.json(await getMessages(req.params.id));
});

router.post('/inquiries/:id/reply', async (req, res) => {
  const message = String(req.body?.message ?? '').trim();
  if (!message) return res.status(400).json({ error: 'message is required' });
  const result = await postMessage(req.params.id, 'pharmacist', req.user.sub, message);
  if (result.error === 'not_found') return res.status(404).json({ error: 'Thread not found' });
  if (result.error === 'closed') return res.status(409).json({ error: 'This inquiry is closed' });
  res.status(201).json(result);
});

router.post('/inquiries/:id/close', async (req, res) => {
  const result = await closeThread(req.params.id);
  if (result.error === 'not_found') return res.status(404).json({ error: 'Thread not found' });
  res.json({ message: 'Inquiry closed; server-side messages purged', ...result });
});

// ── Refill & delivery queue (Tier 2b) — patient_code only, status only ────────
router.get('/orders', async (_req, res) => {
  res.json(await orderQueue());
});

router.post('/orders/:kind/:id/status', async (req, res) => {
  const { kind, id } = req.params;
  if (kind !== 'refill' && kind !== 'delivery') {
    return res.status(400).json({ error: 'kind must be refill or delivery' });
  }
  const result = await updateOrderStatus(kind, id, req.body?.status);
  if (result.error === 'bad_status') return res.status(400).json({ error: 'Invalid status' });
  if (result.error === 'not_found') return res.status(404).json({ error: 'Order not found' });
  res.json(result);
});

// ── GET /api/pharmacist/validations ──────────────────────────────────────────
// Prescription validation queue (UC-03). Patients shown by patient_code only.
router.get('/validations', async (_req, res) => {
  res.json(await pendingValidations());
});

// ── GET /api/pharmacist/validations/:id/photo ────────────────────────────────
// Serve the redacted prescription image for review. 404 once purged (D-K).
router.get('/validations/:id/photo', async (req, res) => {
  const abs = await photoFilePath(req.params.id);
  if (!abs) return res.status(404).json({ error: 'Photo not available' });
  res.sendFile(abs);
});

// ── POST /api/pharmacist/validate ────────────────────────────────────────────
// Record a validation decision (TC-04). The pharmacist's role ends here — there
// are no scheduling controls. Approval flips the medication to `active`, which
// the patient then schedules and confirms separately (ENG §6).
router.post('/validate', async (req, res) => {
  const { photo_id, action, reason } = req.body;
  if (!photo_id) return res.status(400).json({ error: 'photo_id is required' });

  const result = await decideValidation(req.user.sub, photo_id, action, reason);
  if (result.error === 'bad_action') {
    return res
      .status(400)
      .json({ error: "action must be 'approve', 'reject', or 'needs_clearer'" });
  }
  if (result.error === 'reason_required') {
    return res
      .status(400)
      .json({ error: 'A reason is required to reject or request a clearer photo' });
  }
  if (result.error === 'not_found') return res.status(404).json({ error: 'Validation not found' });
  if (result.error === 'already_decided') {
    return res.status(409).json({ error: 'This prescription has already been decided' });
  }
  res.json(result);
});

// ── GET /api/pharmacist/pending-drugs ─────────────────────────────────────────
// Curation queue for uncurated drugs (D-D). Patients are shown by patient_code
// only — never by name (Sprint 2 pseudonymity).
router.get('/pending-drugs', async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT pdr.id, pdr.medication_id, pdr.drug_name_raw, pdr.frequency_raw,
            pdr.status, pdr.requested_at, p.patient_code
     FROM pending_drug_requests pdr
     JOIN patients p ON p.id = pdr.patient_id
     WHERE pdr.status = 'pending'
     ORDER BY pdr.requested_at ASC`
  );
  res.json(rows);
});

// ── POST /api/pharmacist/pending-drugs/:id/curate ─────────────────────────────
// Curate an uncurated drug into the formulary (pharmacist-signed) and resolve
// the medication, OR reject the request.
router.post('/pending-drugs/:id/curate', async (req, res) => {
  const { id } = req.params;
  const {
    action, // 'approve' | 'reject'
    generic_name,
    brand_names,
    min_interval_hours,
    max_daily_doses,
    is_prn_default,
    default_interval_hours,
    meal_anchor_code,
  } = req.body;

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
  }

  const [reqRows] = await pool.execute(
    `SELECT id, medication_id, drug_name_raw, status FROM pending_drug_requests WHERE id = ?`,
    [id]
  );
  const pending = reqRows[0];
  if (!pending) return res.status(404).json({ error: 'Pending request not found' });
  if (pending.status !== 'pending') {
    return res.status(409).json({ error: `Request already ${pending.status}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (action === 'reject') {
      await conn.execute(
        `UPDATE pending_drug_requests SET status='rejected', resolved_at=NOW(3) WHERE id=?`,
        [id]
      );
      if (pending.medication_id) {
        await conn.execute(`UPDATE medications SET status='cancelled' WHERE id=?`, [
          pending.medication_id,
        ]);
      }
      await conn.commit();
      return res.json({ status: 'rejected' });
    }

    // approve — insert into formulary, pharmacist-signed (verified now).
    const name = canonicalName(generic_name || pending.drug_name_raw);
    const drugId = uuidv4();
    await conn.execute(
      `INSERT INTO drug_reference
         (id, generic_name, brand_names_json, min_interval_hours, max_daily_doses,
          is_prn_default, default_interval_hours, meal_anchor_code,
          is_restricted, verified_by, verified_at, is_provisional)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(3), 0)
       ON DUPLICATE KEY UPDATE
         min_interval_hours=VALUES(min_interval_hours),
         max_daily_doses=VALUES(max_daily_doses),
         verified_by=VALUES(verified_by), verified_at=NOW(3), is_provisional=0`,
      [
        drugId,
        name,
        JSON.stringify(
          brand_names
            ? String(brand_names)
                .split(',')
                .map((s) => s.trim())
            : []
        ),
        min_interval_hours ?? null,
        max_daily_doses ?? null,
        is_prn_default ? 1 : 0,
        default_interval_hours ?? null,
        meal_anchor_code || 'NONE',
        req.user.sub,
      ]
    );
    const [drugRow] = await conn.execute(
      'SELECT id FROM drug_reference WHERE generic_name = ? LIMIT 1',
      [name]
    );
    const resolvedDrugId = drugRow[0].id;

    if (pending.medication_id) {
      await conn.execute(`UPDATE medications SET drug_id=?, status='active' WHERE id=?`, [
        resolvedDrugId,
        pending.medication_id,
      ]);
    }
    await conn.execute(
      `UPDATE pending_drug_requests SET status='curated', resolved_at=NOW(3) WHERE id=?`,
      [id]
    );
    await conn.commit();
    res.json({ status: 'curated', drug_id: resolvedDrugId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

export default router;
