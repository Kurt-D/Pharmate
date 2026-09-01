import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';

export const NOTIFICATION_TYPES = [
  'dose_reminder',
  'dose_missed',
  'schedule_confirmed',
  'schedule_changed',
  'prescription_approved',
  'prescription_rejected',
  'prescription_needs_clearer',
  'streak_warning',
  'streak_reset',
  'reward_earned',
  'caregiver_update',
];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const GENERIC_MEDICINE = 'your medicine';

function encodeCursor(row) {
  return Buffer.from(JSON.stringify([new Date(row.created_at).toISOString(), row.id])).toString(
    'base64url'
  );
}

export function parseNotificationQuery(query = {}) {
  const rawLimit = query.limit ?? String(DEFAULT_LIMIT);
  if (!/^\d+$/.test(String(rawLimit))) return { error: 'limit must be a positive integer' };
  const limit = Number(rawLimit);
  if (limit < 1 || limit > MAX_LIMIT) {
    return { error: `limit must be between 1 and ${MAX_LIMIT}` };
  }
  if (query.type && !NOTIFICATION_TYPES.includes(query.type)) {
    return { error: 'Unsupported notification type' };
  }
  if (query.unread_only !== undefined && !['true', 'false'].includes(query.unread_only)) {
    return { error: 'unread_only must be true or false' };
  }
  let cursor = null;
  if (query.cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 2 ||
        Number.isNaN(Date.parse(parsed[0])) ||
        typeof parsed[1] !== 'string' ||
        parsed[1].length < 1 ||
        parsed[1].length > 36
      ) {
        throw new Error('invalid');
      }
      cursor = { createdAt: new Date(parsed[0]), id: String(parsed[1]) };
    } catch {
      return { error: 'Invalid cursor' };
    }
  }
  return {
    value: { limit, type: query.type || null, unreadOnly: query.unread_only === 'true', cursor },
  };
}

function serialize(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    created_at: row.created_at,
    read_at: row.read_at,
  };
}

export async function listNotifications(patientId, options) {
  const where = ['patient_id = ?'];
  const params = [patientId];
  if (options.type) {
    where.push('type = ?');
    params.push(options.type);
  }
  if (options.unreadOnly) where.push('read_at IS NULL');
  if (options.cursor) {
    where.push('(created_at < ? OR (created_at = ? AND id < ?))');
    params.push(options.cursor.createdAt, options.cursor.createdAt, options.cursor.id);
  }
  const [rows] = await pool.execute(
    `SELECT id, type, title, message, metadata, created_at, read_at
     FROM patient_notifications WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC LIMIT ${options.limit + 1}`,
    params
  );
  const hasMore = rows.length > options.limit;
  const page = rows.slice(0, options.limit);
  const [[unread]] = await pool.execute(
    'SELECT COUNT(*) AS count FROM patient_notifications WHERE patient_id = ? AND read_at IS NULL',
    [patientId]
  );
  return {
    notifications: page.map(serialize),
    pagination: {
      limit: options.limit,
      has_more: hasMore,
      next_cursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
    },
    unread_count: Number(unread.count),
  };
}

export async function unreadCount(patientId) {
  const [[row]] = await pool.execute(
    'SELECT COUNT(*) AS count FROM patient_notifications WHERE patient_id = ? AND read_at IS NULL',
    [patientId]
  );
  return Number(row.count);
}

export async function markNotificationRead(patientId, id, now = new Date()) {
  await pool.execute(
    `UPDATE patient_notifications SET read_at = COALESCE(read_at, ?)
     WHERE id = ? AND patient_id = ?`,
    [now, id, patientId]
  );
  const [[row]] = await pool.execute(
    `SELECT id, type, title, message, metadata, created_at, read_at
     FROM patient_notifications WHERE id = ? AND patient_id = ?`,
    [id, patientId]
  );
  return row ? serialize(row) : null;
}

export async function markAllNotificationsRead(patientId, now = new Date()) {
  const [result] = await pool.execute(
    'UPDATE patient_notifications SET read_at = ? WHERE patient_id = ? AND read_at IS NULL',
    [now, patientId]
  );
  return result.affectedRows;
}

/** Insert a trusted, allowlisted event. Metadata is constructed here and never accepts request data. */
export async function createPatientNotification({
  patientId,
  type,
  eventKey,
  medicineName,
  metadata = {},
  title,
  message,
  executor = pool,
}) {
  if (!NOTIFICATION_TYPES.includes(type)) throw new Error(`Unsupported notification type: ${type}`);
  const [[prefs]] = await executor.execute(
    `SELECT COALESCE(reminders_enabled, 1) AS reminders_enabled,
            COALESCE(lock_screen_detail, 'private') AS detail
     FROM patient_preferences WHERE patient_id = ?`,
    [patientId]
  );
  if (type === 'dose_reminder' && prefs && !prefs.reminders_enabled) return { created: false };
  const named = prefs?.detail === 'medicine_name' && Boolean(medicineName);
  const medicine = named ? medicineName : GENERIC_MEDICINE;
  const defaultCopy = {
    dose_reminder: ['Medication reminder', `It is time to take ${medicine}.`],
    dose_missed: ['Dose update', `A dose of ${medicine} was marked missed.`],
    schedule_confirmed: ['Schedule confirmed', 'Your medication schedule has been confirmed.'],
    schedule_changed: ['Schedule changed', 'Your medication schedule has been updated.'],
    prescription_approved: [
      'Prescription update',
      `The prescription for ${medicine} was approved.`,
    ],
    prescription_rejected: [
      'Prescription update',
      `The prescription for ${medicine} was not approved.`,
    ],
    prescription_needs_clearer: [
      'Prescription update',
      `A clearer prescription image is needed for ${medicine}.`,
    ],
    streak_warning: ['Streak reminder', 'Complete your remaining doses before midnight.'],
    streak_reset: ['Streak reset', "Complete all of today's doses to begin Day 1 again."],
    reward_earned: ['Priority Token earned', 'A streak reward was added to your balance.'],
    caregiver_update: ['Caregiver update', 'Your caregiver sent a new update.'],
  }[type];
  const safeMetadata = Object.fromEntries(
    Object.entries(metadata).filter(
      ([key, value]) =>
        [
          'schedule_id',
          'schedule_version',
          'medication_id',
          'prescription_id',
          'screen',
          'highlightDoseId',
          'tokens',
          'streak_days',
          'warning_level',
          'dose_count',
        ].includes(key) &&
        (typeof value === 'string' || Number.isInteger(value))
    )
  );
  const [result] = await executor.execute(
    `INSERT IGNORE INTO patient_notifications
       (id, patient_id, type, title, message, metadata, event_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      patientId,
      type,
      String(title || defaultCopy[0]).slice(0, 120),
      String(message || defaultCopy[1]).slice(0, 500),
      JSON.stringify(safeMetadata),
      eventKey,
    ]
  );
  return { created: result.affectedRows === 1 };
}

export async function purgeReadNotifications(now = new Date(), days = notificationRetentionDays()) {
  const cutoff = new Date(now.getTime() - days * 86400000);
  const [result] = await pool.execute(
    'DELETE FROM patient_notifications WHERE read_at IS NOT NULL AND created_at < ?',
    [cutoff]
  );
  return result.affectedRows;
}

export function notificationRetentionDays(env = process.env) {
  const value = Number(env.NOTIFICATION_RETENTION_DAYS ?? 90);
  return Number.isInteger(value) && value >= 1 && value <= 3650 ? value : 90;
}
