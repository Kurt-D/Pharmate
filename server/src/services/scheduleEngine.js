/** Pure deterministic clinical scheduler: no database, clock, AI, or network. */
const DAY = 1440;
export const CLINICAL_ANCHORS = Object.freeze({
  BREAKFAST: 480,
  LUNCH: 750,
  DINNER: 1140,
  BEDTIME: 1290,
  EMPTY_STOMACH: 420,
});
const SHIFTS = Object.freeze([0, 30, -30, 60, -60, 90, -90]);

function clock(minutes) {
  const value = ((minutes % DAY) + DAY) % DAY;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function gap(a, b) {
  const direct = Math.abs(a - b);
  return Math.min(direct, DAY - direct);
}

function anchor(value, fallback) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})/);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

function patientAnchors(rule) {
  const wake = anchor(rule.wake_anchor, CLINICAL_ANCHORS.EMPTY_STOMACH - 30);
  return {
    wake,
    breakfast: anchor(rule.breakfast_anchor, CLINICAL_ANCHORS.BREAKFAST),
    lunch: anchor(rule.lunch_anchor, CLINICAL_ANCHORS.LUNCH),
    dinner: anchor(rule.dinner_anchor, CLINICAL_ANCHORS.DINNER),
    bedtime: anchor(rule.sleep_anchor, CLINICAL_ANCHORS.BEDTIME),
  };
}

function baseTimes(rule) {
  const frequency = String(rule.standard_frequency || '').toUpperCase();
  const food = String(rule.food_rule || 'NONE').toUpperCase();
  const cap = (times) => times.slice(0, Number(rule.max_daily_doses) || times.length);
  const preferredMatch = String(rule.first_dose_time || '').match(/^(\d{2}):(\d{2})$/);
  const preferred = preferredMatch
    ? Number(preferredMatch[1]) * 60 + Number(preferredMatch[2])
    : null;
  const routine = patientAnchors(rule);
  const anchored = (times) => {
    if (preferred === null || !times.length) return cap(times);
    const shift = preferred - times[0];
    return cap(times.map((time) => time + shift));
  };
  if (frequency === 'Q8H') return anchored([360, 840, 1320]);
  if (frequency === 'QID')
    return anchored([routine.breakfast, routine.lunch, routine.dinner, routine.bedtime]);
  if (frequency === 'TID') return anchored([routine.breakfast, routine.lunch, routine.dinner]);
  if (frequency === 'BID') return anchored([routine.breakfast, routine.dinner]);
  if (frequency === 'BEDTIME' || food === 'BEDTIME') return anchored([routine.bedtime]);
  if (frequency === 'QD') {
    return anchored(
      food === 'EMPTY_STOMACH' || food === 'BEFORE_MEAL'
        ? [routine.wake + 30]
        : [routine.breakfast]
    );
  }
  const match = frequency.match(/^Q(\d{1,2})H$/);
  if (!match) return [];
  const interval = Number(match[1]) * 60;
  return anchored(
    Array.from({ length: Math.floor(DAY / interval) }, (_, index) => 360 + index * interval)
  );
}

function foodOffset(rule) {
  if (rule.food_rule === 'BEFORE_MEAL') return -30;
  if (rule.food_rule === 'AFTER_MEAL') return 30;
  return 0;
}

function keepsMinimumGap(times, minimum) {
  if (!minimum || times.length < 2) return true;
  return times.every((time, index) => gap(time, times[(index + 1) % times.length]) >= minimum);
}

function domainsFor(item) {
  const base = baseTimes(item).map((time) => time + foodOffset(item));
  if (!base.length) return [];
  const minimum = Number(item.min_interval_hours || 0) * 60;
  const patterns = [base];

  // Meal and bedtime rules must stay tied to their clinical anchors. For rules
  // without a food anchor, use an evenly spaced fallback when the preferred
  // daytime anchors are too close together (for example, BID with a 12-hour gap).
  if (
    !keepsMinimumGap(base, minimum) &&
    (item.food_rule === 'NONE' || item.standard_frequency === 'BID') &&
    minimum > 0 &&
    base.length * minimum <= DAY
  ) {
    patterns.push(base.map((_, index) => base[0] + index * minimum));
  }

  const seen = new Set();
  return patterns
    .flatMap((times, patternIndex) =>
      SHIFTS.map((shift) => ({
        shift,
        times: times.map((time) => time + shift),
        deviation: Math.abs(shift) * times.length + patternIndex,
      }))
    )
    .filter((candidate) => {
      const key = candidate.times.map(clock).join(',');
      if (seen.has(key) || !keepsMinimumGap(candidate.times, minimum)) return false;
      seen.add(key);
      return true;
    });
}

function pairKey(a, b) {
  return [String(a), String(b)].sort().join(':');
}

