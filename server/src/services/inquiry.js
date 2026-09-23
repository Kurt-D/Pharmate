/**
 * Ask Your Pharmacist (Sprint 8, UC objectives 5/10, D-I, B-8).
 *
 * Pseudonymous text inquiry: the queue shows patient_code, while text entered
 * by a patient may identify them. Completed threads and their messages are kept
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
import { getInquiryConsent, INQUIRY_CONSENT_REQUIRED } from './inquiryConsent.js';

/** A selected pharmacist or a pharmacist at the requested branch may claim it. */
async function eligiblePharmacist(thread, pharmacistId, executor) {
  if (thread.pharmacist_id) return thread.pharmacist_id === pharmacistId;
  if (thread.requested_pharmacist_id && thread.requested_pharmacist_id !== pharmacistId) {
    return false;
  }
  const [[pharmacist]] = await executor.execute('SELECT branch_id FROM pharmacists WHERE id=?', [
    pharmacistId,
  ]);
  return Boolean(pharmacist && (!thread.branch_id || pharmacist.branch_id === thread.branch_id));
}

/**
 * Open a thread. If `drugName` names a restricted substance, no thread is
 * created — the caller returns the branch-visit exception instead.
 */
export async function openThread(
  patientId,
  {
    subject = null,
    branchId = null,
    pharmacistId = null,
    drugName = null,
    medicationDraftKey = null,
    usePriorityToken = false,
  } = {}
) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const consent = await getInquiryConsent(patientId, conn, true);
    if (!consent.consented) {
      await conn.rollback();
      return INQUIRY_CONSENT_REQUIRED;
    }
    if (drugName) {
      const restricted = await findRestricted(drugName);
      if (restricted) {
        await conn.rollback();
        return { error: 'restricted', generic_name: restricted.generic_name };
      }
    }

    // This is transparent decision support, not automated diagnosis: verified
    // care need outranks a service token; equal tiers are FIFO in the queue.
    const [[patient]] = await conn.execute('SELECT priority_flag FROM patients WHERE id = ?', [
      patientId,
    ]);
    let priorityTier = patient?.priority_flag ? 'care' : 'standard';
    let priorityReason = patient?.priority_flag ? 'Verified care priority' : null;
    let priorityTokens = null;
    if (usePriorityToken && priorityTier === 'standard') {
      const [[streak]] = await conn.execute(
        'SELECT priority_tokens FROM patient_streaks WHERE patient_id=? FOR UPDATE',
        [patientId]
      );
      if (!streak || Number(streak.priority_tokens) < 1) {
        await conn.rollback();
        return { error: 'priority_token_unavailable' };
      }
      await conn.execute(
        'UPDATE patient_streaks SET priority_tokens=priority_tokens-1, updated_at=NOW(3) WHERE patient_id=?',
        [patientId]
      );
      priorityTier = 'token';
      priorityReason = 'Patient used one earned Priority Token';
      priorityTokens = Number(streak.priority_tokens) - 1;
    }
    const priority = priorityTier === 'standard' ? 'normal' : 'high';

    if (pharmacistId) {
      const [[pharmacist]] = await conn.execute(
        'SELECT id FROM pharmacists WHERE id=? AND (? IS NULL OR branch_id=?)',
        [pharmacistId, branchId, branchId]
      );
      if (!pharmacist) {
        await conn.rollback();
        return { error: 'pharmacist_not_found' };
      }
    }

    const id = uuidv4();
    await conn.execute(
      `INSERT INTO inquiry_threads
       (id, patient_id, branch_id, requested_pharmacist_id, status, priority, priority_tier, priority_reason, subject,
        medication_draft_key,consent_policy_version,consent_accepted_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        patientId,
        branchId,
        pharmacistId,
        priority, priorityTier, priorityReason,
        subject,
        medicationDraftKey,
        consent.policy_version,
        consent.accepted_at,
      ]
    );
    await conn.commit();
    return { thread_id: id, priority, priority_tier: priorityTier, priority_tokens: priorityTokens, validation_status: 'awaiting_pharmacist' };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function acceptInquiry(threadId, pharmacistId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[thread]] = await conn.execute(
      `SELECT id,status,branch_id,pharmacist_id,requested_pharmacist_id
       FROM inquiry_threads WHERE id=? FOR UPDATE`,
      [threadId]
    );
    if (!thread || thread.status !== 'open') {
      await conn.rollback();
      return { error: 'not_found' };
    }
    if (thread.requested_pharmacist_id && thread.requested_pharmacist_id !== pharmacistId) {
      await conn.rollback();
      return { error: 'not_requested' };
    }
    if (thread.pharmacist_id && thread.pharmacist_id !== pharmacistId) {
      await conn.rollback();
      return { error: 'claimed' };
    }
    if (!(await eligiblePharmacist(thread, pharmacistId, conn))) {
      await conn.rollback();
      return { error: 'not_found' };
    }
    if (!thread.pharmacist_id) {
      await conn.execute('UPDATE inquiry_threads SET pharmacist_id=? WHERE id=?', [
        pharmacistId,
        threadId,
      ]);
    }
    await conn.commit();
    return { validation_status: 'accepted', idempotent: Boolean(thread.pharmacist_id) };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/** Pharmacist-only escalation for an exceptional safety concern; never automated. */
export async function markInquiryUrgent(threadId, pharmacistId, reason) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[thread]] = await conn.execute(
      `SELECT id,patient_id,status,branch_id,pharmacist_id,requested_pharmacist_id
       FROM inquiry_threads WHERE id=? FOR UPDATE`,
      [threadId]
    );
    if (!thread || thread.status !== 'open' || !(await eligiblePharmacist(thread, pharmacistId, conn))) {
      await conn.rollback();
      return { error: 'not_found' };
    }
    await conn.execute(
      `UPDATE inquiry_threads
       SET priority='high',priority_tier='urgent',priority_reason=?,priority_set_by=?,priority_set_at=NOW(3)
       WHERE id=?`,
      [reason, pharmacistId, threadId]
    );
    await conn.commit();
    return { id: threadId, patient_id: thread.patient_id, priority: 'high', priority_tier: 'urgent', priority_reason: reason };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/** Append a message. Only the thread's patient (or the assigned pharmacist) may post. */
export async function postMessage(threadId, senderRole, senderId, message) {
  if (!['patient', 'pharmacist'].includes(senderRole)) return { error: 'not_found' };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[thread]] = await conn.execute(
      `SELECT patient_id, branch_id, pharmacist_id, requested_pharmacist_id, status, patient_completed_at, pharmacist_completed_at FROM inquiry_threads
       WHERE id = ? FOR UPDATE`,
      [threadId]
    );
    if (!thread || (senderRole === 'patient' && thread.patient_id !== senderId)) {
      await conn.rollback();
      return { error: 'not_found' };
    }
    if (senderRole === 'pharmacist') {
      if (!(await eligiblePharmacist(thread, senderId, conn))) {
        await conn.rollback();
        return { error: 'not_found' };
      }
      if (!thread.pharmacist_id) {
        await conn.execute('UPDATE inquiry_threads SET pharmacist_id=? WHERE id=?', [
          senderId,
          threadId,
        ]);
      }
    }
    if (thread.status !== 'open' || thread.patient_completed_at || thread.pharmacist_completed_at) {
      await conn.rollback();
      return { error: 'closed' };
    }
    if (!(await getInquiryConsent(thread.patient_id, conn, true)).consented) {
      await conn.rollback();
      return INQUIRY_CONSENT_REQUIRED;
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
  if (!['patient', 'pharmacist'].includes(viewerRole)) return { error: 'not_found' };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[thread]] = await conn.execute(
      `SELECT patient_id, branch_id, pharmacist_id, requested_pharmacist_id, status
       FROM inquiry_threads WHERE id = ? FOR UPDATE`,
      [threadId]
    );
    if (!thread || (viewerRole === 'patient' && thread.patient_id !== viewerId)) {
      await conn.rollback();
      return { error: 'not_found' };
    }
    if (viewerRole === 'pharmacist') {
      if (!(await eligiblePharmacist(thread, viewerId, conn))) {
        await conn.rollback();
        return { error: 'not_found' };
      }
      if (!thread.pharmacist_id) {
        if (thread.status !== 'open') {
          await conn.rollback();
          return { error: 'not_found' };
        }
        await conn.execute('UPDATE inquiry_threads SET pharmacist_id=? WHERE id=?', [
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
 * Complete a thread. Messages remain available as read-only consultation history.
 */
export async function closeThread(threadId, closerRole, closerId) {
  if (!['patient', 'pharmacist'].includes(closerRole)) return { error: 'not_found' };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[thread]] = await conn.execute(
      `SELECT patient_id, pharmacist_id, status, patient_completed_at, pharmacist_completed_at
       FROM inquiry_threads WHERE id = ? FOR UPDATE`,
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
    if (thread.status === 'closed') {
      await conn.commit();
      return { closed: true, idempotent: true };
    }
    const completionColumn = closerRole === 'patient' ? 'patient_completed_at' : 'pharmacist_completed_at';
    await conn.execute(`UPDATE inquiry_threads SET ${completionColumn} = COALESCE(${completionColumn}, NOW(3)) WHERE id = ?`, [threadId]);
    const patientCompleted = Boolean(thread.patient_completed_at) || closerRole === 'patient';
    const pharmacistCompleted = Boolean(thread.pharmacist_completed_at) || closerRole === 'pharmacist';
    const closed = patientCompleted && pharmacistCompleted;
    if (closed) {
      await conn.execute("UPDATE inquiry_threads SET status = 'closed', closed_at = NOW(3) WHERE id = ?", [threadId]);
    }
    await conn.commit();
    return {
      closed,
      awaiting: closed ? null : closerRole === 'patient' ? 'pharmacist' : 'patient',
      patient_completed_at: patientCompleted,
      pharmacist_completed_at: pharmacistCompleted,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** A patient's own threads. */
export async function patientThreads(patientId) {
  const [rows] = await pool.execute(
    `SELECT t.id,t.status,t.priority,t.priority_tier,t.subject,t.opened_at,t.closed_at,t.patient_completed_at,t.pharmacist_completed_at,
            t.branch_id,COALESCE(t.pharmacist_id,t.requested_pharmacist_id) AS pharmacist_id,
            CASE WHEN t.pharmacist_id IS NULL THEN 'awaiting_pharmacist' ELSE 'accepted' END AS validation_status,
            ph.full_name AS pharmacist_name
     FROM inquiry_threads t LEFT JOIN pharmacists ph ON ph.id=COALESCE(t.pharmacist_id,t.requested_pharmacist_id)
     WHERE t.patient_id = ? ORDER BY t.opened_at DESC`,
    [patientId]
  );
  return rows;
}

/** Open requests and the assigned pharmacist's completed consultation history. */
export async function pharmacistQueue(pharmacistId) {
  const [rows] = await pool.execute(
    `SELECT t.id, t.status, t.priority, t.priority_tier, t.priority_reason, t.subject, t.opened_at, t.closed_at, t.patient_completed_at, t.pharmacist_completed_at, p.patient_code,
            CASE WHEN t.pharmacist_id IS NULL THEN 'awaiting_validation' ELSE 'accepted' END AS validation_status,
            (SELECT COUNT(*) FROM inquiry_messages m WHERE m.thread_id = t.id) AS message_count
     FROM inquiry_threads t
     JOIN patients p ON p.id = t.patient_id
     JOIN pharmacists viewer ON viewer.id = ?
     WHERE (t.status = 'open' AND
              (t.pharmacist_id = ? OR
               (t.pharmacist_id IS NULL AND
                (t.requested_pharmacist_id IS NULL OR t.requested_pharmacist_id = ?)
                AND (t.branch_id IS NULL OR t.branch_id = viewer.branch_id))))
        OR (t.status = 'closed' AND t.pharmacist_id = ?)
     ORDER BY (t.status = 'open') DESC,
              FIELD(t.priority_tier, 'urgent', 'care', 'token', 'standard'),
              CASE WHEN t.status = 'open' THEN t.opened_at END ASC,
              t.closed_at DESC`,
    [pharmacistId, pharmacistId, pharmacistId, pharmacistId]
  );
  return rows;
}
