/**
 * Ask Your Pharmacist (Sprint 8, UC objectives 5/10, D-I, B-8).
 *
 * Anonymous text inquiry: the pharmacist only ever sees patient_code. Transport
 * is polling (no realtime infra). Completed threads and their messages are kept
 * as read-only consultation history for the patient and assigned pharmacist.
 * Priority is the patient's verified chronic-condition flag (boolean,
 * PART 2), never streak-based.
 *
 * Scope: pharmacy-level medication questions only. A restricted-substance
 * mention short-circuits to a branch-visit message (the pharmacist is never
 * asked to advise on it here).
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { findRestricted } from './formulary.js';

/**
 * Open a thread. If `drugName` names a restricted substance, no thread is
 * created — the caller returns the branch-visit exception instead.
 */
export async function openThread(
  patientId,
  { subject = null, branchId = null, pharmacistId = null, drugName = null } = {}
) {
  if (drugName) {
    const restricted = await findRestricted(drugName);
    if (restricted) return { error: 'restricted', generic_name: restricted.generic_name };
  }

  // Priority is the patient's verified chronic-condition flag (PART 2), a
  // boolean derived from prescription validation — never a severity tier.
  const [[patient]] = await pool.execute('SELECT priority_flag FROM patients WHERE id = ?', [
    patientId,
  ]);
  const priority = patient?.priority_flag ? 'high' : 'normal';

  if (pharmacistId) {
    const [[pharmacist]] = await pool.execute(
      'SELECT id FROM pharmacists WHERE id=? AND (? IS NULL OR branch_id=?)',
      [pharmacistId, branchId, branchId]
    );
    if (!pharmacist) return { error: 'pharmacist_not_found' };
  }

  const id = uuidv4();
  await pool.execute(
    `INSERT INTO inquiry_threads
       (id, patient_id, branch_id, requested_pharmacist_id, status, priority, subject)
     VALUES (?, ?, ?, ?, 'open', ?, ?)`,
    [id, patientId, branchId, pharmacistId, priority, subject]
  );
  return { thread_id: id, priority, validation_status: 'awaiting_pharmacist' };
}

export async function acceptInquiry(threadId, pharmacistId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[thread]] = await conn.execute(
      `SELECT id,status,pharmacist_id,requested_pharmacist_id
       FROM inquiry_threads WHERE id=? FOR UPDATE`, [threadId]
    );
    if (!thread || thread.status !== 'open') { await conn.rollback(); return { error: 'not_found' }; }
    if (thread.requested_pharmacist_id && thread.requested_pharmacist_id !== pharmacistId) {
      await conn.rollback(); return { error: 'not_requested' };
    }
    if (thread.pharmacist_id && thread.pharmacist_id !== pharmacistId) {
      await conn.rollback(); return { error: 'claimed' };
    }
    if (!thread.pharmacist_id) {
      await conn.execute('UPDATE inquiry_threads SET pharmacist_id=? WHERE id=?', [pharmacistId, threadId]);
    }
    await conn.commit();
    return { validation_status: 'accepted', idempotent: Boolean(thread.pharmacist_id) };
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}

/** Append a message. Only the thread's patient (or the assigned pharmacist) may post. */
export async function postMessage(threadId, senderRole, senderId, message) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[thread]] = await conn.execute(
      `SELECT patient_id, pharmacist_id, status FROM inquiry_threads
       WHERE id = ? FOR UPDATE`,
      [threadId]
    );
    if (!thread || (senderRole === 'patient' && thread.patient_id !== senderId)) {
      await conn.rollback();
      return { error: 'not_found' };
    }
    if (senderRole === 'pharmacist') {
      if (!thread.pharmacist_id || thread.pharmacist_id !== senderId) {
        await conn.rollback();
        return { error: 'not_accepted' };
      }
    }
    if (thread.status !== 'open') {
      await conn.rollback();
      return { error: 'closed' };
    }

    const id = uuidv4();
    await conn.execute(
      `INSERT INTO inquiry_messages (id, thread_id, sender_role, message) VALUES (?, ?, ?, ?)`,
      [id, threadId, senderRole, message]
    );
    await conn.commit();
    return { message_id: id };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Poll a thread's messages (patient or assigned pharmacist). */
export async function getMessages(threadId, viewerRole, viewerId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[thread]] = await conn.execute(
      `SELECT patient_id, pharmacist_id FROM inquiry_threads WHERE id = ? FOR UPDATE`,
      [threadId]
    );
    if (!thread || (viewerRole === 'patient' && thread.patient_id !== viewerId)) {
      await conn.rollback();
      return { error: 'not_found' };
    }
    if (viewerRole === 'pharmacist') {
      if (!thread.pharmacist_id || thread.pharmacist_id !== viewerId) {
        await conn.rollback();
        return { error: 'not_accepted' };
      }
    }
    const [rows] = await conn.execute(
      `SELECT id, sender_role, message, sent_at FROM inquiry_messages
       WHERE thread_id = ? ORDER BY sent_at ASC`,
      [threadId]
    );
    await conn.commit();
    return { messages: rows };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Complete a thread. Messages remain available as read-only consultation history.
 */
export async function closeThread(threadId, closerRole, closerId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[thread]] = await conn.execute(
      `SELECT patient_id, pharmacist_id FROM inquiry_threads WHERE id = ? FOR UPDATE`,
      [threadId]
    );
    const ownsThread =
      thread &&
      (closerRole === 'patient'
        ? thread.patient_id === closerId
        : thread.pharmacist_id === closerId);
    if (!ownsThread) {
      await conn.rollback();
      return { error: 'not_found' };
    }
    await conn.execute(
      "UPDATE inquiry_threads SET status = 'closed', closed_at = NOW(3) WHERE id = ?",
      [threadId]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { closed: true };
}

/** A patient's own threads. */
export async function patientThreads(patientId) {
  const [rows] = await pool.execute(
    `SELECT t.id,t.status,t.priority,t.subject,t.opened_at,t.closed_at,
            t.branch_id,t.pharmacist_id,
            CASE WHEN t.pharmacist_id IS NULL THEN 'awaiting_pharmacist' ELSE 'accepted' END AS validation_status,
            ph.full_name AS pharmacist_name
     FROM inquiry_threads t LEFT JOIN pharmacists ph ON ph.id=t.pharmacist_id
     WHERE t.patient_id = ? ORDER BY t.opened_at DESC`,
    [patientId]
  );
  return rows;
}

/** Open requests and the assigned pharmacist's completed consultation history. */
export async function pharmacistQueue(pharmacistId) {
  const [rows] = await pool.execute(
    `SELECT t.id, t.status, t.priority, t.subject, t.opened_at, t.closed_at, p.patient_code,
            CASE WHEN t.pharmacist_id IS NULL THEN 'awaiting_validation' ELSE 'accepted' END AS validation_status,
            (SELECT COUNT(*) FROM inquiry_messages m WHERE m.thread_id = t.id) AS message_count
     FROM inquiry_threads t
     JOIN patients p ON p.id = t.patient_id
     WHERE (t.status = 'open' AND
              (t.pharmacist_id = ? OR
               (t.pharmacist_id IS NULL AND
                (t.requested_pharmacist_id IS NULL OR t.requested_pharmacist_id = ?))))
        OR (t.status = 'closed' AND t.pharmacist_id = ?)
     ORDER BY (t.status = 'open') DESC, (t.priority = 'high') DESC,
              CASE WHEN t.status = 'open' THEN t.opened_at END ASC,
              t.closed_at DESC`,
    [pharmacistId, pharmacistId, pharmacistId]
  );
  return rows;
}
