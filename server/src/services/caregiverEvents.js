import { pool } from '../db/connection.js';

const subscribers = new Map();

function writeEvent(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function subscribeCaregiver(caregiverId, response) {
  const current = subscribers.get(caregiverId) || new Set();
  current.add(response);
  subscribers.set(caregiverId, current);
  writeEvent(response, 'connected', { connected: true });

  return () => {
    current.delete(response);
    if (current.size === 0) subscribers.delete(caregiverId);
  };
}

export function publishCaregiverEvent(caregiverId, event, data) {
  for (const response of subscribers.get(caregiverId) || []) {
    writeEvent(response, event, data);
  }
}

export async function publishPatientAdherence(patientId, update) {
  const [links] = await pool.execute(
    `SELECT caregiver_id FROM caregiver_patients
     WHERE patient_id = ? AND status = 'active'`,
    [patientId]
  );
  for (const link of links) {
    publishCaregiverEvent(link.caregiver_id, 'adherence-updated', update);
  }
}
