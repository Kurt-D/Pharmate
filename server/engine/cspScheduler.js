import { checkDose } from './constraints.js';
import { formatClock, dayOffset, parseClock } from './time.js';

const STEP_MINUTES = 30;
const ANCHOR_OFFSETS = [0, 30, 60, 90, -30, -60, -90];
const MAX_SEARCH_NODES = 100000;
const DAY_MINUTES = 1440;

function slot(med, minuteOfDay, reason) {
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

function internallyValid(times, minimumMinutes) {
  if (!minimumMinutes || times.length < 2) return true;
  const ordered = [...times].sort((a, b) => a - b);
  return ordered.every((value, index) => index === 0 || value - ordered[index - 1] >= minimumMinutes);
}

function intervalCandidates(med, info, anchors) {
  const interval = info.intervalMin;
  const minimumMinutes = med.minIntervalHours ? Math.round(med.minIntervalHours * 60) : 0;
  const wake = parseClock(anchors.wake);
  let naturalCount = 0;
  for (let k = 0; k * interval < DAY_MINUTES; k++) naturalCount++;
  const count = Math.min(naturalCount, med.maxDailyDoses || Infinity);
  const output = [];
  const frequencyLabel = /^q\d+h$/.test(info.token)
    ? info.token
    : `${info.token} (q${interval / 60}h)`;

  for (let shift = 0; shift <= interval / 2; shift += STEP_MINUTES) {
    const anchor = wake + shift;
    const times = Array.from({ length: count }, (_, index) => anchor + index * interval);
    if (!internallyValid(times, minimumMinutes)) continue;
    output.push({
      deviation: shift * count,
      slots: times.map((time, index) =>
        slot(
          med,
          time,
          `${frequencyLabel} from ${formatClock(anchor)} wake anchor${shift ? `; shifted ${shift} minutes to satisfy the complete schedule` : ''} — dose ${index + 1}/${count}`
        )
      ),
    });
  }
  return output;
}

function anchoredCandidates(med, info) {
  const minimumMinutes = med.minIntervalHours ? Math.round(med.minIntervalHours * 60) : 0;
  const combinations = [];

  function visit(index, selected) {
    if (index === info.slots.length) {
      const times = selected.map((choice) => choice.time);
      if (!internallyValid(times, minimumMinutes)) return;
      const deviation = selected.reduce((sum, choice) => sum + Math.abs(choice.offset), 0);
      const modifier = info.modifier === 'PC' ? 'after ' : info.modifier === 'AC' ? 'before ' : 'at ';
      combinations.push({
        deviation,
        slots: selected.map((choice, slotIndex) =>
          slot(
            med,
            choice.time,
            `${modifier}${info.labels[slotIndex]} anchor at ${formatClock(choice.time)}${choice.offset ? `; adjusted ${choice.offset > 0 ? '+' : ''}${choice.offset} minutes to satisfy verified gaps` : ''}`
          )
        ),
      });
      return;
    }
    for (const offset of ANCHOR_OFFSETS) {
      visit(index + 1, [...selected, { time: info.slots[index] + offset, offset }]);
    }
  }

  visit(0, []);
  combinations.sort((a, b) =>
    a.deviation - b.deviation ||
    a.slots.map((item) => item.minuteOfDay).join(',').localeCompare(
      b.slots.map((item) => item.minuteOfDay).join(',')
    )
  );
  return combinations;
}

function candidatesFor(item, anchors) {
  return item.info.kind === 'interval'
    ? intervalCandidates(item.med, item.info, anchors)
    : anchoredCandidates(item.med, item.info);
}

function compatible(candidate, med, placed, interactionMap) {
  const minimumMinutes = med.minIntervalHours ? Math.round(med.minIntervalHours * 60) : 0;
  for (const proposed of candidate.slots) {
    const result = checkDose(
      {
        time: proposed.minuteOfDay,
        drugId: med.drugId,
        medId: med.id,
        minIntervalMin: minimumMinutes,
      },
      placed,
      interactionMap
    );
    if (!result.ok) return result;
  }
  return { ok: true };
}

function asPlaced(candidate) {
  return candidate.slots.map((item) => ({
    minuteOfDay: item.minuteOfDay,
    drugId: item.drugId,
    medId: item.medicationId,
    drugName: item.drugName,
  }));
}

function explainAssignments(assignments, interactionMap) {
  const placed = [];
  return assignments.map((assignment) => {
    const baseCandidate = assignment.item.candidates[0];
    const baseResult = compatible(baseCandidate, assignment.item.med, placed, interactionMap);
    let candidate = assignment.candidate;
    if (candidate.deviation > 0 && !baseResult.ok) {
      const gapText =
        baseResult.kind === 'interaction'
          ? `${baseResult.minGapHours}h gap vs ${baseResult.otherDrug}`
          : `minimum interval for ${baseResult.otherDrug}`;
      candidate = {
        ...candidate,
        slots: candidate.slots.map((item) => ({
          ...item,
          reason: item.reason.replace(
            /; shifted \d+ minutes to satisfy the complete schedule/,
            `; shift to honor ${gapText}`
          ),
        })),
      };
    }
    placed.push(...asPlaced(candidate));
    return { ...assignment, candidate };
  });
}

/**
 * Deterministic CSP solver.
 * Hard constraints: prescribed count/frequency, same-medication minimum interval,
 * verified cross-medication gaps, and anchor windows.
 * Soft objective: minimize total movement away from wake/meal/bed anchors.
 */
export function solveScheduleCsp(items, anchors, interactionMap) {
  const domains = items.map((item) => ({ ...item, candidates: candidatesFor(item, anchors) }));
  let nodesEvaluated = 0;
  let best = null;

  function search(index, placed, selected, deviation) {
    if (nodesEvaluated >= MAX_SEARCH_NODES) return;
    nodesEvaluated++;
    if (best && deviation >= best.deviation) return;
    if (index === domains.length) {
      best = { selected: [...selected], deviation };
      return;
    }
    const domain = domains[index];
    for (const candidate of domain.candidates) {
      if (!compatible(candidate, domain.med, placed, interactionMap).ok) continue;
      search(
        index + 1,
        [...placed, ...asPlaced(candidate)],
        [...selected, { item: domain, candidate }],
        deviation + candidate.deviation
      );
    }
  }

  search(0, [], [], 0);
  if (best) {
    const explained = explainAssignments(best.selected, interactionMap);
    return {
      assignments: explained,
      unresolved: [],
      metadata: {
        algorithm: 'CSP_RULE_ANCHOR_V2',
        complete: true,
        nodesEvaluated,
        objectiveDeviationMinutes: best.deviation,
      },
    };
  }

  // If no complete assignment exists, retain the largest deterministic safe
  // subset and report every medicine that cannot satisfy the hard constraints.
  const assignments = [];
  const unresolved = [];
  const placed = [];
  for (const domain of domains) {
    let selected = null;
    let firstConflict = null;
    for (const candidate of domain.candidates) {
      const result = compatible(candidate, domain.med, placed, interactionMap);
      if (result.ok) {
        selected = candidate;
        break;
      }
      firstConflict ||= result;
    }
    if (selected) {
      assignments.push({ item: domain, candidate: selected });
      placed.push(...asPlaced(selected));
    } else {
      unresolved.push({
        medicationId: domain.med.id,
        drugName: domain.med.drugName,
        reason: firstConflict
          ? `No reminder time satisfies the required gap from ${firstConflict.otherDrug}.`
          : 'No reminder time satisfies the medicine frequency and minimum interval.',
        conflictWith: firstConflict?.otherDrug ?? null,
      });
    }
  }
  return {
    assignments,
    unresolved,
    metadata: {
      algorithm: 'CSP_RULE_ANCHOR_V2',
      complete: false,
      nodesEvaluated,
      objectiveDeviationMinutes: assignments.reduce(
        (sum, assignment) => sum + assignment.candidate.deviation,
        0
      ),
    },
  };
}
