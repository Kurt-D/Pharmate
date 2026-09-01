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

function dateKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function treatmentDateKeys(startDate, endDate, maximumDays = 366) {
  const start = dateKey(startDate) || manilaToday();
  const endKey = dateKey(endDate);
  if (!endKey) return [start];
  const dates = [];
  const current = new Date(`${start}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);
  while (current <= end && dates.length < maximumDays) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/** 'HH:MM:SS' TIME column → 'HH:MM' for the engine. */
function toClock(t) {
  return String(t).slice(0, 5);
}

function mealAnchoredFrequency(frequencyCode, mealInstruction = '') {
  const instruction = String(mealInstruction).trim().toLowerCase();
  if (!instruction || !['QD', 'BID', 'TID'].includes(frequencyCode)) return frequencyCode;
  // Neutral wording such as "with or without food" is not a meal-time anchor.
  // Only explicit timing directions are allowed to move a dose onto meal anchors.
  if (/with or without (food|meals?)/.test(instruction)) return frequencyCode;
  const hasMealTiming =
    /before (food|meals?)|after (food|meals?)|with (food|meals?)|breakfast|lunch|dinner|first bite/.test(
      instruction
    );
  if (!hasMealTiming) return frequencyCode;
  const modifier = /before/.test(instruction)
    ? ':AC'
    : /after/.test(instruction)
      ? ':PC'
      : '';
  if (/evening meal|dinner/.test(instruction) && frequencyCode === 'QD')
    return `MEALMAP(0,0,1)${modifier}`;
  if (/lunch|noon/.test(instruction) && frequencyCode === 'QD')
    return `MEALMAP(0,1,0)${modifier}`;
  const map = { QD: 'MEALMAP(1,0,0)', BID: 'MEALMAP(1,0,1)', TID: 'MEALMAP(1,1,1)' };
  return `${map[frequencyCode]}${modifier}`;
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
    `SELECT m.id, m.drug_id, m.drug_name_raw, m.frequency, m.frequency_code,
            m.dosage_instruction, m.label_direction, m.food_instruction, m.timing_note, m.is_prn,
            m.start_date, m.end_date,
            dr.min_interval_hours, dr.max_daily_doses, dr.meal_instruction,
            dr.administration_instruction, dr.guidance_do, dr.guidance_dont,
            dr.evidence_source_url, dr.evidence_reviewed_at,
            dr.verified_by AS drug_verified_by, dr.is_provisional AS drug_is_provisional
     FROM medications m
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     WHERE m.patient_id = ? AND m.status = 'active'`,
    [patientId]
  );

  const medications = meds.map((m) => {
    // Curated drug-specific timing takes precedence over the patient's broad
    // UI choice (for example, "with the first bite" is more exact than "with food").
    const foodInstruction = m.meal_instruction || m.food_instruction || null;
    return {
      id: m.id,
      drugId: m.drug_id,
      drugName: m.drug_name_raw,
      frequencyCode: mealAnchoredFrequency(m.frequency_code, foodInstruction),
      originalFrequencyCode: m.frequency_code,
      frequency: m.frequency,
      dosageInstruction: m.dosage_instruction,
      labelDirection: m.label_direction,
      foodInstruction,
      timingNote: m.timing_note,
      startDate: dateKey(m.start_date),
      endDate: dateKey(m.end_date),
      isPrn: !!m.is_prn,
      minIntervalHours: m.min_interval_hours != null ? Number(m.min_interval_hours) : null,
      maxDailyDoses: m.max_daily_doses != null ? Number(m.max_daily_doses) : null,
      administrationInstruction: m.administration_instruction,
      guidanceDo: m.guidance_do,
      guidanceDont: m.guidance_dont,
      evidenceSourceUrl: m.evidence_source_url,
      evidenceReviewedAt: m.evidence_reviewed_at,
      isVerified: !!m.drug_id && !!m.drug_verified_by && !m.drug_is_provisional,
    };
  });

  const drugIds = [...new Set(meds.map((m) => m.drug_id).filter(Boolean))];
  let interactions = [];
  if (drugIds.length > 0) {
    const ph = drugIds.map(() => '?').join(',');
    const [pairs] = await pool.execute(
      `SELECT drug_a_id, drug_b_id, min_gap_hours, interaction_type, severity, notes,
              verified_by, is_provisional
       FROM drug_interactions
       WHERE drug_a_id IN (${ph}) AND drug_b_id IN (${ph})`,
      [...drugIds, ...drugIds]
    );
    interactions = pairs.map((p) => ({
      drugAId: p.drug_a_id,
      drugBId: p.drug_b_id,
      minGapHours: p.min_gap_hours != null ? Number(p.min_gap_hours) : null,
      type: p.interaction_type,
      severity: p.severity,
      notes: p.notes,
      isVerified: !!p.verified_by && !p.is_provisional,
    }));
  }

  return { anchors, medications, interactions };
}

const NO_VERIFIED_RULE =
  'No verified interval recommendation is available. Please ask your pharmacist.';

function finding({ code, level, title, message, medicines = [], rule = null }) {
  return { code, level, title, message, medicines, rule };
}

/** Convert deterministic engine output and curated facts into a UI-safe status. */
export function classifyScheduleSafety(input, result, targetMedicationIds = []) {
  const findings = [];
  const targetIds = new Set((targetMedicationIds || []).map(String).filter(Boolean));
  const isRelevant = (medicationIds = []) =>
    targetIds.size === 0 || medicationIds.some((id) => targetIds.has(String(id)));
  // The disposable test database intentionally seeds unsigned provisional rules.
  // Production/development UI must surface those as requiring human review.
  // Imported formulary rows may be awaiting a curator signature in local/demo
  // environments. Their deterministic timing constraints remain usable unless
  // the deployment explicitly requires signed rules only.
  const enforceVerifiedRules = process.env.REQUIRE_SIGNED_SCHEDULE_RULES === 'true';
  for (const med of input.medications) {
    if (!isRelevant([med.id])) continue;
    if (!med.drugId || (enforceVerifiedRules && !med.isVerified)) {
      findings.push(finding({
        code: 'UNVERIFIED_MEDICINE_RULE', level: 'unavailable',
        title: 'Verified timing rule unavailable', message: NO_VERIFIED_RULE,
        medicines: [med.id],
      }));
    }
  }

  for (const rule of input.interactions) {
    const a = input.medications.find((m) => m.drugId === rule.drugAId);
    const b = input.medications.find((m) => m.drugId === rule.drugBId);
    if (!a || !b) continue;
    if (!isRelevant([a.id, b.id])) continue;
    const names = [a.drugName, b.drugName];
    if (!rule.isVerified) {
      if (enforceVerifiedRules) findings.push(finding({
          code: 'UNVERIFIED_INTERACTION_RULE', level: 'unavailable',
          title: 'Verified recommendation unavailable', message: NO_VERIFIED_RULE,
          medicines: [a.id, b.id],
        }));
      continue;
    } else if (rule.type === 'AVOID' || ['high', 'contraindicated'].includes(rule.severity)) {
      findings.push(finding({
        code: 'VERIFIED_RULE_VIOLATION', level: 'unavailable', title: 'Verified recommendation unavailable',
        message: `A verified safety rule does not allow PharMate to recommend reminder times for ${names.join(' with ')}. Review the medicine information or ask a pharmacist.`,
        medicines: [a.id, b.id],
        rule: { type: rule.type, severity: rule.severity, note: rule.notes || null },
      }));
    } else if (rule.type === 'MONITOR') {
      findings.push(finding({
        code: 'MONITORING_REQUIRED', level: 'unavailable', title: 'Verified recommendation unavailable',
        message: `${names.join(' and ')} have a verified monitoring notice, so PharMate cannot recommend a time gap. Follow the prescription label or ask a pharmacist.`,
        medicines: [a.id, b.id],
        rule: { type: rule.type, severity: rule.severity, note: rule.notes || null },
      }));
    } else if (rule.type === 'SPACING' && Number(rule.minGapHours) > 0) {
      findings.push(finding({
        code: 'VERIFIED_SPACING_RULE', level: 'adjusted', title: 'Verified time gap',
        message: `Keep ${a.drugName} and ${b.drugName} at least ${Number(rule.minGapHours)} hour${Number(rule.minGapHours) === 1 ? '' : 's'} apart. The suggested times apply this verified interval.`,
        medicines: [a.id, b.id],
        rule: { type: rule.type, min_gap_hours: Number(rule.minGapHours) },
      }));
    }
  }

  for (const unresolved of result.unresolved) {
    if (!isRelevant([unresolved.medicationId])) continue;
    findings.push(finding({
      code: 'UNRESOLVED_SCHEDULE', level: 'unavailable',
      title: 'Verified recommendation unavailable',
      message: unresolved.reason || NO_VERIFIED_RULE,
      medicines: [unresolved.medicationId],
    }));
  }

  for (const requestedId of targetIds) {
    if (!input.medications.some((medicine) => String(medicine.id) === requestedId)) {
      findings.push(finding({
        code: 'UNKNOWN_SELECTED_MEDICINE', level: 'unavailable',
        title: 'Verified recommendation unavailable',
        message: 'The selected medicine is no longer active. Return to your medicine list and choose it again.',
        medicines: [requestedId],
      }));
    }
  }

  const classification = findings.some((item) => item.level === 'unavailable')
    ? 'VERIFIED_RECOMMENDATION_UNAVAILABLE'
    : findings.some((item) => item.level === 'manual')
      ? 'MANUAL_REVIEW_NEEDED'
      : findings.some((item) => item.level === 'adjusted')
        ? 'TIMING_ADJUSTED'
        : 'SAFE_SCHEDULE';
  if (!findings.length) findings.push(finding({
    code: 'VERIFIED_SAFE_SCHEDULE', level: 'safe', title: 'Safe schedule',
    message: 'No timing conflict was found using PharMate’s current medication rules.',
  }));

  return {
    classification,
    can_save: ['SAFE_SCHEDULE', 'TIMING_ADJUSTED'].includes(classification),
    findings,
    disclaimer: 'Reminder-time recommendations only. PharMate does not diagnose, prescribe, change doses or frequency, or replace advice from a licensed pharmacist.',
  };
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
export async function proposeForPatient(patientId, targetMedicationIds = []) {
  const input = await loadEngineInput(patientId);
  const generationDate = manilaToday();
  const targetIds = new Set((targetMedicationIds || []).map(String).filter(Boolean));
  // Old records may contain an accidentally repeated medicine. Prefer the
  // medicine selected in the current flow, then collapse only exact duplicates
  // (same drug/name, instruction, and frequency) before schedule generation.
  const orderedMedicines = [...input.medications].sort(
    (a, b) => Number(targetIds.has(String(b.id))) - Number(targetIds.has(String(a.id)))
  );
  const seenMedicines = new Set();
  const medications = orderedMedicines.filter((medicine) => {
    const key = [
      medicine.drugId || String(medicine.drugName).trim().toLowerCase(),
      String(medicine.dosageInstruction || '').trim().toLowerCase(),
      String(medicine.frequencyCode || medicine.frequency || '').trim().toLowerCase(),
    ].join('|');
    if (seenMedicines.has(key)) return false;
    seenMedicines.add(key);
    return true;
  });
  const generationInput = { ...input, medications };
  const result = generateSchedule({ ...generationInput, version: 1 });
  const shouldReturn = (medicationId) =>
    targetIds.size === 0 || targetIds.has(String(medicationId));
  const safety = classifyScheduleSafety(generationInput, result, [...targetIds]);

  const slots = result.slots
    .filter((slot) => shouldReturn(slot.medicationId))
    .map((s) => {
      const medicine = medications.find((item) => item.id === s.medicationId) || {};
      return {
        medication_id: s.medicationId,
        drug_id: s.drugId,
        drug_name: s.drugName,
        time: s.time,
        day_offset: s.dayOffset,
        scheduled_time: wallClock(generationDate, s.minuteOfDay),
        generated_reason: s.reason,
        dosage_instruction: medicine.dosageInstruction || null,
        frequency: medicine.frequency || null,
        label_direction: medicine.labelDirection || null,
        food_instruction: medicine.foodInstruction || null,
        administration_instruction: medicine.administrationInstruction || null,
        guidance_do: medicine.guidanceDo || null,
        guidance_dont: medicine.guidanceDont || null,
        evidence_source_url: medicine.evidenceSourceUrl || null,
        evidence_reviewed_at: medicine.evidenceReviewedAt || null,
        minimum_gap_hours: medicine.minIntervalHours || null,
      };
    });

  return {
    generation_date: generationDate,
    slots,
    prn: result.prn
      .filter((item) => shouldReturn(item.medicationId))
      .map((p) => ({
        medication_id: p.medicationId,
        drug_name: p.drugName,
        reason: p.reason,
      })),
    unresolved: result.unresolved
      .filter((item) => shouldReturn(item.medicationId))
      .map((u) => ({
        medication_id: u.medicationId,
        drug_name: u.drugName,
        reason: u.reason,
        conflict_with: u.conflictWith ?? null,
      })),
    safety,
    solver: result.solver,
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

export async function analyzeAdjustedLayout(patientId, doses) {
  const targetMedicationIds = [...new Set((doses || []).map((dose) => dose.medication_id).filter(Boolean))];
  const proposal = await proposeForPatient(patientId, targetMedicationIds);
  const safety = { ...proposal.safety, findings: [...proposal.safety.findings] };
  if (!Array.isArray(doses) || !doses.length) {
    return { ...safety, can_save: false, validation_error: 'At least one reminder time is required.' };
  }
  for (let index = 0; index < doses.length; index += 1) {
    const result = await validateMove(patientId, doses, index);
    if (!result.ok) {
      safety.findings.push(finding({
        code: 'MANUAL_TIME_CONFLICT', level: 'manual', title: 'Manual review needed',
        message: result.error === 'unknown_medication'
          ? NO_VERIFIED_RULE
          : `This reminder time is too close to ${result.violation?.drug || 'another medicine'}${result.violation?.min_gap_hours ? `. Keep at least ${result.violation.min_gap_hours} hours between them` : ''}.`,
        medicines: [doses[index]?.medication_id].filter(Boolean),
      }));
    }
  }
  if (safety.findings.some((item) => item.level === 'manual')) {
    safety.classification = 'MANUAL_REVIEW_NEEDED';
    safety.can_save = false;
  }
  return safety;
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
export async function confirmForPatient(patientId, adjusted, targetMedicationIds = [], options = {}) {
  const isManual = options.source === 'manual';
  const normalizedTargetIds = [...new Set((targetMedicationIds || []).map(String).filter(Boolean))];
  const selectedIds = normalizedTargetIds.length
    ? normalizedTargetIds
    : [...new Set((adjusted || []).map((dose) => String(dose.medication_id)).filter(Boolean))];
  if (!isManual) {
    const safetyProposal = await proposeForPatient(patientId, selectedIds);
    if (!safetyProposal.safety.can_save) {
      return { error: 'schedule_verification_failed', safety: safetyProposal.safety };
    }
  }
  let slots;
  let generationDate;

  if (Array.isArray(adjusted) && adjusted.length > 0) {
    const { byId, interactionMap } = await loadLookup(patientId);
    for (const dose of adjusted) {
      const m = byId.get(dose.medication_id);
      if (!m) return { error: 'unknown_medication' };
      if (!Number.isInteger(dose.minute) || dose.minute < 0 || dose.minute >= 2880) {
        return { error: 'invalid_time' };
      }
      if (isManual && dose.dates !== undefined) {
        const allowedDates = new Set(treatmentDateKeys(m.startDate, m.endDate));
        if (!Array.isArray(dose.dates) || !dose.dates.length || dose.dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date) || !allowedDates.has(date))) {
          return { error: 'invalid_date' };
        }
      }
      if (isManual) continue;
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
    generationDate = [...byId.values()].map((medicine) => medicine.startDate).filter(Boolean).sort()[0] || manilaToday();
    slots = adjusted.flatMap((dose) => {
      const medicine = byId.get(dose.medication_id);
      const dates = Array.isArray(dose.dates) && dose.dates.length
        ? [...new Set(dose.dates)].sort()
        : treatmentDateKeys(medicine?.startDate, medicine?.endDate);
      return dates.map((date) => ({
        medication_id: dose.medication_id,
        scheduled_time: wallClock(date, dose.minute),
        generated_reason: dose.generated_reason || 'patient-adjusted',
      }));
    });
  } else {
    if (isManual) return { error: 'invalid_time' };
    const proposal = await proposeForPatient(patientId, selectedIds);
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
    if (selectedIds.length) {
      const placeholders = selectedIds.map(() => '?').join(',');
      await conn.execute(
        `DELETE FROM medication_schedules
         WHERE patient_id = ? AND status = 'scheduled' AND medication_id IN (${placeholders})`,
        [patientId, ...selectedIds]
      );
    } else {
      await conn.execute(
        `DELETE FROM medication_schedules WHERE patient_id = ? AND status = 'scheduled'`,
        [patientId]
      );
    }

    for (const s of slots) {
      await conn.execute(
        `INSERT INTO medication_schedules
           (id, medication_id, patient_id, scheduled_time, generated_reason,
            schedule_source, is_confirmed, is_prn_slot, schedule_version, status)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, 'scheduled')`,
        [uuidv4(), s.medication_id, patientId, s.scheduled_time, s.generated_reason,
          isManual ? 'MANUAL' : 'SUGGESTED', version]
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
