import { Router } from 'express';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const before = req.query.before ? new Date(req.query.before) : null;
  if (before && Number.isNaN(before.getTime()))
    return res.status(400).json({ error: 'Invalid before cursor' });
  const unreadOnly = req.query.unread_only === 'true';
  const clauses = ['user_id=?'];
  const params = [req.user.sub];
  if (before) {
    clauses.push('created_at < ?');
    params.push(before);
  }
  if (unreadOnly) clauses.push('read_at IS NULL');
  const [rows] = await pool.execute(
    `SELECT id,type,category,title,body,priority,resource_type,resource_id,action_path,read_at,resolved_at,created_at
     FROM portal_notifications WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC LIMIT ${limit + 1}`,
    params
  );
  const [[count]] = await pool.execute(
    'SELECT COUNT(*) AS unread_count FROM portal_notifications WHERE user_id=? AND read_at IS NULL',
    [req.user.sub]
  );
  res.json({
    notifications: rows.slice(0, limit),
    unread_count: Number(count.unread_count),
    next_cursor: rows.length > limit ? rows[limit - 1].created_at : null,
  });
});

router.get('/unread-count', async (req, res) => {
  const [[row]] = await pool.execute(
    'SELECT COUNT(*) AS unread_count FROM portal_notifications WHERE user_id=? AND read_at IS NULL',
    [req.user.sub]
  );
  res.json({ unread_count: Number(row.unread_count) });
});

// Navigation badges are intentionally separate from unread count: an item may
// have been read while its operational work still needs attention.
router.get('/attention-counts', async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT COALESCE(category, type) AS category, COUNT(DISTINCT COALESCE(resource_id, id)) AS count
     FROM portal_notifications
     WHERE user_id=? AND resolved_at IS NULL AND priority IN ('ATTENTION','URGENT')
     GROUP BY COALESCE(category, type)`,
    [req.user.sub]
  );
  res.json({ attention: Object.fromEntries(rows.map((row) => [row.category, Number(row.count)])) });
});

router.patch('/:id/read', async (req, res) => {
  const [result] = await pool.execute(
    'UPDATE portal_notifications SET read_at=COALESCE(read_at,NOW(3)) WHERE id=? AND user_id=?',
    [req.params.id, req.user.sub]
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Notification not found' });
  res.json({ id: req.params.id, read: true });
});

router.post('/read-all', async (req, res) => {
  const [result] = await pool.execute(
    'UPDATE portal_notifications SET read_at=NOW(3) WHERE user_id=? AND read_at IS NULL',
    [req.user.sub]
  );
  res.json({ marked_read: result.affectedRows });
});

router.patch('/:id/resolve', async (req, res) => {
  const [result] = await pool.execute(
    'UPDATE portal_notifications SET resolved_at=COALESCE(resolved_at,NOW(3)) WHERE id=? AND user_id=?',
    [req.params.id, req.user.sub]
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Notification not found' });
  res.json({ id: req.params.id, resolved: true });
});

export default router;
