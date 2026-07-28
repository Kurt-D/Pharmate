/**
 * Schedule service — the I/O boundary around the pure engine. (ENG §2, §5, §6)
 *
 * The engine (`engine/index.js`) is pure and knows nothing about the database.
 * This module does the fetching: loads the patient's anchors, active medications
 * (joined to their curated drug_reference rows), and the relevant interaction
 * pairs; calls the engine; and converts the engine's minute-of-day output into
 * absolute wall-clock datetimes for the Asia/Manila deployment (ENG §2).
 *
 *   proposeForPatient(id)  → generate a proposal (no writes) — UC-03 step 4
 *   confirmForPatient(id)  → persist the proposal as the confirmed plan — steps 5–6
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { generateSchedule } from '../../engine/index.js';

/** Today's calendar date in Asia/Manila (UTC+8, no DST). */
function manilaToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 'HH:MM:SS' TIME column → 'HH:MM' for the engine. */
function toClock(t) {
  return String(t).slice(0, 5);
}

/**
 * Convert a generation date + minute-of-day (may exceed 1440 for cross-midnight
 * doses) into a MySQL wall-clock string 'YYYY-MM-DD HH:MM:SS'. We do the calendar
 * arithmetic in UTC purely as a clock — no timezone shift — so the stored value
 * is the Manila local time the dose is due (the pool is pinned to +08:00).
 */
function wallClock(generationDate, minuteOfDay) {
  const dt = new Date(new Date(`${generationDate}T00:00:00Z`).getTime() + minuteOfDay * 60000);
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())} ` +
    `${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}:00`
  );
}

/** Load anchors, active meds, and interaction pairs into the engine input shape. */
export async function loadEngineInput(patientId) {
  const [anchorRows] = await pool.execute(
    `SELECT wake_anchor, sleep_anchor, breakfast_anchor, lunch_anchor, dinner_anchor
     FROM patient_anchors WHERE patient_id = ?`,
    [patientId]
  );
  const a = anchorRows[0] ?? {};
  const anchors = {
    wake: toClock(a.wake_anchor ?? '08:00:00'),
    sleep: toClock(a.sleep_anchor ?? '22:00:00'),
    breakfast: toClock(a.breakfast_anchor ?? '07:30:00'),
    lunch: toClock(a.lunch_anchor ?? '12:00:00'),
    dinner: toClock(a.dinner_anchor ?? '19:00:00'),
  };

  const [meds] = await pool.execute(
    `SELECT m.id, m.drug_id, m.drug_name_raw, m.frequency_code, m.is_prn,
            dr.min_interval_hours, dr.max_daily_doses
     FROM medications m
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     WHERE m.patient_id = ? AND m.status = 'active'`,
    [patientId]
  );

  const medications = meds.map((m) => ({
    id: m.id,
    drugId: m.drug_id,
    drugName: m.drug_name_raw,
    frequencyCode: m.frequency_code,
    isPrn: !!m.is_prn,
    minIntervalHours: m.min_interval_hours != null ? Number(m.min_interval_hours) : null,
    maxDailyDoses: m.max_daily_doses != null ? Number(m.max_daily_doses) : null,
  }));

  const drugIds = [...new Set(meds.map((m) => m.drug_id).filter(Boolean))];
  let interactions = [];
  if (drugIds.length > 0) {
    const ph = drugIds.map(() => '?').join(',');
    const [pairs] = await pool.execute(
      `SELECT drug_a_id, drug_b_id, min_gap_hours, interaction_type
       FROM drug_interactions
       WHERE drug_a_id IN (${ph}) AND drug_b_id IN (${ph})`,
      [...drugIds, ...drugIds]
    );
    interactions = pairs.map((p) => ({
      drugAId: p.drug_a_id,
      drugBId: p.drug_b_id,
      minGapHours: p.min_gap_hours != null ? Number(p.min_gap_hours) : null,
      type: p.interaction_type,
    }));
  }

  return { anchors, medications, interactions };
}

/** Generate a proposal for review — pure engine output + wall-clock times. No writes. */
export async function proposeForPatient(patientId) {
  const input = await loadEngineInput(patientId);
  const generationDate = manilaToday();
  const result = generateSchedule({ ...input, version: 1 });

  const slots = result.slots.map((s) => ({
    medication_id: s.medicationId,
    drug_id: s.drugId,
    drug_name: s.drugName,
    time: s.time,
    day_offset: s.dayOffset,
    scheduled_time: wallClock(generationDate, s.minuteOfDay),
    generated_reason: s.reason,
  }));

  return {
    generation_date: generationDate,
    slots,
    prn: result.prn.map((p) => ({
      medication_id: p.medicationId,
      drug_name: p.drugName,
      reason: p.reason,
    })),
    unresolved: result.unresolved.map((u) => ({
      medication_id: u.medicationId,
      drug_name: u.drugName,
      reason: u.reason,
      conflict_with: u.conflictWith ?? null,
    })),
  };
}

/**
 * Persist the current proposal as the patient's confirmed plan (UC-03 steps 5–6).
 * Replaces prior still-scheduled (not-yet-taken) doses; taken/missed rows are
 * immutable. Bumps schedule_version so dose logs can reference the version that
 * fired them (ENG §9).
 */
export async function confirmForPatient(patientId) {
  const proposal = await proposeForPatient(patientId);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[v]] = await conn.execute(
      `SELECT COALESCE(MAX(schedule_version), 0) + 1 AS next
       FROM medication_schedules WHERE patient_id = ?`,
      [patientId]
    );
    const version = v.next;

    // Future, not-yet-acted doses are replaced; taken/missed stay as the record.
    await conn.execute(
      `DELETE FROM medication_schedules WHERE patient_id = ? AND status = 'scheduled'`,
      [patientId]
    );

    for (const s of proposal.slots) {
      await conn.execute(
        `INSERT INTO medication_schedules
           (id, medication_id, patient_id, scheduled_time, generated_reason,
            is_confirmed, is_prn_slot, schedule_version, status)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?, 'scheduled')`,
        [uuidv4(), s.medication_id, patientId, s.scheduled_time, s.generated_reason, version]
      );
    }

    await conn.commit();
    return { version, count: proposal.slots.length, generation_date: proposal.generation_date };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
