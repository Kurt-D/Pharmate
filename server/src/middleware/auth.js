import jwt from 'jsonwebtoken';
import { pool } from '../db/connection.js';

const AUTH_ERROR = { error: 'Invalid or expired access token' };

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json(AUTH_ERROR);
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await pool.execute(
      'SELECT id, role, is_active, session_version FROM users WHERE id = ?',
      [decoded.sub]
    );
    const user = rows[0];
    if (
      !user ||
      !user.is_active ||
      !Number.isInteger(decoded.sessionVersion) ||
      decoded.sessionVersion !== user.session_version
    ) {
      return res.status(401).json(AUTH_ERROR);
    }
    req.user = { ...decoded, role: user.role };
    next();
  } catch (error) {
    if (error?.code) return next(error);
    res.status(401).json(AUTH_ERROR);
  }
}
