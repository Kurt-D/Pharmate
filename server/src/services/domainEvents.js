import { publishRealtime, publishRole, publishUser } from './realtimeEvents.js';
import {
  createPortalNotification,
  notifyLinkedCaregivers,
  notifyRole,
} from './portalNotifications.js';

export async function medicationChanged(
  patientId,
  action,
  medicationId,
  medicineName = 'Medicine'
) {
  const payload = { action, medication_id: medicationId };
  publishUser(patientId, action, payload);
  publishRealtime(`patient:${patientId}`, action, payload);
  publishRealtime(`caregiver_patient:${patientId}`, action, payload);
  publishRole('pharmacist', action, { patient_id: patientId, medication_id: medicationId });
  publishRole('admin', action, { medication_id: medicationId });
  await notifyLinkedCaregivers(patientId, {
    type: action,
    title: 'Patient medication updated',
    body: `${medicineName} was ${action === 'MEDICATION_STOPPED' ? 'stopped' : action === 'MEDICATION_CREATED' ? 'added' : 'updated'}.`,
    actionPath: '/caregiver/medication',
    eventKey: `${action}:${medicationId}`,
  });
}

export async function scheduleChanged(patientId, version) {
  const payload = { schedule_version: Number(version) };
  publishUser(patientId, 'SCHEDULE_CONFIRMED', payload);
  publishRealtime(`caregiver_patient:${patientId}`, 'SCHEDULE_CONFIRMED', payload);
  publishRole('pharmacist', 'SCHEDULE_CONFIRMED', { patient_id: patientId, ...payload });
  publishRole('admin', 'SCHEDULE_CONFIRMED', payload);
}

export async function orderChanged({ patientId, kind, orderId, status, created = false }) {
  const payload = { kind, order_id: orderId, status };
  publishUser(patientId, 'ORDER_STATUS_CHANGED', payload);
  publishRealtime(`caregiver_patient:${patientId}`, 'ORDER_STATUS_CHANGED', payload);
  publishRole('pharmacist', 'ORDER_STATUS_CHANGED', { patient_id: patientId, ...payload });
  publishRole('admin', 'ORDER_STATUS_CHANGED', payload);
  if (created) {
    await notifyRole('pharmacist', {
      type: 'ORDER_STATUS_CHANGED',
      title: `New ${kind} request`,
      body: 'A new request is ready for operational review.',
      actionPath: '/pharmacist/orders',
      eventKey: `order-created:${kind}:${orderId}`,
    });
    await notifyRole('admin', {
      type: 'ORDER_STATUS_CHANGED',
      title: `New ${kind} request`,
      body: 'A new request was added to the order queue.',
      actionPath: '/admin/orders',
      eventKey: `order-created:${kind}:${orderId}`,
    });
  } else {
    await createPortalNotification({
      userId: patientId,
      type: 'ORDER_STATUS_CHANGED',
      title: `${kind} status updated`,
      body: `Your ${kind} request is now ${String(status).replaceAll('_', ' ')}.`,
      actionPath: '/patient/orders',
      eventKey: `order-status:${kind}:${orderId}:${status}`,
    });
    await notifyLinkedCaregivers(patientId, {
      type: 'ORDER_STATUS_CHANGED',
      title: `Patient ${kind} updated`,
      body: `The request is now ${String(status).replaceAll('_', ' ')}.`,
      actionPath: '/caregiver/orders',
      eventKey: `order-status:${kind}:${orderId}:${status}`,
    });
  }
}

export async function inquiryChanged({ patientId, threadId, action, recipientRole = null }) {
  const payload = { inquiry_id: threadId, action };
  publishUser(patientId, 'INQUIRY_UPDATED', payload);
  publishRole('pharmacist', 'INQUIRY_UPDATED', { patient_id: patientId, ...payload });
  if (recipientRole === 'patient') {
    await createPortalNotification({
      userId: patientId,
      type: 'INQUIRY_UPDATED',
      title: 'Pharmacist inquiry updated',
      body: 'Your pharmacist conversation has a new update.',
      actionPath: '/patient/ask',
      eventKey: `inquiry:${threadId}:${action}:${Date.now()}`,
    });
  }
}

export async function prescriptionChanged({ patientId, prescriptionId, status }) {
  const payload = { prescription_id: prescriptionId, status };
  publishUser(patientId, 'PRESCRIPTION_STATUS_CHANGED', payload);
  publishRealtime(`caregiver_patient:${patientId}`, 'PRESCRIPTION_STATUS_CHANGED', payload);
  publishRole('admin', 'PRESCRIPTION_STATUS_CHANGED', payload);
  await notifyLinkedCaregivers(patientId, {
    type: 'PRESCRIPTION_STATUS_CHANGED',
    title: 'Patient prescription updated',
    body: `Prescription review status: ${String(status).replaceAll('_', ' ')}.`,
    actionPath: '/caregiver/medication',
    eventKey: `prescription:${prescriptionId}:${status}`,
  });
}
