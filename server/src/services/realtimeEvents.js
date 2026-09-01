import { pool } from '../db/connection.js';
import { getStreakStatus } from './streakLifecycle.js';

const subscribers = new Map();
let socketIo = null;

export function setRealtimeIo(io) {
  socketIo = io;
}

function room(name) {
  if (!subscribers.has(name)) subscribers.set(name, new Set());
  return subscribers.get(name);
}

function writeEvent(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function subscribeRealtime(user, response) {
  const rooms = [`user:${user.sub}`, `role:${user.role}`];
  for (const name of rooms) room(name).add(response);
  writeEvent(response, 'connected', {
    connected: true,
    role: user.role,
    server_time: new Date().toISOString(),
  });

  return () => {
    for (const name of rooms) {
      const clients = subscribers.get(name);
      clients?.delete(response);
      if (clients?.size === 0) subscribers.delete(name);
    }
  };
}

export function publishRealtime(roomName, event, data) {
  socketIo?.to(roomName).emit(event, data);
  for (const response of subscribers.get(roomName) || []) {
    try {
      writeEvent(response, event, data);
    } catch {
      subscribers.get(roomName)?.delete(response);
    }
  }
}

export function publishUser(userId, event, data) {
  publishRealtime(`user:${userId}`, event, data);
}

export function publishRole(role, event, data) {
  publishRealtime(`role:${role}`, event, data);
}

/** Publish one privacy-scoped dose change to every relevant signed-in surface. */
export async function publishDoseActivity(patientId, scheduleId, status, loggedAt = new Date()) {
  const [streak, [[dose]], [links], [today]] = await Promise.all([
    getStreakStatus(patientId),
    pool.execute(
      `SELECT p.patient_code, m.drug_name_raw
       FROM medication_schedules ms
       JOIN medications m ON m.id = ms.medication_id
       JOIN patients p ON p.id = ms.patient_id
       WHERE ms.id = ? AND ms.patient_id = ?`,
      [scheduleId, patientId]
    ),
    pool.execute(
      `SELECT caregiver_id FROM caregiver_patients
       WHERE patient_id = ? AND status = 'active'`,
      [patientId]
    ),
    pool.execute(
      `SELECT status, COUNT(*) AS count
       FROM medication_schedules
       WHERE patient_id = ? AND is_confirmed = 1
         AND DATE(CONVERT_TZ(scheduled_time, '+00:00', '+08:00')) =
             DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00'))
       GROUP BY status`,
      [patientId]
    ),
  ]);

  const counts = Object.fromEntries(today.map((row) => [row.status, Number(row.count)]));
  const total = today.reduce((sum, row) => sum + Number(row.count), 0);
  const completed = Number(counts.taken || 0) + Number(counts.taken_late || 0);
  const activity = {
    patientId,
    patientCode: dose?.patient_code || 'Patient',
    scheduleId,
    medicationName: dose?.drug_name_raw || 'Scheduled medicine',
    status,
    loggedAt: new Date(loggedAt).toISOString(),
    adherenceRate: total ? Math.round((completed / total) * 100) : 0,
  };

  publishUser(patientId, 'streak-updated', { ...streak, activity });
  publishUser(patientId, 'DOSE_STATUS_CHANGED', activity);
  publishRealtime(`patient:${patientId}`, 'ADHERENCE_UPDATED', { ...streak, activity });
  publishRealtime(`caregiver_patient:${patientId}`, 'DOSE_STATUS_CHANGED', activity);
  publishUser(patientId, 'notification-updated', { reason: 'dose-activity' });
  for (const link of links) publishUser(link.caregiver_id, 'patient-activity', activity);
  publishRole('admin', 'ADHERENCE_UPDATED', {
    patientCode: activity.patientCode,
    status,
    adherenceRate: activity.adherenceRate,
  });
  publishRole('pharmacist', 'dispense-log', {
    patientCode: activity.patientCode,
    scheduleId,
    medicationName: activity.medicationName,
    status,
    loggedAt: activity.loggedAt,
    adherenceRate: activity.adherenceRate,
  });
  publishRole('pharmacist', 'LIVE_DISPENSE_LOG', activity);
  return { streak, activity };
}

export function realtimeSubscriberCount() {
  return [...subscribers.values()].reduce((total, clients) => total + clients.size, 0);
}
