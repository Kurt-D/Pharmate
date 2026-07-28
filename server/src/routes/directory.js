/**
 * Branch & pharmacist directory (Sprint 8, UC-02).
 *
 * Manual branch selection only — the patient picks a branch from the list. NO
 * geolocation / location API is used anywhere in the codebase (acceptance:
 * grep-verified). Any authenticated user may read the directory.
 */
import { Router } from 'express';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ── GET /api/directory/branches ───────────────────────────────────────────────
router.get('/branches', async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, name, address, hours_json, services_json, delivery_coverage
     FROM pharmacy_branches WHERE is_active = 1 ORDER BY name`
  );
  res.json(rows);
});

// ── GET /api/directory/branches/:id/pharmacists ───────────────────────────────
router.get('/branches/:id/pharmacists', async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, full_name, license_number FROM pharmacists WHERE branch_id = ? ORDER BY full_name`,
    [req.params.id]
  );
  res.json(rows);
});

export default router;
