import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { canonicalName } from '../services/formulary.js';

const router = Router();

router.use(requireAuth, requireRole('pharmacist'));

// ── POST /api/pharmacist/validate ────────────────────────────────────────────
// Prescription validation — full implementation in Sprint 5.
// Stub present now so TC-06 can assert that a patient gets 403 on this endpoint.
router.post('/validate', (_req, res) => {
  res.status(501).json({ error: 'Prescription validation arrives in Sprint 5' });
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
