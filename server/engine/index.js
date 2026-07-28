/**
 * PharMate Rules-Based Schedule Engine — pure module. (ENG §5, §7, §8, §9)
 *
 * Hard rules:
 *   - No I/O, no clock reads, no database calls inside this module.
 *   - All inputs (curated drug data, anchors, medications) are injected by the caller.
 *   - Same inputs ⇒ byte-identical output (determinism property, ENG §9).
 *
 * Deterministic, auditable, rules-based — explicitly NO AI/ML. The *system*
 * generates the schedule; every placed dose carries a generated_reason string.
 *
 * Public API:
 *   generateSchedule(input) → { version, slots, prn, unresolved }
 *   checkPrnDose(input)     → { allowed, ... }           (ENG §7)
 *   reflowRemaining(input)  → { kept, dropped }          (ENG §8)
 */

import { idealSlots } from './intervals.js';
import { buildInteractionMap, checkDose, pairKey } from './constraints.js';
import { parseClock, formatClock, dayOffset } from './time.js';

const SHIFT_STEP = 30; // minutes — candidate slots move in 30-min increments (ENG §5)
const ANCHOR_WINDOW = 90; // ±90 min search window for anchored doses (ENG §5 step 3)
const DAY = 1440;

const DEFAULT_ANCHORS = {
  wake: '08:00',
  sleep: '22:00',
  breakfast: '07:30',
  lunch: '12:00',
  dinner: '19:00',
};

function normalizeAnchors(a = {}) {
  return { ...DEFAULT_ANCHORS, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v)) };
}

// ── Determinism ordering (ENG §5) ────────────────────────────────────────────
// 1) anchored (least freedom)  2) qNh smallest n  3) QID→TID→BID→QD
// Tie-broken by medication id ascending.
const WORD_RANK = { QID: 2, TID: 3, BID: 4, QD: 5 };

function priorityKey(info) {
  if (info.kind === 'anchored') return [0, 0];
  if (info.kind === 'interval') {
    if (/^q\d+h$/.test(info.token)) return [1, info.intervalMin];
    return [WORD_RANK[info.token] ?? 6, info.intervalMin];
  }
  return [9, 0];
}

function intervalLabel(info) {
  const hours = info.intervalMin / 60;
  if (/^q\d+h$/.test(info.token)) return info.token;
  return `${info.token} (q${hours}h)`;
}

function slotObj(med, minuteOfDay, reason) {
  return {
    medicationId: med.id,
    drugId: med.drugId ?? null,
    drugName: med.drugName,
    minuteOfDay,
    dayOffset: dayOffset(minuteOfDay),
    time: formatClock(minuteOfDay),
    isPrn: false,
    reason,
  };
}

function conflictText(conflict) {
  if (!conflict) return 'no safe slot in search window';
  if (conflict.kind === 'interaction') {
    return `${conflict.minGapHours}h gap vs ${conflict.otherDrug}`;
  }
  if (conflict.kind === 'same-drug') {
    return `min interval vs prior ${conflict.otherDrug} dose`;
  }
  return 'constraint violation';
}

// ── Interval placement (BID/TID/QID/QD/qNh) ──────────────────────────────────
// Shift the whole train's anchor forward until every dose clears constraints,
// searching up to half the drug's own interval (ENG §5 step 3). Example 2:
// ibuprofen TID collides at 08:00 → anchor slides to 09:00, whole train follows.
function placeInterval(med, info, ctx) {
  const { anchors, placed, interactionMap, slots, unresolved } = ctx;
  const interval = info.intervalMin;
  const minIntervalMin = med.minIntervalHours ? Math.round(med.minIntervalHours * 60) : 0;
  const wake = parseClock(anchors.wake);

  let naturalCount = 0;
  for (let k = 0; k * interval < DAY; k++) naturalCount++;
  const count = Math.min(naturalCount, med.maxDailyDoses || Infinity);

  const searchWindow = interval / 2;
  let firstConflict = null;
  let chosen = null;

  for (let shift = 0; shift <= searchWindow; shift += SHIFT_STEP) {
    const anchor = wake + shift;
    const train = [];
    let ok = true;
    for (let k = 0; k < count; k++) {
      const t = anchor + k * interval;
      const res = checkDose(
        { time: t, drugId: med.drugId, medId: med.id, minIntervalMin },
        placed,
        interactionMap
      );
      if (!res.ok) {
        ok = false;
        if (!firstConflict) firstConflict = res;
        break;
      }
      train.push(t);
    }
    if (ok) {
      chosen = { anchor, train, shift };
      break;
    }
  }

  if (!chosen) {
    unresolved.push({
      medicationId: med.id,
      drugName: med.drugName,
      reason: `no safe ${intervalLabel(info)} slot within ±${searchWindow / 60}h — ${conflictText(firstConflict)}`,
      conflictWith: firstConflict?.otherDrug ?? null,
    });
    return;
  }

  chosen.train.forEach((t, i) => {
    let reason;
    if (chosen.shift === 0) {
      reason = `${intervalLabel(info)} from ${anchors.wake} wake anchor — dose ${i + 1}/${count} at ${formatClock(t)}`;
    } else {
      reason = `${intervalLabel(info)} from ${formatClock(chosen.anchor)} (+${chosen.shift}m shift to honor ${conflictText(firstConflict)}) — dose ${i + 1}/${count} at ${formatClock(t)}`;
    }
    slots.push(slotObj(med, t, reason));
    placed.push({ minuteOfDay: t, drugId: med.drugId, medId: med.id, drugName: med.drugName });
  });
}

