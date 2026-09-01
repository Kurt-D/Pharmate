import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { pool } from '../db/connection.js';
import { setRealtimeIo } from '../services/realtimeEvents.js';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

export async function authorizedRooms(user) {
  const rooms = new Set([`user:${user.id}`, `role:${user.role}`]);
  if (user.role === 'patient') rooms.add(`patient:${user.id}`);
  if (user.role === 'caregiver') {
    rooms.add(`caregiver:${user.id}`);
    const [links] = await pool.execute(
      `SELECT patient_id FROM caregiver_patients
       WHERE caregiver_id=? AND status='active'`,
      [user.id]
    );
    links.forEach((link) => rooms.add(`caregiver_patient:${link.patient_id}`));
  }
  if (user.role === 'pharmacist') rooms.add(`pharmacist:${user.id}`);
  if (user.role === 'admin') rooms.add(`admin:${user.id}`);
  return [...rooms];
}

async function authenticateSocket(socket, next) {
  try {
    const bearer = socket.handshake.auth?.token || socket.handshake.headers.authorization;
    const token = String(bearer || '').replace(/^Bearer\s+/i, '');
    if (!token) return next(new Error('Authentication required'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const [[user]] = await pool.execute(
      'SELECT id,role,is_active,session_version FROM users WHERE id=?',
      [decoded.sub]
    );
    if (!user?.is_active || !Number.isInteger(decoded.sessionVersion) || decoded.sessionVersion !== user.session_version) {
      return next(new Error('Invalid or expired access token'));
    }
    socket.data.user = { id: user.id, role: user.role };
    socket.data.authorizedRooms = await authorizedRooms(socket.data.user);
    return next();
  } catch {
    return next(new Error('Invalid or expired access token'));
  }
}

export function initializeSocketServer(httpServer, allowedOrigins = new Set()) {
  const io = new Server(httpServer, {
    cors: {
      credentials: true,
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin) || (process.env.NODE_ENV !== 'production' && LOCAL_ORIGIN.test(origin))) {
          return callback(null, true);
        }
        return callback(new Error('Origin not allowed'));
      },
    },
    transports: ['websocket', 'polling'],
  });
  io.use(authenticateSocket);
  io.on('connection', (socket) => {
    socket.join(socket.data.authorizedRooms);
    socket.emit('connected', { connected: true, role: socket.data.user.role, server_time: new Date().toISOString() });
    // Clients may request a room only when it was derived server-side from the
    // authenticated account and current caregiver links.
    socket.on('join_room', ({ room } = {}, acknowledge = () => {}) => {
      if (!socket.data.authorizedRooms.includes(String(room))) {
        return acknowledge({ ok: false, error: 'Room access denied' });
      }
      socket.join(room);
      return acknowledge({ ok: true });
    });
  });
  setRealtimeIo(io);
  return io;
}
