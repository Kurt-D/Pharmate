import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { recordAudit } from './audit.js';

const TOPICS = new Set([
  'POST_DISPENSING',
  'MEDICATION_REVIEW',
  'MISSED_DOSE',
  'SIDE_EFFECT_CONCERN',
  'OTHER',
]);
const MODALITIES = new Set(['VIDEO', 'AUDIO', 'PHONE']);
const DURATIONS = new Set([15, 30, 45, 60]);

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function validateAppointmentRequest(input = {}, now = new Date()) {
  const topic = String(input.topic || 'POST_DISPENSING').toUpperCase();
  const modality = String(input.modality || 'VIDEO').toUpperCase();
  const durationMinutes = Number(input.duration_minutes || 30);
  const start = new Date(input.scheduled_start_at);
  if (!String(input.branch_id || '').trim()) return { error: 'Select a pharmacy branch.' };
  if (!TOPICS.has(topic)) return { error: 'Select a valid counseling topic.' };
  if (!MODALITIES.has(modality)) return { error: 'Select a valid appointment type.' };
  if (!DURATIONS.has(durationMinutes))
    return { error: 'Appointment duration must be 15, 30, 45, or 60 minutes.' };
  if (Number.isNaN(start.getTime())) return { error: 'Select a valid appointment date and time.' };
  if (start.getTime() < now.getTime() + 30 * 60000) {
    return { error: 'Appointments must be requested at least 30 minutes in advance.' };
  }
  if (start.getTime() > now.getTime() + 90 * 86400000) {
    return { error: 'Appointments can be requested up to 90 days ahead.' };
  }
  return {
    value: {
      branch_id: String(input.branch_id).trim(),
      topic,
      modality,
      duration_minutes: durationMinutes,
      scheduled_start_at: start,
    },
  };
}

export function validateAppointmentDecision(input = {}) {
  const action = String(input.action || '').toUpperCase();
  if (!['CONFIRM', 'DECLINE'].includes(action)) return { error: 'Select confirm or decline.' };
  const reason =
    String(input.reason || '')
      .trim()
      .slice(0, 500) || null;
  const meetingUrl = input.meeting_url ? httpsUrl(input.meeting_url) : null;
  const instructions =
    String(input.session_instructions || '')
      .trim()
      .slice(0, 500) || null;
  if (action === 'DECLINE' && !reason) return { error: 'A reason is required when declining.' };
  if (action === 'CONFIRM' && !meetingUrl && !instructions) {
    return { error: 'Add a secure HTTPS meeting link or session instructions.' };
  }
  if (input.meeting_url && !meetingUrl) return { error: 'Meeting links must use HTTPS.' };
  return { value: { action, reason, meeting_url: meetingUrl, session_instructions: instructions } };
}

export async function patientAppointments(patientId) {
  const [rows] = await pool.execute(
    `SELECT appointment.id,appointment.topic,appointment.modality,
            appointment.scheduled_start_at,appointment.duration_minutes,appointment.timezone,
            appointment.meeting_url,appointment.session_instructions,appointment.status,
            appointment.decision_reason,appointment.requested_at,branch.name AS branch_name,
            CASE WHEN summary.status='PUBLISHED' THEN summary.id ELSE NULL END AS summary_id
     FROM counseling_appointments appointment
     JOIN pharmacy_branches branch ON branch.id=appointment.branch_id
     LEFT JOIN counseling_summaries summary ON summary.appointment_id=appointment.id
     WHERE appointment.patient_id=?
     ORDER BY appointment.scheduled_start_at DESC LIMIT 100`,
    [patientId]
  );
  return rows;
}

export async function publishedCounselingSummaries(patientId) {
  const [rows] = await pool.execute(
    `SELECT summary.id,summary.appointment_id,summary.summary_text,summary.template_version,
            summary.published_at,appointment.topic,appointment.scheduled_start_at,
            branch.name AS branch_name,pharmacist.full_name AS pharmacist_name
     FROM counseling_summaries summary
     JOIN counseling_appointments appointment ON appointment.id=summary.appointment_id
     JOIN pharmacy_branches branch ON branch.id=appointment.branch_id
     JOIN pharmacists pharmacist ON pharmacist.id=summary.pharmacist_id
     WHERE summary.patient_id=? AND summary.status='PUBLISHED'
     ORDER BY summary.published_at DESC`,
    [patientId]
  );
  return rows;
}

