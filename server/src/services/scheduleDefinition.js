const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

const FREQUENCY_TYPES = Object.freeze({
  QD: { frequencyType: 'ONCE_DAILY', count: 1 },
  BID: { frequencyType: 'TWICE_DAILY', count: 2 },
  TID: { frequencyType: 'THREE_TIMES_DAILY', count: 3 },
  QID: { frequencyType: 'SPECIFIC_TIMES', count: 4 },
  Q4H: { frequencyType: 'EVERY_N_HOURS', count: 6, intervalHours: 4 },
  Q6H: { frequencyType: 'EVERY_N_HOURS', count: 4, intervalHours: 6 },
  Q8H: { frequencyType: 'EVERY_N_HOURS', count: 3, intervalHours: 8 },
  Q12H: { frequencyType: 'EVERY_N_HOURS', count: 2, intervalHours: 12 },
});

export function normalizeTimes(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map(String)
        .map((v) => v.slice(0, 5))
        .filter((v) => CLOCK.test(v))
    ),
  ].sort();
}

export function frequencyRule(value, intervalHours = null) {
  const code = String(value || '')
    .trim()
    .toUpperCase();
  if (FREQUENCY_TYPES[code]) return { code, ...FREQUENCY_TYPES[code] };
  const type = code.replace(/\s+/g, '_');
  if (type === 'AS_NEEDED') return { code, frequencyType: type, count: 0 };
  if (type === 'ONCE_DAILY') return { code: 'QD', frequencyType: type, count: 1 };
  if (type === 'TWICE_DAILY') return { code: 'BID', frequencyType: type, count: 2 };
  if (type === 'THREE_TIMES_DAILY') return { code: 'TID', frequencyType: type, count: 3 };
  if (type === 'FOUR_TIMES_DAILY' || type === 'FOUR_TIMES_A_DAY')
    return { code: 'QID', ...FREQUENCY_TYPES.QID };
  if (type === 'EVERY_N_HOURS') {
    const interval = Number(intervalHours);
    return {
      code,
      frequencyType: type,
      intervalHours: interval,
      count:
        Number.isInteger(interval) && interval > 0 && 24 % interval === 0 ? 24 / interval : null,
    };
  }
  return null;
}

export function suggestedTimes(value, startTime, intervalHours = null) {
  const rule = frequencyRule(value, intervalHours);
  // A daily count is not an interval instruction.
  if (rule && rule.frequencyType !== 'EVERY_N_HOURS' && rule.count !== 1) return [];
  if (!rule || rule.count === 0 || !Number.isInteger(rule.count) || !CLOCK.test(startTime || ''))
    return [];
  const start = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5));
  const gap = rule.frequencyType === 'EVERY_N_HOURS' ? rule.intervalHours * 60 : 1440 / rule.count;
  return Array.from({ length: rule.count }, (_, index) => {
    const total = start + index * gap;
    const minute = total % 1440;
    return {
      time: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
      dayOffset: Math.floor(total / 1440),
    };
  });
}

export function validateMedicationSchedule({
  frequencyType,
  frequencyCode,
  intervalHours,
  scheduleTimes = [],
  startDate,
  endDate,
  scheduleMode,
} = {}) {
  // SPECIFIC_TIMES describes timing, not dose count. Preserve the explicit code.
  const rule = frequencyRule(
    frequencyType === 'SPECIFIC_TIMES' ? frequencyCode : frequencyType || frequencyCode,
    intervalHours
  );
  if (!rule && scheduleMode !== 'MANUAL')
    return {
      valid: false,
      code: 'UNSUPPORTED_FREQUENCY',
      message:
        'We could not recognize the saved frequency. Ask your pharmacist to review the directions before saving reminders.',
    };
  if (!startDate || (endDate && endDate < startDate))
    return {
      valid: false,
      code: 'INVALID_DATE_RANGE',
      message: 'Check the start and end dates. The end date must not be before the start date.',
    };
  if (rule?.frequencyType === 'AS_NEEDED')
    return {
      valid: scheduleTimes.length === 0,
      code: scheduleTimes.length ? 'AS_NEEDED_HAS_FIXED_TIMES' : null,
      message: scheduleTimes.length
        ? 'As-needed medication cannot have active fixed reminder times.'
        : null,
    };
  const times = normalizeTimes(scheduleTimes);
  if (times.length !== scheduleTimes.length)
    return {
      valid: false,
      code: 'INVALID_OR_DUPLICATE_TIME',
      message:
        'Check your reminder times. Enter a valid time for each reminder and remove repeated times.',
    };
  // Manual reminders are patient-selected times, not a generated dose count.
  // Final save still enforces patient/prescription and dose-limit safeguards.
  if (scheduleMode === 'MANUAL')
    return times.length
      ? { valid: true, code: null, message: null }
      : {
          valid: false,
          code: 'INVALID_OR_DUPLICATE_TIME',
          message: 'Choose at least one reminder time.',
        };
  if (!Number.isInteger(rule.count))
    return {
      valid: false,
      code: 'INVALID_INTERVAL',
      message: 'The interval must divide evenly into 24 hours.',
    };
  if (times.length !== rule.count) {
    const labels = {
      1: 'Once-daily medication requires one scheduled dose per day.',
      2: 'Twice-daily medication requires two scheduled doses per day.',
      3: 'Three-times-daily medication requires three scheduled doses per day.',
    };
    return {
      valid: false,
      code: 'FREQUENCY_TIME_COUNT_MISMATCH',
      message:
        labels[rule.count] ||
        `${rule.frequencyType === 'EVERY_N_HOURS' ? `Every-${rule.intervalHours}-hours` : 'This'} medication schedule requires ${rule.count} scheduled doses per 24-hour cycle.`,
    };
  }
  return { valid: true, code: null, message: null, expectedCount: rule.count };
}

