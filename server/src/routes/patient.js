import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';

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

  await pool.execute(
    `UPDATE patient_anchors SET ${setClauses} WHERE patient_id = ?`,
    [...values, req.user.sub]
  );
  res.json({ message: 'Anchors updated' });
});

// ── POST /api/patient/invite ──────────────────────────────────────────────────
// Generate a single-use 8-char invite code for a caregiver to link with (D-G)
router.post('/invite', async (req, res) => {
  // Invalidate any existing unused codes for this patient first
  await pool.execute(
    'UPDATE invite_codes SET used = 1 WHERE patient_id = ? AND used = 0',
    [req.user.sub]
  );

  const code = randomBytes(4).toString('hex').toUpperCase(); // 8 hex chars
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h

  await pool.execute(
    'INSERT INTO invite_codes (id, patient_id, code, expires_at) VALUES (?, ?, ?, ?)',
    [uuidv4(), req.user.sub, code, expiresAt]
  );

  res.status(201).json({ code, expires_at: expiresAt });
});

export default router;
