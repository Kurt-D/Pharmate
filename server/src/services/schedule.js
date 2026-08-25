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
import { createPatientNotification } from './patientNotifications.js';
import { generateSchedule } from '../../engine/index.js';
import { buildInteractionMap, checkDose } from '../../engine/constraints.js';

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

/**
 * Generate a provisional schedule for one prescription medicine while still
 * considering the patient's active medicines and interaction rules. Nothing is
 * persisted or exposed as a real dose until a pharmacist approves this draft.
 */
export async function proposeForPrescription(patientId, medicationId) {
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
     FROM medications m LEFT JOIN drug_reference dr ON dr.id=m.drug_id
     WHERE m.patient_id=? AND (m.status='active' OR m.id=?)`,
    [patientId, medicationId]
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
  if (drugIds.length) {
    const placeholders = drugIds.map(() => '?').join(',');
    const [pairs] = await pool.execute(
      `SELECT drug_a_id, drug_b_id, min_gap_hours, interaction_type
       FROM drug_interactions WHERE drug_a_id IN (${placeholders}) AND drug_b_id IN (${placeholders})`,
      [...drugIds, ...drugIds]
    );
    interactions = pairs.map((p) => ({
      drugAId: p.drug_a_id,
      drugBId: p.drug_b_id,
      minGapHours: p.min_gap_hours != null ? Number(p.min_gap_hours) : null,
      type: p.interaction_type,
    }));
  }
  const generationDate = manilaToday();
  const result = generateSchedule({ anchors, medications, interactions, version: 1 });
  return {
    generation_date: generationDate,
    slots: result.slots
      .filter((slot) => slot.medicationId === medicationId)
      .map((slot) => ({
        medication_id: slot.medicationId,
        drug_name: slot.drugName,
        scheduled_time: wallClock(generationDate, slot.minuteOfDay),
        generated_reason: slot.reason,
      })),
    unresolved: result.unresolved.filter((item) => item.medicationId === medicationId),
  };
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

/** medication_id → {drugId, drugName, minIntervalHours} + the interaction map. */
async function loadLookup(patientId) {
  const { medications, interactions } = await loadEngineInput(patientId);
  return {
    byId: new Map(medications.map((m) => [m.id, m])),
    interactionMap: buildInteractionMap(interactions),
  };
}

/**
 * Live re-validation of a single dragged dose against the rest of the layout
 * (ENG §6 / D-E). The moved dose is identified by its array index (doses of the
 * same medication share a medication_id, so index — not id — is the identity).
 * Curated gap data stays server-side; the client only learns whether the move is
 * safe and, if not, which pair/gap blocked it.
 *
 * @param {string}   patientId
 * @param {Object[]} doses  full layout [{medication_id, minute}] with the move applied
 * @param {number}   index  position of the dose being validated
 */
export async function validateMove(patientId, doses, index) {
  if (!Array.isArray(doses) || index < 0 || index >= doses.length) {
    return { ok: false, error: 'bad_index' };
  }
  const { byId, interactionMap } = await loadLookup(patientId);
  const moved = doses[index];
  const m = byId.get(moved.medication_id);
  if (!m) return { ok: false, error: 'unknown_medication' };

  const placed = doses
    .filter((_, i) => i !== index)
    .map((o) => {
      const om = byId.get(o.medication_id);
      return {
        minuteOfDay: o.minute,
        drugId: om?.drugId,
        medId: o.medication_id,
        drugName: om?.drugName,
      };
    });

  const minIntervalMin = m.minIntervalHours ? Math.round(m.minIntervalHours * 60) : 0;
  const res = checkDose(
    { time: moved.minute, drugId: m.drugId, medId: moved.medication_id, minIntervalMin },
    placed,
    interactionMap
  );
  if (res.ok) return { ok: true };
  return {
    ok: false,
    violation: { drug: res.otherDrug, min_gap_hours: res.minGapHours ?? null, kind: res.kind },
  };
}

/**
 * Persist the confirmed plan (UC-03 steps 5–6). If the patient adjusted doses on
 * the Review & Confirm screen, `adjusted` carries the final layout — every dose
 * is re-validated server-side before it is written (defense-in-depth: a bad drop
 * can never be persisted even if the client checks were bypassed). With no
 * adjustments, the fresh engine proposal is persisted as-is.
 *
 * Replaces prior still-scheduled (not-yet-taken) doses; taken/missed rows are
 * immutable. Bumps schedule_version so dose logs can reference their version.
 */
export async function confirmForPatient(patientId, adjusted) {
  let slots;
  let generationDate;

  if (Array.isArray(adjusted) && adjusted.length > 0) {
    const { byId, interactionMap } = await loadLookup(patientId);
    for (const dose of adjusted) {
      const m = byId.get(dose.medication_id);
      if (!m) return { error: 'unknown_medication' };
      const placed = adjusted
        .filter((o) => o !== dose)
        .map((o) => {
          const om = byId.get(o.medication_id);
          return {
            minuteOfDay: o.minute,
            drugId: om?.drugId,
            medId: o.medication_id,
            drugName: om?.drugName,
          };
        });
      const minIntervalMin = m.minIntervalHours ? Math.round(m.minIntervalHours * 60) : 0;
      const res = checkDose(
        { time: dose.minute, drugId: m.drugId, medId: dose.medication_id, minIntervalMin },
        placed,
        interactionMap
      );
      if (!res.ok) {
        return {
          error: 'invalid_layout',
          violation: { drug: res.otherDrug, min_gap_hours: res.minGapHours ?? null },
        };
      }
    }
    generationDate = manilaToday();
    slots = adjusted.map((d) => ({
      medication_id: d.medication_id,
      scheduled_time: wallClock(generationDate, d.minute),
      generated_reason: d.generated_reason || 'patient-adjusted',
    }));
  } else {
    const proposal = await proposeForPatient(patientId);
    generationDate = proposal.generation_date;
    slots = proposal.slots;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[v]] = await conn.execute(
      `SELECT COALESCE(MAX(schedule_version), 0) + 1 AS next
       FROM medication_schedules WHERE patient_id = ?`,
      [patientId]
    );
    // MySQL/MariaDB may return aggregate values as strings. Keep the public
    // API stable and numeric so clients can compare schedule versions safely.
    const version = Number(v.next);

    // Future, not-yet-acted doses are replaced; taken/missed stay as the record.
    await conn.execute(
      `DELETE FROM medication_schedules WHERE patient_id = ? AND status = 'scheduled'`,
      [patientId]
    );

    for (const s of slots) {
      await conn.execute(
        `INSERT INTO medication_schedules
           (id, medication_id, patient_id, scheduled_time, generated_reason,
            is_confirmed, is_prn_slot, schedule_version, status)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?, 'scheduled')`,
        [uuidv4(), s.medication_id, patientId, s.scheduled_time, s.generated_reason, version]
      );
    }

    const notificationType = Number(version) === 1 ? 'schedule_confirmed' : 'schedule_changed';
    await createPatientNotification({
      patientId,
      type: notificationType,
      eventKey: `schedule:${patientId}:version:${version}`,
      metadata: { schedule_version: Number(version) },
      executor: conn,
    });

    await conn.commit();
    return { version, count: slots.length, generation_date: generationDate };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
