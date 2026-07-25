import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';

const router = Router();

router.use(requireAuth, requireRole('pharmacist'));

// ── POST /api/pharmacist/validate ────────────────────────────────────────────
// Prescription validation — full implementation in Sprint 5.
// Stub present now so TC-06 can assert that a patient gets 403 on this endpoint.
router.post('/validate', (_req, res) => {
  res.status(501).json({ error: 'Prescription validation arrives in Sprint 5' });
});

export default router;