// ── Anchored placement (MEALMAP/HS with AC/PC) ───────────────────────────────
// Each ideal meal/sleep slot is placed within a ±90 min window, preferring the
// later side (ENG §5 step 3). If any required dose has no safe slot, the whole
// medication is UNRESOLVED — a partial regimen is never proposed.
function placeAnchored(med, info, ctx) {
  const { placed, interactionMap, slots, unresolved } = ctx;
  const minIntervalMin = med.minIntervalHours ? Math.round(med.minIntervalHours * 60) : 0;
  const offsets = [0, 30, 60, 90, -30, -60, -90]; // prefer later

  const chosenSlots = [];
  let failure = null;

  for (let idx = 0; idx < info.slots.length; idx++) {
    const ideal = info.slots[idx];
    let picked = null;
    let conflict = null;
    for (const off of offsets) {
      if (Math.abs(off) > ANCHOR_WINDOW) continue;
      const t = ideal + off;
      const res = checkDose(
        { time: t, drugId: med.drugId, medId: med.id, minIntervalMin },
        placed,
        interactionMap
      );
      if (res.ok) {
        picked = { t, off };
        break;
      }
      if (!conflict) conflict = res;
    }
    if (!picked) {
      failure = { idx, conflict };
      break;
    }
    chosenSlots.push({ ...picked, label: info.labels[idx] });
  }

  if (failure) {
    unresolved.push({
      medicationId: med.id,
      drugName: med.drugName,
      reason: `${info.labels[failure.idx]} dose has no safe slot within ±90m — ${conflictText(failure.conflict)}`,
      conflictWith: failure.conflict?.otherDrug ?? null,
    });
    return;
  }

  const modLabel = info.modifier === 'PC' ? 'post-' : info.modifier === 'AC' ? 'pre-' : '';
  chosenSlots.forEach((cs) => {
    const shiftNote = cs.off !== 0 ? ` (${cs.off > 0 ? '+' : ''}${cs.off}m to clear a gap)` : '';
    const reason = `${modLabel}${cs.label} slot at ${formatClock(cs.t)}${shiftNote}`;
    slots.push(slotObj(med, cs.t, reason));
    placed.push({ minuteOfDay: cs.t, drugId: med.drugId, medId: med.id, drugName: med.drugName });
  });
}

/**
 * Generate a one-day plan for a single patient. (ENG §5)
 *
 * @param {Object}   input
 * @param {Object}   input.anchors       wake/sleep/breakfast/lunch/dinner 'HH:MM'
 * @param {Object[]} input.medications   {id, drugId, drugName, frequencyCode, isPrn, minIntervalHours, maxDailyDoses}
 * @param {Object[]} input.interactions  {drugAId, drugBId, minGapHours, type?}
 * @param {number}   [input.version=1]   schedule_version (caller increments from stored)
 * @returns {{version:number, slots:Object[], prn:Object[], unresolved:Object[]}}
 */
export function generateSchedule(input = {}) {
  const { medications = [], interactions = [], version = 1 } = input;
  const anchors = normalizeAnchors(input.anchors);
  const interactionMap = buildInteractionMap(interactions);

  const prn = [];
  const unresolved = [];
  const placed = [];
  const slots = [];

  const prepared = medications.map((med) => ({
    med,
    info: idealSlots(med.frequencyCode, anchors),
  }));

  const schedulable = [];
  for (const p of prepared) {
    if (p.med.isPrn || p.info.kind === 'prn') {
      prn.push({
        medicationId: p.med.id,
        drugName: p.med.drugName,
        reason: 'PRN — not scheduled; checked at log time (ENG §7)',
      });
    } else if (p.info.kind === 'consult') {
      unresolved.push({
        medicationId: p.med.id,
        drugName: p.med.drugName,
        reason: 'unrecognized frequency — consult your pharmacist',
        conflictWith: null,
      });
    } else if (!p.med.drugId) {
      unresolved.push({
        medicationId: p.med.id,
        drugName: p.med.drugName,
        reason: 'awaiting pharmacist verification — not schedulable (D-D)',
        conflictWith: null,
      });
    } else {
      schedulable.push(p);
    }
  }

  schedulable.sort((a, b) => {
    const ka = priorityKey(a.info);
    const kb = priorityKey(b.info);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return String(a.med.id) < String(b.med.id) ? -1 : String(a.med.id) > String(b.med.id) ? 1 : 0;
  });

  const ctx = { anchors, placed, interactionMap, slots, unresolved };
  for (const { med, info } of schedulable) {
    if (info.kind === 'interval') placeInterval(med, info, ctx);
    else placeAnchored(med, info, ctx);
  }

  // Deterministic output ordering — independent of medication input order.
  slots.sort(
    (a, b) =>
      a.minuteOfDay - b.minuteOfDay ||
      (a.medicationId < b.medicationId ? -1 : a.medicationId > b.medicationId ? 1 : 0)
  );
  unresolved.sort((a, b) =>
    a.medicationId < b.medicationId ? -1 : a.medicationId > b.medicationId ? 1 : 0
  );
  prn.sort((a, b) =>
    a.medicationId < b.medicationId ? -1 : a.medicationId > b.medicationId ? 1 : 0
  );

  return { version, slots, prn, unresolved };
}

