const ALLOWED_FOOD_RULES = new Set([
  'WITH_MEAL',
  'EMPTY_STOMACH',
  'BEFORE_MEAL',
  'AFTER_MEAL',
  'BEDTIME',
  'NONE',
]);

function supportedFrequency(value) {
  return /^(QD|BID|TID|QID|Q\d{1,2}H|BEDTIME)$/i.test(String(value || '').trim());
}

function frequencyIntervalHours(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase();
  const named = { QD: 24, BID: 12, TID: 8, QID: 6, BEDTIME: 24 };
  if (named[code]) return named[code];
  const match = code.match(/^Q(\d{1,2})H$/);
  return match ? Number(match[1]) : null;
}

function expectedDailyDoses(value) {
  const code = String(value || '')
    .trim()
    .toUpperCase();
  const named = { QD: 1, BID: 2, TID: 3, QID: 4, BEDTIME: 1 };
  if (named[code]) return named[code];
  const match = code.match(/^Q(\d{1,2})H$/);
  return match ? 24 / Number(match[1]) : null;
}

function supportedCodes(value) {
  if (Array.isArray(value)) return value.map((code) => String(code).toUpperCase());
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((code) => String(code).toUpperCase()) : [];
  } catch {
    return [];
  }
}

export function checkClinicalRule(rule = {}) {
  const missingFields = [];
  const conflicts = [];
  const requireText = (field) => {
    if (!String(rule[field] || '').trim()) missingFields.push(field);
  };

  requireText('generic_name');
  requireText('common_strength');
  requireText('dosage_form');
  requireText('administration_route');
  requireText('release_type');
  requireText('frequency_default');
  requireText('administration_instruction');
  requireText('clinical_rationale');
  requireText('guidance_do');
  requireText('guidance_dont');
  requireText('evidence_source_url');
  requireText('clinical_source_name');
  requireText('source_revision_date');
  requireText('evidence_reviewed_at');

  if (!supportedFrequency(rule.frequency_default)) conflicts.push('unsupported_frequency');
  const codes = supportedCodes(rule.supported_frequency_codes);
  if (!codes.length) missingFields.push('supported_frequency_codes');
  else if (!codes.includes(String(rule.frequency_default || '').toUpperCase())) {
    conflicts.push('frequency_not_in_supported_codes');
  }
  if (String(rule.release_type || '').toUpperCase() === 'UNKNOWN') {
    conflicts.push('release_type_not_verified');
  }
  const maximum = Number(rule.max_daily_doses);
  if (!Number.isInteger(maximum) || maximum <= 0 || maximum > 24) {
    conflicts.push('invalid_max_daily_doses');
  }
  const expectedMaximum = expectedDailyDoses(rule.frequency_default);
  if (expectedMaximum && (!Number.isInteger(expectedMaximum) || maximum !== expectedMaximum)) {
    conflicts.push('daily_limit_does_not_match_frequency');
  }
  const rawMinimum = rule.min_interval_hours ?? rule.default_interval_hours;
  const minimum =
    rawMinimum === null || rawMinimum === '' || rawMinimum === undefined
      ? null
      : Number(rawMinimum);
  const hasVerifiedAnchor = [
    'WITH_MEAL',
    'EMPTY_STOMACH',
    'BEFORE_MEAL',
    'AFTER_MEAL',
    'BEDTIME',
  ].includes(String(rule.food_rule || ''));
  if (
    (!hasVerifiedAnchor && minimum === null) ||
    (minimum !== null && (!Number.isFinite(minimum) || minimum <= 0 || minimum > 24))
  ) {
    conflicts.push('invalid_minimum_interval');
  }
  const frequencyInterval = frequencyIntervalHours(rule.frequency_default);
  if (
    frequencyInterval &&
    minimum !== null &&
    Number.isFinite(minimum) &&
    minimum > frequencyInterval
  ) {
    conflicts.push('minimum_interval_exceeds_frequency_interval');
  }
  if (!ALLOWED_FOOD_RULES.has(String(rule.food_rule || ''))) conflicts.push('invalid_food_rule');
  if (!/^https:\/\//i.test(String(rule.evidence_source_url || ''))) {
    conflicts.push('evidence_url_must_use_https');
  }
  if (rule.catalog_status && rule.catalog_status !== 'VERIFIED') {
    conflicts.push('catalog_not_verified');
  }

  return {
    valid: missingFields.length === 0 && conflicts.length === 0,
    missing_fields: [...new Set(missingFields)],
    conflicts: [...new Set(conflicts)],
  };
}

export function verificationSummary(rows = []) {
  const result = {
    total: rows.length,
    catalog_verified: 0,
    schedule_verified: 0,
    in_review: 0,
    unverified: 0,
    rejected: 0,
    retired: 0,
    schedule_retired: 0,
    missing_evidence: 0,
    incomplete_rules: 0,
  };
  for (const row of rows) {
    if (row.catalog_status === 'VERIFIED') result.catalog_verified += 1;
    if (row.catalog_status === 'RETIRED') result.retired += 1;
    if (row.clinical_rule_status === 'VERIFIED') result.schedule_verified += 1;
    if (row.clinical_rule_status === 'IN_REVIEW') result.in_review += 1;
    if (row.clinical_rule_status === 'UNVERIFIED') result.unverified += 1;
    if (row.clinical_rule_status === 'REJECTED') result.rejected += 1;
    if (row.clinical_rule_status === 'RETIRED') result.schedule_retired += 1;
    const check = checkClinicalRule(row);
    if (
      check.missing_fields.some(
        (field) => field.includes('source') || field === 'evidence_reviewed_at'
      )
    ) {
      result.missing_evidence += 1;
    }
    if (!check.valid) result.incomplete_rules += 1;
  }
  return result;
}
