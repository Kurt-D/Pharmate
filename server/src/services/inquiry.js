/**
 * Ask Your Pharmacist (Sprint 8, UC objectives 5/10, D-I, B-8).
 *
 * Anonymous text inquiry: the pharmacist only ever sees patient_code. Transport
 * is polling (no realtime infra). The server holds a thread only while it is
 * open and PURGES the messages on close — the patient device keeps its own local
 * history. Priority is the patient's verified chronic-condition flag (boolean,
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
  { subject = null, branchId = null, drugName = null } = {}
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

  const id = uuidv4();
  await pool.execute(
    `INSERT INTO inquiry_threads (id, patient_id, branch_id, status, priority, subject)
     VALUES (?, ?, ?, 'open', ?, ?)`,
    [id, patientId, branchId, priority, subject]
  );
  return { thread_id: id, priority };
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
      if (thread.pharmacist_id && thread.pharmacist_id !== senderId) {
        await conn.rollback();
        return { error: 'not_found' };
      }
      if (!thread.pharmacist_id) {
        await conn.execute('UPDATE inquiry_threads SET pharmacist_id = ? WHERE id = ?', [
          senderId,
          threadId,
        ]);
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
      if (thread.pharmacist_id && thread.pharmacist_id !== viewerId) {
        await conn.rollback();
        return { error: 'not_found' };
      }
      if (!thread.pharmacist_id) {
        await conn.execute('UPDATE inquiry_threads SET pharmacist_id = ? WHERE id = ?', [
          viewerId,
          threadId,
        ]);
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
 * Close a thread and PURGE its server-side messages (D-I). The thread row stays
 * as a closed stub (patient_code-linked, no content); the patient device keeps
 * the conversation locally.
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
    await conn.execute('DELETE FROM inquiry_messages WHERE thread_id = ?', [threadId]);
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
    `SELECT id, status, priority, subject, opened_at, closed_at
     FROM inquiry_threads WHERE patient_id = ? ORDER BY opened_at DESC`,
    [patientId]
  );
  return rows;
}

/** The pharmacist queue — open threads by patient_code only, high priority first (B-8). */
export async function pharmacistQueue(pharmacistId) {
  const [rows] = await pool.execute(
    `SELECT t.id, t.priority, t.subject, t.opened_at, p.patient_code,
            (SELECT COUNT(*) FROM inquiry_messages m WHERE m.thread_id = t.id) AS message_count
     FROM inquiry_threads t
     JOIN patients p ON p.id = t.patient_id
     WHERE t.status = 'open' AND (t.pharmacist_id IS NULL OR t.pharmacist_id = ?)
     ORDER BY (t.priority = 'high') DESC, t.opened_at ASC`,
    [pharmacistId]
  );
  return rows;
}