/**
 * "Can I take this PRN now?" — constraint-checked, unscheduled. (ENG §7)
 *
 * @param {Object}   input
 * @param {number}   input.attemptTimeMin   minute-of-day of the attempt
 * @param {string}   input.drugId
 * @param {number}   [input.minIntervalHours]
 * @param {number}   [input.maxDailyDoses]
 * @param {number}   [input.lastDoseMin]     last time THIS drug was taken today
 * @param {number}   [input.dosesToday=0]
 * @param {Object[]} [input.recentDoses]     {minuteOfDay, drugId, drugName} of other drugs
 * @param {Object[]} [input.interactions]
 * @returns {{allowed:boolean, reason?:string, earliestSafeMin?:number, earliestSafeTime?:string, blockingDrug?:string, capReached?:boolean}}
 */
export function checkPrnDose(input = {}) {
  const {
    attemptTimeMin,
    drugId,
    minIntervalHours,
    maxDailyDoses,
    lastDoseMin = null,
    dosesToday = 0,
    recentDoses = [],
    interactions = [],
  } = input;

  if (maxDailyDoses && dosesToday >= maxDailyDoses) {
    return {
      allowed: false,
      reason: `daily maximum (${maxDailyDoses} doses) reached`,
      capReached: true,
    };
  }

  const interactionMap = buildInteractionMap(interactions);
  const minIntervalMin = minIntervalHours ? Math.round(minIntervalHours * 60) : 0;
  const blocks = [];

  if (lastDoseMin != null && minIntervalMin && attemptTimeMin - lastDoseMin < minIntervalMin) {
    blocks.push({
      until: lastDoseMin + minIntervalMin,
      reason: `${minIntervalHours}h min interval since last dose`,
      drug: 'same drug',
    });
  }

  for (const d of recentDoses) {
    if (!drugId || !d.drugId) continue;
    const rec = interactionMap.get(pairKey(drugId, d.drugId));
    if (rec && Math.abs(attemptTimeMin - d.minuteOfDay) < rec.gapMin) {
      blocks.push({
        until: d.minuteOfDay + rec.gapMin,
        reason: `${rec.minGapHours}h gap vs ${d.drugName}`,
        drug: d.drugName,
      });
    }
  }

  if (blocks.length === 0) return { allowed: true };

  const binding = blocks.reduce((a, b) => (b.until > a.until ? b : a));
  return {
    allowed: false,
    reason: binding.reason,
    earliestSafeMin: binding.until,
    earliestSafeTime: formatClock(binding.until),
    blockingDrug: binding.drug,
  };
}

/**
 * Late-dose reflow of a single drug's remaining same-day doses. (ENG §8)
 *
 * Next dose = taken_time + interval; doses that would spill past sleep+2h are
 * dropped for the day (never compressed, never double-dosed).
 *
 * @param {Object} input
 * @param {number} input.intervalHours
 * @param {number} input.takenTimeMin
 * @param {number} input.sleepAnchorMin
 * @param {number} [input.maxDoses=Infinity]
 * @returns {{kept:Object[], dropped:Object[]}}
 */
export function reflowRemaining(input = {}) {
  const { intervalHours, takenTimeMin, sleepAnchorMin, maxDoses = Infinity } = input;
  const interval = Math.round(intervalHours * 60);
  const boundary = sleepAnchorMin + 120; // sleep + 2h (ENG §8)
  const kept = [];
  const dropped = [];

  let t = takenTimeMin + interval;
  let guard = 0;
  while (guard < 48) {
    guard++;
    if (t > boundary) {
      dropped.push({
        minuteOfDay: t,
        time: formatClock(t),
        reason: 'dose skipped — insufficient safe interval remaining before sleep+2h',
      });
      break;
    }
    kept.push({
      minuteOfDay: t,
      time: formatClock(t),
      reason: `reflowed to ${formatClock(t)} — ${intervalHours}h after late intake`,
    });
    if (kept.length >= maxDoses) break;
    t += interval;
  }

  return { kept, dropped };
}
