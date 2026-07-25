import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';

const router = Router();

router.use(requireAuth, requireRole('caregiver'));

// ── POST /api/caregiver/link ──────────────────────────────────────────────────
// Caregiver submits a patient's invite code to link accounts
router.post('/link', async (req, res) => {
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
    await conn.execute(
      'UPDATE invite_codes SET used = 1, used_at = NOW(3) WHERE id = ?',
      [invite.id]
    );
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
