import { missingSafetyContext, serializeSafetyProfile } from './patientSafetyProfile.js';

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalized(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsTerm(text, term) {
  const haystack = ` ${normalized(text)} `;
  const needle = normalized(term);
  return needle.length >= 3 && haystack.includes(` ${needle} `);
}

function ageInYears(dateOfBirth, today = new Date()) {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  let years = today.getUTCFullYear() - birth.getUTCFullYear();
  const month = today.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && today.getUTCDate() < birth.getUTCDate())) years -= 1;
  return years;
}

function validPastOrPresentDate(value, today = new Date()) {
  if (!value) return false;
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const currentDate = new Date(today);
  currentDate.setUTCHours(23, 59, 59, 999);
  return date <= currentDate;
}

export function checkSafetyRule(rule = {}) {
  const missingFields = [];
  const conflicts = [];
  for (const field of [
    'age_reviewed',
    'weight_reviewed',
    'allergies_reviewed',
    'conditions_reviewed',
    'interactions_reviewed',
  ]) {
    if (!Number(rule[field])) missingFields.push(field);
  }
  for (const field of [
    'pregnancy_action',
    'breastfeeding_action',
    'kidney_action',
    'liver_action',
    'source_name',
    'source_url',
    'source_revision_date',
  ]) {
    if (!String(rule[field] || '').trim()) missingFields.push(field);
  }
  if (!/^https:\/\//i.test(String(rule.source_url || '')))
    conflicts.push('source_url_must_use_https');
  if (rule.source_revision_date && !validPastOrPresentDate(rule.source_revision_date)) {
    conflicts.push('invalid_source_revision_date');
  }
  if (
    rule.rule_version != null &&
    (!Number.isInteger(Number(rule.rule_version)) || Number(rule.rule_version) <= 0)
  ) {
    conflicts.push('invalid_rule_version');
  }
  const minimumAge = rule.minimum_age_years == null ? null : Number(rule.minimum_age_years);
  const maximumAge = rule.maximum_age_years == null ? null : Number(rule.maximum_age_years);
  if (minimumAge !== null && (!Number.isFinite(minimumAge) || minimumAge < 0 || minimumAge > 130))
    conflicts.push('invalid_minimum_age');
  if (maximumAge !== null && (!Number.isFinite(maximumAge) || maximumAge < 0 || maximumAge > 130))
    conflicts.push('invalid_maximum_age');
  if (minimumAge !== null && maximumAge !== null && minimumAge > maximumAge)
    conflicts.push('age_range_reversed');
  const minimumWeight = rule.minimum_weight_kg == null ? null : Number(rule.minimum_weight_kg);
  const maximumWeight = rule.maximum_weight_kg == null ? null : Number(rule.maximum_weight_kg);
  if (minimumWeight !== null && (!Number.isFinite(minimumWeight) || minimumWeight <= 0))
    conflicts.push('invalid_minimum_weight');
  if (maximumWeight !== null && (!Number.isFinite(maximumWeight) || maximumWeight <= 0))
    conflicts.push('invalid_maximum_weight');
  if (minimumWeight !== null && maximumWeight !== null && minimumWeight > maximumWeight)
    conflicts.push('weight_range_reversed');
  if (!jsonArray(rule.allergy_terms_json).length) missingFields.push('allergy_terms_json');
  const conditionRules = jsonArray(rule.condition_rules_json);
  if (
    conditionRules.some(
      (condition) =>
        !String(condition?.term || '').trim() ||
        !['ALLOW', 'REVIEW', 'BLOCK'].includes(String(condition?.action || '').toUpperCase())
    )
  ) {
    conflicts.push('invalid_condition_rules');
  }
  return {
    valid: missingFields.length === 0 && conflicts.length === 0,
    missing_fields: [...new Set(missingFields)],
    conflicts: [...new Set(conflicts)],
  };
}

function warning(code, severity, drug, message, details = {}) {
  return {
    code,
    severity,
    drug_id: drug?.drug_id,
    medicine: drug?.generic_name,
    message,
    ...details,
  };
}

function actionWarning(action, code, drug, message) {
  if (action === 'ALLOW') return null;
  return warning(code, 'blocking', drug, message, {
    requires_pharmacist_review: action === 'REVIEW',
  });
}

export function evaluateMedicationSafety({
  profileRow,
  medicines = [],
  safetyRules = [],
  interactions = [],
}) {
  if (!profileRow) {
    return {
      can_schedule: false,
      missing_profile_fields: ['safety_profile'],
      warnings: [
        warning(
          'SAFETY_PROFILE_REQUIRED',
          'blocking',
          null,
          'Complete your safety profile before PharMate creates a schedule.'
        ),
      ],
    };
  }
  const profile = serializeSafetyProfile(profileRow);
  const missing = missingSafetyContext(profile);
  const warnings = missing.length
    ? [
        warning(
          'SAFETY_PROFILE_INCOMPLETE',
          'blocking',
          null,
          'Complete the missing safety profile fields before PharMate creates a schedule.',
          { fields: missing }
        ),
      ]
    : [];
  const rulesByDrug = new Map(safetyRules.map((rule) => [String(rule.drug_id), rule]));
  const age = ageInYears(profile.date_of_birth);

  for (const drug of medicines) {
    const rule = rulesByDrug.get(String(drug.drug_id));
    const completeness = checkSafetyRule(rule || {});
    if (!rule || rule.safety_status !== 'VERIFIED' || !completeness.valid) {
      warnings.push(
        warning(
          'SAFETY_RULE_INCOMPLETE',
          'blocking',
          drug,
          `The patient-safety rule for ${drug.generic_name} has not completed pharmacist review.`,
          { safety_rule_status: rule?.safety_status || 'MISSING', consistency: completeness }
        )
      );
      continue;
    }
    const allergyTerms = [drug.generic_name, ...jsonArray(rule.allergy_terms_json)];
    if (allergyTerms.some((term) => containsTerm(profile.allergies, term))) {
      warnings.push(
        warning(
          'ALLERGY_MATCH',
          'blocking',
          drug,
          `${drug.generic_name} matches an allergy in your safety profile. Do not create this schedule; contact your pharmacist.`
        )
      );
    }
    const minimumAge = rule.minimum_age_years == null ? null : Number(rule.minimum_age_years);
    const maximumAge = rule.maximum_age_years == null ? null : Number(rule.maximum_age_years);
    if ((minimumAge !== null && age < minimumAge) || (maximumAge !== null && age > maximumAge)) {
      warnings.push(
        warning(
          'AGE_OUTSIDE_REVIEWED_RANGE',
          'blocking',
          drug,
          `${drug.generic_name} is outside the age range covered by the reviewed rule.`
        )
      );
    }
    const minimumWeight = rule.minimum_weight_kg == null ? null : Number(rule.minimum_weight_kg);
    const maximumWeight = rule.maximum_weight_kg == null ? null : Number(rule.maximum_weight_kg);
    if ((minimumWeight !== null || maximumWeight !== null) && profile.weight_kg === '') {
      warnings.push(
        warning(
          'WEIGHT_REQUIRED',
          'blocking',
          drug,
          `Weight is required for the reviewed ${drug.generic_name} rule.`
        )
      );
    } else if (
      (minimumWeight !== null && Number(profile.weight_kg) < minimumWeight) ||
      (maximumWeight !== null && Number(profile.weight_kg) > maximumWeight)
    ) {
      warnings.push(
        warning(
          'WEIGHT_OUTSIDE_REVIEWED_RANGE',
          'blocking',
          drug,
          `${drug.generic_name} is outside the weight range covered by the reviewed rule.`
        )
      );
    }
    const conditions = jsonArray(rule.condition_rules_json);
    for (const condition of conditions) {
      if (!containsTerm(profile.conditions, condition?.term)) continue;
      const item = actionWarning(
        condition?.action,
        'CONDITION_REVIEW_REQUIRED',
        drug,
        condition?.message ||
          `${drug.generic_name} needs pharmacist review because of a condition in your profile.`
      );
      if (item) warnings.push(item);
    }
    if (
      profile.kidney_status === 'YES' ||
      (profile.kidney_status === 'UNSURE' && rule.kidney_action !== 'ALLOW')
    ) {
      const item = actionWarning(
        rule.kidney_action,
        'KIDNEY_REVIEW_REQUIRED',
        drug,
        `${drug.generic_name} needs pharmacist review for the kidney information in your profile.`
      );
      if (item) warnings.push(item);
    }
    if (
      profile.liver_status === 'YES' ||
      (profile.liver_status === 'UNSURE' && rule.liver_action !== 'ALLOW')
    ) {
      const item = actionWarning(
        rule.liver_action,
        'LIVER_REVIEW_REQUIRED',
        drug,
        `${drug.generic_name} needs pharmacist review for the liver information in your profile.`
      );
      if (item) warnings.push(item);
    }
    if (
      profile.pregnancy_status === 'PREGNANT' ||
      (profile.pregnancy_status === 'UNSURE' && rule.pregnancy_action !== 'ALLOW')
    ) {
      const item = actionWarning(
        rule.pregnancy_action,
        'PREGNANCY_REVIEW_REQUIRED',
        drug,
        `${drug.generic_name} needs pharmacist review for pregnancy information in your profile.`
      );
      if (item) warnings.push(item);
    }
    if (profile.pregnancy_status === 'BREASTFEEDING') {
      const item = actionWarning(
        rule.breastfeeding_action,
        'BREASTFEEDING_REVIEW_REQUIRED',
        drug,
        `${drug.generic_name} needs pharmacist review for breastfeeding information in your profile.`
      );
      if (item) warnings.push(item);
    }
  }

  for (const interaction of interactions) {
    const type = String(interaction.interaction_type || 'SPACING').toUpperCase();
    const severity = String(interaction.severity || '').toLowerCase();
    if (!Number(interaction.is_verified)) {
      warnings.push({
        code: 'INTERACTION_RULE_REVIEW_REQUIRED',
        severity: 'blocking',
        drug_a_id: interaction.drug_a_id,
        drug_b_id: interaction.drug_b_id,
        message:
          'A known medicine interaction record has not completed licensed pharmacist review.',
      });
      continue;
    }
    if (type === 'NONE') continue;
    const blocking =
      type === 'AVOID' ||
      type === 'MONITOR' ||
      ['high', 'contraindicated'].includes(severity) ||
      (type === 'SPACING' && Number(interaction.min_gap_hours || 0) <= 0);
    warnings.push({
      code:
        type === 'AVOID' || severity === 'contraindicated'
          ? 'CONTRAINDICATED_INTERACTION'
          : type === 'MONITOR'
            ? 'INTERACTION_MONITORING_REQUIRED'
            : 'MEDICINE_INTERACTION',
      severity: blocking ? 'blocking' : 'warning',
      drug_a_id: interaction.drug_a_id,
      drug_b_id: interaction.drug_b_id,
      message: interaction.notes || `A ${severity || 'known'} medicine interaction needs review.`,
      min_gap_hours: Number(interaction.min_gap_hours || 0),
      interaction_type: type,
    });
  }

  return {
    can_schedule: !warnings.some((item) => item.severity === 'blocking'),
    missing_profile_fields: missing,
    warnings,
    evaluated: {
      age_years: age,
      weight_recorded: profile.weight_kg !== '',
      allergies: true,
      conditions: true,
      kidney: true,
      liver: true,
      pregnancy_breastfeeding: true,
      interactions: true,
      rule_versions: Object.fromEntries(
        medicines.map((drug) => [
          drug.drug_id,
          Number(rulesByDrug.get(String(drug.drug_id))?.rule_version || 0),
        ])
      ),
    },
  };
}
