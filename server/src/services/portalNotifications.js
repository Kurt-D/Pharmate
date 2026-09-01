import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { publishUser } from './realtimeEvents.js';

export async function createPortalNotification({
  userId,
  type,
  title,
  body,
  actionPath = null,
  eventKey = null,
  executor = pool,
}) {
  const id = uuidv4();
  const [result] = await executor.execute(
    `INSERT IGNORE INTO portal_notifications
       (id,user_id,type,title,body,action_path,event_key)
     VALUES (?,?,?,?,?,?,?)`,
    [id, userId, type, title, body, actionPath, eventKey]
  );
  // A caller using a transaction connection publishes its domain event only
  // after commit. Never leak a notification for a transaction that may roll back.
  if (result.affectedRows && executor === pool) {
    publishUser(userId, 'NOTIFICATION_CREATED', { id, type, action_path: actionPath });
  }
  return { id, created: Boolean(result.affectedRows) };
}

export async function notifyRole(role, notification, executor = pool) {
  const [users] = await executor.execute('SELECT id FROM users WHERE role=? AND is_active=1', [
    role,
  ]);
  for (const user of users)
    await createPortalNotification({ ...notification, userId: user.id, executor });
  return users.length;
}

export async function notifyLinkedCaregivers(patientId, notification, executor = pool) {
  const [links] = await executor.execute(
    `SELECT caregiver_id FROM caregiver_patients
     WHERE patient_id=? AND status='active'`,
    [patientId]
  );
  for (const link of links)
    await createPortalNotification({ ...notification, userId: link.caregiver_id, executor });
  return links.length;
}