function timesInInstructions(...values) {
  const matches = values.flatMap(
    (value) => String(value || '').match(/\b(?:[01]\d|2[0-3]):[0-5]\d\b/g) || []
  );
  return normalizeTimes(matches);
}

function typeForFrequency(code, isPrn) {
  if (isPrn || code === 'PRN') return 'AS_NEEDED';
  if (code === 'QD') return 'ONCE_DAILY';
  if (code === 'BID') return 'TWICE_DAILY';
  if (code === 'TID') return 'THREE_TIMES_DAILY';
  if (/^q\d{1,2}h$/i.test(code || '')) return 'EVERY_N_HOURS';
  return null;
}

/** Build a schedule definition only from entered/prescribed timing facts. */
export function deriveScheduleDefinition(input, frequencyCode) {
  const enteredTimes = normalizeTimes(
    input.schedule_times || input.specific_times || input.medication_times || input.times
  );
  const instructionTimes = timesInInstructions(
    input.dosage_instruction,
    input.label_direction,
    input.timing_note,
    input.frequency
  );
  const times = instructionTimes.length ? instructionTimes : enteredTimes;
  const requestedType = String(input.schedule_type || '').toUpperCase();
  const inferredType = typeForFrequency(frequencyCode, input.is_prn);
  const scheduleType =
    inferredType === 'AS_NEEDED'
      ? 'AS_NEEDED'
      : requestedType || (times.length ? 'SPECIFIC_TIMES' : inferredType);
  const intervalMatch = String(frequencyCode || '').match(/^q(\d{1,2})h$/i);
  const intervalHours = Number(input.interval_hours || intervalMatch?.[1]) || null;
  const intervalStartTime = String(
    input.interval_start_time || input.first_dose_time || input.start_time || ''
  ).slice(0, 5);
  const validStart = CLOCK.test(intervalStartTime) ? intervalStartTime : null;
  const days = Array.isArray(input.schedule_days)
    ? [...new Set(input.schedule_days.map(String))]
    : [];
  if (
    ['SPECIFIC_DAYS', 'WEEKLY'].includes(scheduleType) &&
    (!days.length ||
      days.some(
        (day) => !/^(?:[0-6]|SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)$/i.test(day)
      ))
  ) {
    return {
      scheduleType,
      times,
      intervalHours: null,
      intervalStartTime: null,
      days,
      status: 'NEEDS_REVIEW',
    };
  }

  if (scheduleType === 'AS_NEEDED') {
    return {
      scheduleType,
      times: [],
      intervalHours: null,
      intervalStartTime: null,
      days,
      status: 'APPROVED',
    };
  }
  if (times.length) {
    return {
      scheduleType: requestedType || 'SPECIFIC_TIMES',
      times,
      intervalHours: null,
      intervalStartTime: null,
      days,
      status: 'PENDING_APPROVAL',
    };
  }
  if (scheduleType === 'EVERY_N_HOURS' && intervalHours >= 1 && intervalHours <= 24 && validStart) {
    return {
      scheduleType,
      times: [],
      intervalHours,
      intervalStartTime: validStart,
      days,
      status: 'PENDING_APPROVAL',
    };
  }
  return {
    scheduleType: scheduleType || null,
    times: [],
    intervalHours,
    intervalStartTime: validStart,
    days,
    status: 'NEEDS_REVIEW',
  };
}