export async function createAppointment(patientId, input, actor) {
  const [[branch]] = await pool.execute(
    'SELECT id,services_json FROM pharmacy_branches WHERE id=? AND is_active=1',
    [input.branch_id]
  );
  if (!branch) return { error: { status: 404, message: 'Pharmacy branch not found.' } };
  let services = [];
  try {
    services = Array.isArray(branch.services_json)
      ? branch.services_json
      : JSON.parse(branch.services_json || '[]');
  } catch {
    services = [];
  }
  if (services.length && !services.includes('consultation')) {
    return {
      error: { status: 400, message: 'This branch does not offer counseling appointments.' },
    };
  }
  const id = uuidv4();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `INSERT INTO counseling_appointments
         (id,patient_id,branch_id,topic,modality,scheduled_start_at,duration_minutes)
       VALUES (?,?,?,?,?,?,?)`,
      [
        id,
        patientId,
        input.branch_id,
        input.topic,
        input.modality,
        input.scheduled_start_at,
        input.duration_minutes,
      ]
    );
    await recordAudit({
      actor,
      action: 'COUNSELING_APPOINTMENT_REQUESTED',
      entityType: 'counseling_appointment',
      entityId: id,
      patientId,
      metadata: { topic: input.topic, modality: input.modality },
      executor: conn,
    });
    await conn.commit();
    return { id, status: 'REQUESTED' };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function pharmacistAppointments(pharmacistId, status = null) {
  const params = [pharmacistId];
  let statusSql = '';
  if (status) {
    statusSql = ' AND appointment.status=?';
    params.push(status);
  }
  const [rows] = await pool.execute(
    `SELECT appointment.*,patient.patient_code,branch.name AS branch_name,
            summary.id AS summary_id,summary.status AS summary_status,summary.summary_text,
            summary.template_version,summary.published_at
     FROM counseling_appointments appointment
     JOIN patients patient ON patient.id=appointment.patient_id
     JOIN pharmacy_branches branch ON branch.id=appointment.branch_id
     LEFT JOIN counseling_summaries summary ON summary.appointment_id=appointment.id
     JOIN pharmacists pharmacist ON pharmacist.id=?
     WHERE (appointment.branch_id=pharmacist.branch_id OR appointment.pharmacist_id=?)${statusSql}
     ORDER BY FIELD(appointment.status,'REQUESTED','CONFIRMED','COMPLETED','DECLINED','CANCELLED'),
              appointment.scheduled_start_at ASC LIMIT 200`,
    [pharmacistId, ...params]
  );
  return rows;
}

export async function decideAppointment(pharmacistId, appointmentId, input, actor) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[appointment]] = await conn.execute(
      `SELECT appointment.*,pharmacist.branch_id AS pharmacist_branch_id
       FROM counseling_appointments appointment
       JOIN pharmacists pharmacist ON pharmacist.id=?
       WHERE appointment.id=? FOR UPDATE`,
      [pharmacistId, appointmentId]
    );
    if (!appointment || appointment.branch_id !== appointment.pharmacist_branch_id) {
      await conn.rollback();
      return { error: { status: 404, message: 'Appointment not found for your branch.' } };
    }
    if (appointment.status !== 'REQUESTED') {
      await conn.rollback();
      return {
        error: { status: 409, message: 'This appointment is no longer awaiting a decision.' },
      };
    }
    if (input.action === 'CONFIRM') {
      const end = new Date(
        new Date(appointment.scheduled_start_at).getTime() + appointment.duration_minutes * 60000
      );
      const [[conflict]] = await conn.execute(
        `SELECT id FROM counseling_appointments
         WHERE pharmacist_id=? AND status='CONFIRMED'
           AND scheduled_start_at < ?
           AND DATE_ADD(scheduled_start_at,INTERVAL duration_minutes MINUTE) > ?
         LIMIT 1`,
        [pharmacistId, end, appointment.scheduled_start_at]
      );
      if (conflict) {
        await conn.rollback();
        return {
          error: { status: 409, message: 'This time overlaps another confirmed appointment.' },
        };
      }
    }
    const nextStatus = input.action === 'CONFIRM' ? 'CONFIRMED' : 'DECLINED';
    await conn.execute(
      `UPDATE counseling_appointments
       SET pharmacist_id=?,status=?,meeting_url=?,session_instructions=?,decision_reason=?,
           confirmed_at=CASE WHEN ?='CONFIRMED' THEN NOW(3) ELSE NULL END,
           cancelled_at=CASE WHEN ?='DECLINED' THEN NOW(3) ELSE NULL END
       WHERE id=?`,
      [
        pharmacistId,
        nextStatus,
        input.meeting_url,
        input.session_instructions,
        input.reason,
        nextStatus,
        nextStatus,
        appointmentId,
      ]
    );
    await recordAudit({
      actor,
      action: `COUNSELING_APPOINTMENT_${nextStatus}`,
      entityType: 'counseling_appointment',
      entityId: appointmentId,
      patientId: appointment.patient_id,
      metadata: { modality: appointment.modality },
      executor: conn,
    });
    await conn.commit();
    return { id: appointmentId, patient_id: appointment.patient_id, status: nextStatus };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function nextSummaryVersion(conn, summaryId) {
  const [[row]] = await conn.execute(
    'SELECT COALESCE(MAX(version),0)+1 AS version FROM counseling_summary_revisions WHERE summary_id=?',
    [summaryId]
  );
  return Number(row.version);
}

