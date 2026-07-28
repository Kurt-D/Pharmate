/**
 * SUS / TAM survey submission (Sprint 7 instrumentation).
 *
 * Any authenticated user may submit either instrument; responses are stored with
 * the user's id and role for later admin CSV export. The response body is the raw
 * per-question map, e.g. { "q1": 4, "q2": 3, ... }.
 */
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const TABLES = { sus: 'sus_responses', tam: 'tam_responses' };

// ── POST /api/surveys/:instrument ─────────────────────────────────────────────
router.post('/:instrument', async (req, res) => {
  const table = TABLES[req.params.instrument];
  if (!table) return res.status(404).json({ error: 'Unknown instrument (use sus or tam)' });

  const responses = req.body?.responses;
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) {
    return res.status(400).json({ error: 'responses object is required' });
  }

  const id = uuidv4();
  await pool.execute(
    `INSERT INTO ${table} (id, user_id, role, responses_json) VALUES (?, ?, ?, ?)`,
    [id, req.user.sub, req.user.role, JSON.stringify(responses)]
  );
  res.status(201).json({ id, instrument: req.params.instrument });
});

export default router;