function compatible(item, candidate, placed, interactionMap) {
  return candidate.times.every((time) =>
    placed.every((other) => {
      const interaction = interactionMap.get(pairKey(item.drug_id, other.drug_id));
      if (!interaction) return true;
      const type = String(interaction.interaction_type || 'SPACING').toUpperCase();
      if (type === 'NONE') return true;
      if (type === 'AVOID' || type === 'MONITOR') return false;
      const requiredGap = Number(interaction.min_gap_hours);
      return Number.isFinite(requiredGap) && requiredGap > 0
        ? gap(time, other.time) >= requiredGap * 60
        : false;
    })
  );
}

function deduplicate(items) {
  const names = new Set();
  const unique = [];
  const warnings = [];
  for (const item of items) {
    const name = String(item.generic_name).trim().toLowerCase();
    if (names.has(name)) {
      warnings.push({
        code: 'DUPLICATE_ACTIVE_INGREDIENT',
        severity: 'warning',
        drug_id: item.drug_id,
        message: `${item.generic_name} was selected more than once. Only one entry is scheduled.`,
      });
    } else {
      names.add(name);
      unique.push(item);
    }
  }
  return { unique, warnings };
}

function explanation(item, time, shift) {
  let anchor =
    item.schedule_basis === 'PRESCRIPTION_DIRECTIONS'
      ? 'the exact directions from your approved prescription'
      : item.schedule_basis === 'PATIENT_LABEL'
      ? 'how often you confirmed from the medicine label'
      : 'the checked schedule information for this medicine';
  if (item.food_rule === 'WITH_MEAL') anchor = 'a main meal';
  if (item.food_rule === 'BEFORE_MEAL') anchor = '30 minutes before a meal anchor';
  if (item.food_rule === 'AFTER_MEAL') anchor = '30 minutes after a meal anchor';
  if (item.food_rule === 'EMPTY_STOMACH') anchor = 'the empty-stomach morning anchor';
  if (item.food_rule === 'BEDTIME') anchor = 'the bedtime anchor';
  const personalized = item.routine_source === 'PATIENT_PROFILE' ? ' from your saved routine' : '';
  return `${item.generic_name} is set for ${clock(time)} using ${anchor}${personalized}${shift ? `, moved by ${Math.abs(shift)} minutes to leave enough time between medicines` : ''}.`;
}

function isPrn(item) {
  return String(item.rule_kind || '').toUpperCase() === 'PRN' ||
    String(item.standard_frequency || '').toUpperCase() === 'PRN';
}

function prnTracker(item) {
  return {
    drug_id: item.drug_id,
    name: item.generic_name,
    strength: item.strength || item.default_strength,
    form: item.dosage_form,
    frequency: 'PRN',
    dosage_instruction: item.dosage_instruction,
    directions: item.label_direction || item.prescription_directions || null,
    indication: item.purpose || null,
    min_interval_hours: Number(item.min_interval_hours || 0) || null,
    max_daily_doses: Number(item.max_daily_doses || 0) || null,
    start_date: item.start_date,
    end_date: item.end_date,
    basis: item.schedule_basis,
    recurring_reminders: false,
  };
}