function generatedSummaryText(appointment, medications) {
  const lines = [
    `Follow-up completed for ${String(appointment.topic).toLowerCase().replaceAll('_', ' ')}.`,
    '',
    'Medicine plan reviewed:',
  ];
  if (!medications.length)
    lines.push('- No active medicine directions were available in PharMate at the time of review.');
  for (const medication of medications) {
    const directions =
      medication.dosage_instruction || medication.frequency || 'Follow the dispensing label.';
    lines.push(`- ${medication.drug_name_raw}: ${directions}`);
  }
  lines.push(
    '',
    'Use the exact prescription or dispensing-label directions. Contact the pharmacy if a dose, strength, formulation, or instruction does not match the package.',
    'Seek urgent medical help for severe symptoms. This summary records the counseling session and is not a medical guarantee.'
  );
  return lines.join('\n');
}

export async function completeAppointment(pharmacistId, appointmentId, actor) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[appointment]] = await conn.execute(
      `SELECT * FROM counseling_appointments
       WHERE id=? AND pharmacist_id=? FOR UPDATE`,
      [appointmentId, pharmacistId]
    );
    if (!appointment) {
      await conn.rollback();
      return { error: { status: 404, message: 'Assigned appointment not found.' } };
    }
    if (appointment.status !== 'CONFIRMED') {
      await conn.rollback();
      return { error: { status: 409, message: 'Only confirmed appointments can be completed.' } };
    }
    const [medications] = await conn.execute(
      `SELECT id,drug_name_raw,dosage_instruction,frequency,source,is_prn
       FROM medications WHERE patient_id=? AND status='active' ORDER BY created_at`,
      [appointment.patient_id]
    );
    const summaryId = uuidv4();
    const summaryText = generatedSummaryText(appointment, medications);
    const sourceSnapshot = {
      appointment_id: appointment.id,
      generated_at: new Date().toISOString(),
      medications: medications.map((medication) => ({
        id: medication.id,
        drug_name: medication.drug_name_raw,
        directions: medication.dosage_instruction || medication.frequency || null,
        source: medication.source,
        is_prn: Boolean(medication.is_prn),
      })),
    };
    await conn.execute(
      `INSERT INTO counseling_summaries
         (id,appointment_id,patient_id,pharmacist_id,summary_text,source_snapshot_json)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE summary_text=VALUES(summary_text),
         source_snapshot_json=VALUES(source_snapshot_json),status='DRAFT',published_at=NULL`,
      [
        summaryId,
        appointment.id,
        appointment.patient_id,
        pharmacistId,
        summaryText,
        JSON.stringify(sourceSnapshot),
      ]
    );
    const [[summary]] = await conn.execute(
      'SELECT id FROM counseling_summaries WHERE appointment_id=?',
      [appointment.id]
    );
    const version = await nextSummaryVersion(conn, summary.id);
    await conn.execute(
      `INSERT INTO counseling_summary_revisions
         (id,summary_id,version,action,summary_text,actor_user_id)
       VALUES (?,?,?,?,?,?)`,
      [uuidv4(), summary.id, version, 'GENERATED', summaryText, pharmacistId]
    );
    await conn.execute(
      "UPDATE counseling_appointments SET status='COMPLETED',completed_at=NOW(3) WHERE id=?",
      [appointment.id]
    );
    await recordAudit({
      actor,
      action: 'COUNSELING_APPOINTMENT_COMPLETED',
      entityType: 'counseling_appointment',
      entityId: appointment.id,
      patientId: appointment.patient_id,
      metadata: { summary_id: summary.id, summary_status: 'DRAFT' },
      executor: conn,
    });
    await conn.commit();
    return {
      id: appointment.id,
      patient_id: appointment.patient_id,
      status: 'COMPLETED',
      summary_id: summary.id,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateCounselingSummary(pharmacistId, summaryId, text, actor) {
  const summaryText = String(text || '').trim();
  if (summaryText.length < 40 || summaryText.length > 10000) {
    return {
      error: {
        status: 400,
        message: 'Counseling summary must be between 40 and 10,000 characters.',
      },
    };
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[summary]] = await conn.execute(
      `SELECT * FROM counseling_summaries WHERE id=? AND pharmacist_id=? FOR UPDATE`,
      [summaryId, pharmacistId]
    );
    if (!summary) {
      await conn.rollback();
      return { error: { status: 404, message: 'Counseling summary not found.' } };
    }
    if (summary.status !== 'DRAFT') {
      await conn.rollback();
      return { error: { status: 409, message: 'Only draft summaries can be edited.' } };
    }
    await conn.execute('UPDATE counseling_summaries SET summary_text=? WHERE id=?', [
      summaryText,
      summaryId,
    ]);
    const version = await nextSummaryVersion(conn, summaryId);
    await conn.execute(
      `INSERT INTO counseling_summary_revisions
         (id,summary_id,version,action,summary_text,actor_user_id)
       VALUES (?,?,?,?,?,?)`,
      [uuidv4(), summaryId, version, 'EDITED', summaryText, pharmacistId]
    );
    await recordAudit({
      actor,
      action: 'COUNSELING_SUMMARY_EDITED',
      entityType: 'counseling_summary',
      entityId: summaryId,
      patientId: summary.patient_id,
      metadata: { version },
      executor: conn,
    });
    await conn.commit();
    return { id: summaryId, patient_id: summary.patient_id, status: 'DRAFT', version };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function publishCounselingSummary(pharmacistId, summaryId, credential, actor) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[summary]] = await conn.execute(
      `SELECT * FROM counseling_summaries WHERE id=? AND pharmacist_id=? FOR UPDATE`,
      [summaryId, pharmacistId]
    );
    if (!summary) {
      await conn.rollback();
      return { error: { status: 404, message: 'Counseling summary not found.' } };
    }
    if (summary.status !== 'DRAFT') {
      await conn.rollback();
      return { error: { status: 409, message: 'Only a draft summary can be published.' } };
    }
    const version = await nextSummaryVersion(conn, summaryId);
    await conn.execute(
      `UPDATE counseling_summaries SET status='PUBLISHED',published_at=NOW(3),
         reviewer_license_number=?,reviewer_license_jurisdiction=?,reviewer_license_expires_on=?
       WHERE id=?`,
      [
        credential.license_number,
        credential.license_jurisdiction,
        credential.license_expires_on,
        summaryId,
      ]
    );
    await conn.execute(
      `INSERT INTO counseling_summary_revisions
         (id,summary_id,version,action,summary_text,actor_user_id)
       VALUES (?,?,?,?,?,?)`,
      [uuidv4(), summaryId, version, 'PUBLISHED', summary.summary_text, pharmacistId]
    );
    await recordAudit({
      actor,
      action: 'COUNSELING_SUMMARY_PUBLISHED',
      entityType: 'counseling_summary',
      entityId: summaryId,
      patientId: summary.patient_id,
      metadata: {
        version,
        reviewer_license_number: credential.license_number,
        reviewer_license_jurisdiction: credential.license_jurisdiction,
      },
      executor: conn,
    });
    await conn.commit();
    return { id: summaryId, patient_id: summary.patient_id, status: 'PUBLISHED', version };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function cancelPatientAppointment(patientId, appointmentId, actor) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[appointment]] = await conn.execute(
      'SELECT * FROM counseling_appointments WHERE id=? AND patient_id=? FOR UPDATE',
      [appointmentId, patientId]
    );
    if (!appointment) {
      await conn.rollback();
      return { error: { status: 404, message: 'Appointment not found.' } };
    }
    if (!['REQUESTED', 'CONFIRMED'].includes(appointment.status)) {
      await conn.rollback();
      return { error: { status: 409, message: 'This appointment can no longer be cancelled.' } };
    }
    await conn.execute(
      "UPDATE counseling_appointments SET status='CANCELLED',cancelled_at=NOW(3) WHERE id=?",
      [appointmentId]
    );
    await recordAudit({
      actor,
      action: 'COUNSELING_APPOINTMENT_CANCELLED',
      entityType: 'counseling_appointment',
      entityId: appointmentId,
      patientId,
      executor: conn,
    });
    await conn.commit();
    return { id: appointmentId, status: 'CANCELLED', pharmacist_id: appointment.pharmacist_id };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
