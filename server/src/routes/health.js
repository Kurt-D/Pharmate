import { Router } from 'express';
import { pool } from '../db/connection.js';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    await pool.execute('SELECT 1');
    res.json({ status: 'ok', service: 'pharmate-server', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', service: 'pharmate-server', db: 'unreachable' });
  }
});

export default router;