export function generateClinicalSchedule(items = [], interactions = []) {
  const { unique, warnings } = deduplicate(items);
  const prnItems = unique.filter(isPrn);
  const fixedItems = unique.filter((item) => !isPrn(item));
  const incompletePrn = prnItems.filter(
    (item) =>
      !['VERIFIED', 'REFERENCE', 'PRESCRIPTION'].includes(
        item.clinical_rule_status
      ) ||
      !String(item.dosage_instruction || '').trim() ||
      !String(item.label_direction || item.prescription_directions || '').trim() ||
      !Number.isInteger(Number(item.max_daily_doses)) ||
      Number(item.max_daily_doses) <= 0 ||
      !Number.isFinite(Number(item.min_interval_hours)) ||
      Number(item.min_interval_hours) <= 0
  );
  const unavailable = fixedItems.filter(
    (item) =>
      !['VERIFIED', 'REFERENCE', 'PATIENT_LABEL', 'PRESCRIPTION'].includes(
        item.clinical_rule_status
      ) ||
      !baseTimes(item).length ||
      !Number.isInteger(Number(item.max_daily_doses)) ||
      Number(item.max_daily_doses) <= 0
  );
  if (!unique.length || unavailable.length || incompletePrn.length) {
    return {
      schedule: [],
      prn_trackers: [],
      rationale: [],
      can_save: false,
      warnings: [
        ...warnings,
        ...unavailable.map((item) => ({
          code: 'VERIFIED_RULE_UNAVAILABLE',
          severity: 'blocking',
          drug_id: item.drug_id,
            message: `A complete verified frequency and daily reminder limit is unavailable for ${item.generic_name}.`,
          })),
        ...incompletePrn.map((item) => ({
          code: 'PRN_DIRECTIONS_REQUIRED',
          severity: 'blocking',
          drug_id: item.drug_id,
          message: `Exact as-needed directions, a reviewed minimum interval, and a 24-hour dose limit are required for ${item.generic_name}. PharMate will not guess when another dose can be taken.`,
        })),
      ],
      algorithm: 'EXPLAINABLE_CSP_SAFETY_CONTEXT_V3',
      nodes_evaluated: 0,
    };
  }

  const prnTrackers = prnItems.map(prnTracker);
  const prnWarnings = prnItems.map((item) => ({
    code: 'PRN_TRACKER_ONLY',
    severity: 'information',
    drug_id: item.drug_id,
    message: `${item.generic_name} is saved as an as-needed medicine. No recurring reminder times were created. Follow the exact label or prescription directions each time.`,
  }));
  if (!fixedItems.length) {
    return {
      schedule: [],
      prn_trackers: prnTrackers,
      rationale: [],
      can_save: true,
      warnings: [...warnings, ...prnWarnings],
      algorithm: 'EXPLAINABLE_CSP_SAFETY_CONTEXT_V3',
      nodes_evaluated: 0,
    };
  }

  const interactionMap = new Map(
    interactions.map((rule) => [pairKey(rule.drug_a_id, rule.drug_b_id), rule])
  );
  const domains = fixedItems
    .map((item) => ({ item, candidates: domainsFor(item) }))
    .sort(
      (a, b) =>
        a.candidates.length - b.candidates.length ||
        String(a.item.drug_id).localeCompare(String(b.item.drug_id))
    );
  let best = null;
  let nodes = 0;
  function search(index, placed, choices, deviation) {
    nodes += 1;
    if (best && deviation >= best.deviation) return;
    if (index === domains.length) {
      best = { choices: [...choices], deviation };
      return;
    }
    const domain = domains[index];
    for (const candidate of domain.candidates) {
      if (!compatible(domain.item, candidate, placed, interactionMap)) continue;
      search(
        index + 1,
        [...placed, ...candidate.times.map((time) => ({ time, drug_id: domain.item.drug_id }))],
        [...choices, { item: domain.item, candidate }],
        deviation + candidate.deviation
      );
    }
  }
  search(0, [], [], 0);
  if (!best) {
    return {
      schedule: [],
      prn_trackers: prnTrackers,
      rationale: [],
      can_save: false,
      algorithm: 'EXPLAINABLE_CSP_SAFETY_CONTEXT_V3',
      nodes_evaluated: nodes,
      warnings: [
        ...warnings,
        {
          code: 'NO_CONFLICT_FREE_SOLUTION',
          severity: 'blocking',
          message:
            'PharMate could not create reminder times that follow all the available instructions. Check how often your label or prescription says to take the medicine. If you are unsure, ask your pharmacist.',
        },
      ],
    };
  }

  const doses = best.choices.flatMap(({ item, candidate }) =>
    candidate.times.map((time) => ({
      time: clock(time),
      minute: ((time % DAY) + DAY) % DAY,
      medicine: {
        drug_id: item.drug_id,
        name: item.generic_name,
        strength: item.strength || item.default_strength,
        form: item.dosage_form,
        frequency: item.standard_frequency,
        food_instruction: item.food_instruction,
        dosage_instruction: item.dosage_instruction,
        start_date: item.start_date,
        quantity_on_hand: item.quantity_on_hand,
        quantity_unit: item.quantity_unit,
        label_direction: item.label_direction,
        guidance_do: item.guidance_do,
        guidance_dont: item.guidance_dont,
      },
      rationale: explanation(item, time, candidate.shift),
    }))
  );
  doses.sort((a, b) => a.minute - b.minute || a.medicine.name.localeCompare(b.medicine.name));
  const schedule = [];
  for (const dose of doses) {
    const group = schedule[schedule.length - 1];
    const medicine = { ...dose.medicine, rationale: dose.rationale };
    if (group?.time === dose.time) group.medicines.push(medicine);
    else schedule.push({ time: dose.time, minute: dose.minute, medicines: [medicine] });
  }
  return {
    schedule,
    prn_trackers: prnTrackers,
    warnings: [...warnings, ...prnWarnings],
    can_save: true,
    algorithm: 'EXPLAINABLE_CSP_SAFETY_CONTEXT_V3',
    nodes_evaluated: nodes,
    objective_deviation_minutes: best.deviation,
    rationale: doses.map((dose) => ({
      drug_id: dose.medicine.drug_id,
      time: dose.time,
      explanation: dose.rationale,
    })),
  };
}
