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
    `SELECT pharmacist.id, pharmacist.full_name, profile.professional_title,
            profile.specialization, profile.languages
     FROM pharmacists pharmacist
     JOIN users user ON user.id=pharmacist.id
     JOIN pharmacist_professional_profiles profile ON profile.pharmacist_id=pharmacist.id
     WHERE pharmacist.branch_id=? AND user.is_active=1
       AND pharmacist.license_status='VERIFIED'
       AND pharmacist.license_verified_at IS NOT NULL
       AND pharmacist.license_expires_on >= CURRENT_DATE()
       AND profile.patient_visible=1 AND profile.chat_available=1
     ORDER BY pharmacist.full_name`,
    [req.params.id]
  );
  res.json(rows);
});

export default router;
