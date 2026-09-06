import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { generateClinicalSchedule } from '../services/scheduleEngine.js';
import { recordAudit } from '../services/audit.js';
import { medicationChanged, scheduleChanged } from '../services/domainEvents.js';
import {
  normalizeDosageForm,
  parseStrength,
  validateIntakeRecord,
} from '../services/medicationIntake.js';
import { checkClinicalRule } from '../services/clinicalRuleVerification.js';
import { evaluateMedicationSafety } from '../services/medicationSafety.js';
import { serializeSafetyProfile } from '../services/patientSafetyProfile.js';

const router = Router();
router.use(requireAuth, requireRole('patient'));

const FOOD_LABELS = {
  WITH_MEAL: 'Take with a meal',
  EMPTY_STOMACH: 'Take on an empty stomach',
  BEFORE_MEAL: 'Take 30 minutes before a meal',
  AFTER_MEAL: 'Take 30 minutes after a meal',
  BEDTIME: 'Take at bedtime',
  NONE: 'No food instruction is stored in PharMate. Follow your medicine label or prescription.',
};

function treatmentDateKeys(startDate, endDate, maximumDays = 366) {
  if (!startDate) return [];
  if (!endDate) return [startDate];
  const dates = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (current <= end && dates.length < maximumDays) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}
const LABEL_FREQUENCIES = Object.freeze({
  QD: { daily: 1, interval: 0 },
  BID: { daily: 2, interval: 12 },
  TID: { daily: 3, interval: 0 },
  QID: { daily: 4, interval: 0 },
  Q4H: { daily: 6, interval: 4 },
  Q6H: { daily: 4, interval: 6 },
  Q8H: { daily: 3, interval: 8 },
  Q12H: { daily: 2, interval: 12 },
  BEDTIME: { daily: 1, interval: 0 },
  PRN: { daily: 0, interval: 0, prn: true },
});

const AUTHORITATIVE_REFERENCE_HOSTS = new Set([
  'dailymed.nlm.nih.gov',
  'fda.gov',
  'www.fda.gov',
  'accessdata.fda.gov',
  'www.accessdata.fda.gov',
]);

function hasAuthoritativeReference(value) {
  try {
    const url = new URL(String(value || ''));
    return (
      url.protocol === 'https:' && AUTHORITATIVE_REFERENCE_HOSTS.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function doseUnits(value) {
  const text = String(value || '').trim();
  const match =
    text.match(
      /(\d+(?:\.\d+)?)\s*(?:tablets?|capsules?|caplets?|doses?|drops?|puffs?|sprays?|mL|milliliters?|units?)\b/i
    ) || text.match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function prnLimitsFromDirections(value) {
  const text = String(value || '').toLowerCase();
  const interval = text.match(/every\s+(\d+(?:\.\d+)?)\s*hours?\b/);
  const maximum = text.match(
    /(?:do not exceed|do not take more than|not more than|maximum|max(?:imum)?\s+of)\D{0,24}(\d+)\s*(?:doses?|tablets?|capsules?|units?)?\s*(?:in|per|\/)?\s*(?:24\s*hours?|day)\b/
  );
  return {
    interval: interval ? Number(interval[1]) : null,
    daily: maximum ? Number(maximum[1]) : null,
  };
}

function foodRuleFromDirections(value) {
  const text = String(value || '').toLowerCase();
  if (!text || /with or without (food|meals?)/.test(text)) return 'NONE';
  if (/empty stomach/.test(text)) return 'EMPTY_STOMACH';
  if (/before (food|meals?|eating)/.test(text)) return 'BEFORE_MEAL';
  if (/after (food|meals?|eating)/.test(text)) return 'AFTER_MEAL';
  if (/with (food|meals?)|first bite/.test(text)) return 'WITH_MEAL';
  if (/at bedtime|before (going to )?bed/.test(text)) return 'BEDTIME';
  return 'NONE';
}

function idsFrom(body) {
  const records = Array.isArray(body?.medications) ? body.medications.slice(0, 25) : [];
  return records
    .map((record) => ({
      drug_id: String(record?.drug_id || ''),
      custom_strength: String(record?.custom_strength || '').trim(),
      medicine_name: String(record?.medicine_name || '').trim(),
      dosage_form: String(record?.dosage_form || '').trim(),
      dosage_instruction: String(record?.dosage_instruction || '').trim(),
      quantity_on_hand: record?.quantity_on_hand,
      quantity_unit: String(record?.quantity_unit || '').trim(),
      start_date: String(record?.start_date || '').trim(),
      label_direction: String(record?.label_direction || '').trim(),
      entry_method: String(record?.entry_method || 'MANUAL').toUpperCase(),
      ocr_confidence: record?.ocr_confidence,
      patient_confirmed: record?.patient_confirmed === true,
      label_frequency: String(record?.label_frequency || '')
        .trim()
        .toUpperCase(),
      label_food_instruction: String(record?.label_food_instruction || 'NONE')
        .trim()
        .toUpperCase(),
      purpose: String(record?.purpose || '').trim(),
      release_type_snapshot: String(record?.release_type_snapshot || '').trim(),
      refill_reminders_enabled: record?.refill_reminders_enabled === true,
      end_date: String(record?.end_date || '').trim(),
      first_dose_time: String(record?.first_dose_time || '').trim(),
      schedule_mode: String(record?.schedule_mode || '')
        .trim()
        .toUpperCase(),
    }))
    .filter((record) => /^[0-9a-f-]{36}$/i.test(record.drug_id));
}

async function loadRules(records, executor = pool) {
  if (!records.length) return [];
  const ids = [...new Set(records.map((record) => record.drug_id))];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await executor.execute(
    `SELECT id AS drug_id, generic_name, brand_names_json,
            common_strength AS default_strength,
            dosage_form,administration_route,release_type,supported_frequency_codes,
            frequency_default AS standard_frequency, food_rule,
            COALESCE(min_interval_hours, default_interval_hours, 0) AS min_interval_hours,
            max_daily_doses, default_units_per_dose, clinical_rationale, clinical_rule_status,
            administration_instruction,clinical_rationale,meal_instruction,guidance_do,guidance_dont,
            evidence_source_url, evidence_reviewed_at, rx_class,is_restricted
            ,catalog_status,clinical_source_name,source_revision_date,rule_version,
            (SELECT evidence.evidence_status FROM otc_label_evidence evidence
             WHERE evidence.drug_id=drug_reference.id AND evidence.population_key='ADULT'
             ORDER BY FIELD(evidence.evidence_status,'READY','REVIEWED','COLLECTED','MISSING'),
                      evidence.evidence_version DESC,evidence.updated_at DESC LIMIT 1)
              AS otc_evidence_status,
            (SELECT evidence.directions_text FROM otc_label_evidence evidence
             WHERE evidence.drug_id=drug_reference.id AND evidence.population_key='ADULT'
             ORDER BY FIELD(evidence.evidence_status,'READY','REVIEWED','COLLECTED','MISSING'),
                      evidence.evidence_version DESC,evidence.updated_at DESC LIMIT 1)
              AS reference_directions,
            (SELECT evidence.frequency_code FROM otc_label_evidence evidence
             WHERE evidence.drug_id=drug_reference.id AND evidence.population_key='ADULT'
             ORDER BY FIELD(evidence.evidence_status,'READY','REVIEWED','COLLECTED','MISSING'),
                      evidence.evidence_version DESC,evidence.updated_at DESC LIMIT 1)
              AS evidence_frequency_code
     FROM drug_reference
     WHERE availability = 1 AND id IN (${placeholders})`,
    ids
  );
  const requested = new Map(records.map((record) => [record.drug_id, record]));
  return rows.map((row) => {
    const request = requested.get(row.drug_id);
    const custom = request?.custom_strength;
    const suggested = request?.schedule_mode === 'SUGGESTED';
    const clinicalCheck = checkClinicalRule({
      ...row,
      common_strength: row.default_strength,
      frequency_default: row.standard_frequency,
    });
    const enteredStrength = parseStrength(custom || '');
    const verifiedStrength = parseStrength(row.default_strength || '');
    const formulationMatches =
      normalizeDosageForm(request?.dosage_form) === normalizeDosageForm(row.dosage_form) &&
      enteredStrength.value === verifiedStrength.value &&
      String(enteredStrength.unit || '').toLowerCase() ===
        String(verifiedStrength.unit || '').toLowerCase();
    const isOtc = String(row.rx_class || '').toUpperCase() === 'OTC';
    const doseAmountMatches =
      Number(row.default_units_per_dose || 0) > 0 &&
      doseUnits(request?.dosage_instruction) === Number(row.default_units_per_dose);
    const verifiedForSuggestion =
      isOtc &&
      row.catalog_status === 'VERIFIED' &&
      row.clinical_rule_status === 'VERIFIED' &&
      clinicalCheck.valid &&
      formulationMatches &&
      doseAmountMatches;
    const referenceEligible =
      row.catalog_status === 'VERIFIED' &&
      ['UNVERIFIED', 'IN_REVIEW'].includes(row.clinical_rule_status) &&
      clinicalCheck.valid &&
      formulationMatches &&
      isOtc &&
      Number(row.is_restricted || 0) === 0 &&
      String(row.administration_route || '').toUpperCase() !== 'INJECTION' &&
      doseAmountMatches &&
      row.otc_evidence_status === 'READY' &&
      String(row.reference_directions || '').trim() &&
      String(row.evidence_frequency_code || '').toUpperCase() ===
        String(row.standard_frequency || '').toUpperCase() &&
      hasAuthoritativeReference(row.evidence_source_url);
    const validated = validateIntakeRecord(
      suggested && (verifiedForSuggestion || referenceEligible)
        ? {
            ...request,
            label_frequency: row.standard_frequency,
            label_food_instruction: row.food_rule || 'NONE',
          }
        : request,
      row
    );
    return {
      ...row,
      strength: custom || row.default_strength,
      intake_error: validated.error || null,
      ...(validated.value || {}),
      food_instruction:
        row.administration_instruction || row.meal_instruction || FOOD_LABELS[row.food_rule],
      label_frequency: request?.label_frequency,
      label_food_instruction: request?.label_food_instruction,
      first_dose_time: suggested ? '' : request?.first_dose_time,
      schedule_mode: request?.schedule_mode,
      verified_for_suggestion: verifiedForSuggestion,
      reference_eligible: referenceEligible,
      raw_request: request,
    };
  });
}

async function loadApprovedPrescriptionDirections(patientId, items, executor = pool) {
  const ids = [
    ...new Set(items.filter((item) => item.rx_class === 'RX').map((item) => item.drug_id)),
  ];
  if (!patientId || !ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await executor.execute(
    `SELECT * FROM (
       SELECT medication.id,medication.drug_id,medication.frequency_code,
              medication.dosage_instruction,medication.label_direction,
              medication.food_instruction,medication.start_date,medication.end_date,
              medication.strength_value,medication.strength_unit,
              medication.dosage_form_snapshot,medication.quantity_on_hand,
              medication.quantity_unit,medication.purpose,
              ROW_NUMBER() OVER (
                PARTITION BY medication.drug_id
                ORDER BY medication.validated_at DESC,medication.updated_at DESC
              ) AS direction_rank
       FROM medications medication
       LEFT JOIN prescription_photos photo ON photo.id=medication.prescription_photo_id
       WHERE medication.patient_id=? AND medication.drug_id IN (${placeholders})
         AND medication.source='RX_VALIDATED' AND medication.status='active'
         AND medication.pharmacist_id IS NOT NULL AND medication.validated_at IS NOT NULL
         AND (medication.prescription_photo_id IS NULL OR photo.status='approved')
         AND medication.frequency_code IS NOT NULL
         AND TRIM(COALESCE(medication.dosage_instruction,''))<>''
     ) ranked WHERE direction_rank=1`,
    [patientId, ...ids]
  );
  return new Map(rows.map((row) => [String(row.drug_id), row]));
}

async function loadInteractions(items, executor = pool, patientId = null) {
  const selectedIds = [...new Set(items.map((item) => item.drug_id))];
  let ids = [...selectedIds];
  if (patientId) {
    const [currentRows] = await executor.execute(
      `SELECT DISTINCT drug_id FROM medications
       WHERE patient_id=? AND status='active' AND drug_id IS NOT NULL`,
      [patientId]
    );
    ids = [...new Set([...ids, ...currentRows.map((row) => row.drug_id)])];
  }
  if (ids.length < 2) return [];
  const placeholdersA = ids.map(() => '?').join(',');
  const placeholdersB = ids.map(() => '?').join(',');
  const selectedA = selectedIds.map(() => '?').join(',');
  const selectedB = selectedIds.map(() => '?').join(',');
  const [rows] = await executor.execute(
    `SELECT drug_a_id,drug_b_id,min_gap_hours,interaction_type,severity,notes,
            CASE WHEN is_provisional=0 AND verified_by IS NOT NULL AND verified_at IS NOT NULL
                 THEN 1 ELSE 0 END AS is_verified
     FROM drug_interactions
     WHERE drug_a_id IN (${placeholdersA}) AND drug_b_id IN (${placeholdersB})
       AND (drug_a_id IN (${selectedA}) OR drug_b_id IN (${selectedB}))`,
    [...ids, ...ids, ...selectedIds, ...selectedIds]
  );
  return rows;
}

async function loadSafetyAssessment(patientId, rules, interactions, executor = pool) {
  const [[profileRow]] = await executor.execute(
    'SELECT * FROM patient_safety_profiles WHERE patient_id=? LIMIT 1',
    [patientId]
  );
  const ids = [...new Set(rules.map((rule) => rule.drug_id))];
  const placeholders = ids.map(() => '?').join(',');
  const [safetyRules] = ids.length
    ? await executor.execute(
        `SELECT * FROM medication_safety_rules
         WHERE population_key='ADULT' AND drug_id IN (${placeholders})`,
        ids
      )
    : [[]];
  const profile = profileRow ? serializeSafetyProfile(profileRow) : null;
  let allInteractions = interactions;
  if (profile?.current_medicines) {
    const [catalog] = await executor.execute(
      `SELECT id,generic_name FROM drug_reference WHERE availability=1 ORDER BY generic_name`
    );
    const normalizedList = ` ${String(profile.current_medicines)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')} `;
    const profileDrugIds = catalog
      .filter((drug) => {
        const name = String(drug.generic_name || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
        return name.length >= 3 && normalizedList.includes(` ${name} `);
      })
      .map((drug) => drug.id);
    if (profileDrugIds.length && ids.length) {
      const selectedPlaceholders = ids.map(() => '?').join(',');
      const profilePlaceholders = profileDrugIds.map(() => '?').join(',');
      const [profileInteractions] = await executor.execute(
        `SELECT drug_a_id,drug_b_id,min_gap_hours,interaction_type,severity,notes,
                CASE WHEN is_provisional=0 AND verified_by IS NOT NULL AND verified_at IS NOT NULL
                     THEN 1 ELSE 0 END AS is_verified
         FROM drug_interactions WHERE
         ((drug_a_id IN (${selectedPlaceholders}) AND drug_b_id IN (${profilePlaceholders})) OR
          (drug_b_id IN (${selectedPlaceholders}) AND drug_a_id IN (${profilePlaceholders})))`,
        [...ids, ...profileDrugIds, ...ids, ...profileDrugIds]
      );
      const keyed = new Map(
        [...interactions, ...profileInteractions].map((item) => [
          [item.drug_a_id, item.drug_b_id].sort().join(':'),
          item,
        ])
      );
      allInteractions = [...keyed.values()];
    }
  }
  return evaluateMedicationSafety({
    profileRow,
    medicines: rules,
    safetyRules,
    interactions: allInteractions,
  });
}

async function generateFromRequest(body, executor = pool, patientId = null) {
  const scheduleMode = String(body?.schedule_mode || '')
    .trim()
    .toUpperCase();
  const requested = idsFrom(body).map((record) => ({ ...record, schedule_mode: scheduleMode }));
  if (!requested.length) return { error: 'Select at least one medication.', status: 400 };
  if (new Set(requested.map((item) => item.drug_id)).size !== requested.length) {
    return {
      error:
        'The same active ingredient was added more than once. Remove the duplicate medicine before continuing.',
      status: 409,
    };
  }
  const rules = await loadRules(requested, executor);
  const approvedPrescriptions = await loadApprovedPrescriptionDirections(
    patientId,
    rules,
    executor
  );
  if (patientId) {
    const [anchorRows] = await executor.execute(
      `SELECT wake_anchor,sleep_anchor,breakfast_anchor,lunch_anchor,dinner_anchor,profile_completed
       FROM patient_anchors WHERE patient_id=? LIMIT 1`,
      [patientId]
    );
    if (anchorRows[0]) {
      for (const rule of rules) {
        Object.assign(rule, anchorRows[0], {
          routine_source: Number(anchorRows[0].profile_completed)
            ? 'PATIENT_PROFILE'
            : 'DEFAULT_ROUTINE',
        });
      }
    }
  }
  if (
    new Set(requested.map((item) => item.drug_id)).size !==
    new Set(rules.map((item) => item.drug_id)).size
  ) {
    return { error: 'One or more selected medications are unavailable.', status: 400 };
  }
  for (const rule of rules) {
    if (String(rule.rx_class || '').toUpperCase() === 'RX') {
      const prescription = approvedPrescriptions.get(String(rule.drug_id));
      if (!prescription) {
        return {
          error: `${rule.generic_name} can only use exact directions from an approved prescription. Upload the prescription or ask your pharmacist to validate it first.`,
          status: 422,
        };
      }
      const prescriptionFrequency = String(prescription.frequency_code || '').toUpperCase();
      const prescriptionRule = LABEL_FREQUENCIES[prescriptionFrequency];
      if (!prescriptionRule) {
        return {
          error: `The approved directions for ${rule.generic_name} cannot be converted into recurring reminders. Ask your pharmacist to review the schedule.`,
          status: 422,
        };
      }
      const prescriptionDirections =
        prescription.label_direction || prescription.dosage_instruction;
      const prnLimits = prescriptionRule.prn
        ? prnLimitsFromDirections(prescriptionDirections)
        : null;
      Object.assign(rule, {
        prescription_medication_id: prescription.id,
        medicine_name: rule.generic_name,
        standard_frequency: prescriptionFrequency,
        label_frequency: prescriptionFrequency,
        dosage_instruction: prescription.dosage_instruction,
        label_direction: prescriptionDirections,
        prescription_directions: prescriptionDirections,
        start_date: prescription.start_date,
        end_date: prescription.end_date,
        strength_value: prescription.strength_value,
        strength_unit: prescription.strength_unit,
        strength:
          prescription.strength_value && prescription.strength_unit
            ? `${Number(prescription.strength_value)} ${prescription.strength_unit}`
            : rule.strength,
        dosage_form: prescription.dosage_form_snapshot || rule.dosage_form,
        quantity_on_hand: prescription.quantity_on_hand,
        quantity_unit: prescription.quantity_unit,
        purpose: prescription.purpose,
        max_daily_doses: prnLimits?.daily ?? prescriptionRule.daily,
        min_interval_hours: prnLimits?.interval ?? prescriptionRule.interval,
        food_rule: foodRuleFromDirections(
          `${prescription.food_instruction || ''} ${prescription.label_direction || ''}`
        ),
        food_instruction:
          prescription.food_instruction ||
          'Follow the food instructions on the approved prescription.',
        clinical_rule_status: 'PRESCRIPTION',
        schedule_basis: 'PRESCRIPTION_DIRECTIONS',
        rule_kind: prescriptionRule.prn ? 'PRN' : rule.rule_kind,
        intake_error: null,
      });
      continue;
    }
    if (scheduleMode === 'SUGGESTED') {
      if (!rule.verified_for_suggestion && !rule.reference_eligible) {
        const labelRule = LABEL_FREQUENCIES[rule.label_frequency];
        if (!labelRule) {
          return {
            error: `Tell PharMate how often you take ${rule.generic_name}.`,
            status: 422,
          };
        }
        if (rule.intake_error) return { error: rule.intake_error, status: 400 };
        rule.standard_frequency = rule.label_frequency;
        rule.max_daily_doses = labelRule.daily;
        rule.min_interval_hours = labelRule.interval;
        rule.rule_kind = labelRule.prn ? 'PRN' : rule.rule_kind;
        rule.food_rule = rule.label_food_instruction;
        rule.food_instruction = FOOD_LABELS[rule.label_food_instruction] || FOOD_LABELS.NONE;
        rule.clinical_rule_status = 'PATIENT_LABEL';
        rule.schedule_basis = 'PATIENT_LABEL';
        continue;
      }
      rule.food_instruction =
        rule.administration_instruction || rule.meal_instruction || FOOD_LABELS[rule.food_rule];
      rule.schedule_basis = rule.verified_for_suggestion
        ? 'VERIFIED_CLINICAL_RULE'
        : 'REFERENCE_REVIEW_REQUIRED';
      if (rule.reference_eligible) rule.clinical_rule_status = 'REFERENCE';
      if (rule.reference_eligible) rule.label_direction = rule.reference_directions;
      if (rule.intake_error) return { error: rule.intake_error, status: 400 };
      continue;
    }
    if (rule.intake_error) return { error: rule.intake_error, status: 400 };
    const clinicalCheck = checkClinicalRule({
      ...rule,
      common_strength: rule.default_strength,
      frequency_default: rule.standard_frequency,
    });
    const labelRule = LABEL_FREQUENCIES[rule.label_frequency];
    if (!labelRule) {
      return {
        error: `${rule.generic_name} does not use fixed suggested reminders. Create your own schedule for this medicine.`,
        status: 400,
      };
    }
    const hasVerifiedClinicalRule = clinicalCheck.valid && rule.clinical_rule_status === 'VERIFIED';
    const verifiedFoodRule = hasVerifiedClinicalRule && rule.food_rule !== 'NONE';
    const verifiedMinimumInterval = hasVerifiedClinicalRule
      ? Number(rule.min_interval_hours || 0)
      : 0;
    rule.standard_frequency = rule.label_frequency;
    rule.max_daily_doses = labelRule.daily;
    rule.min_interval_hours = Math.max(labelRule.interval, verifiedMinimumInterval);
    rule.rule_kind = labelRule.prn ? 'PRN' : rule.rule_kind;
    rule.food_rule = verifiedFoodRule ? rule.food_rule : rule.label_food_instruction;
    rule.food_instruction = verifiedFoodRule
      ? rule.food_instruction
      : FOOD_LABELS[rule.label_food_instruction] || FOOD_LABELS.NONE;
    rule.clinical_rule_status = 'PATIENT_LABEL';
    rule.schedule_basis = 'PATIENT_LABEL';
  }
  const interactions = await loadInteractions(rules, executor, patientId);
  const result = generateClinicalSchedule(rules, interactions);
  const safety = patientId
    ? await loadSafetyAssessment(patientId, rules, interactions, executor)
    : { can_schedule: true, warnings: [], evaluated: null, missing_profile_fields: [] };
  result.warnings = [...(result.warnings || []), ...(safety.warnings || [])];
  result.can_save = result.can_save && safety.can_schedule;
  result.safety_evaluation = safety.evaluated;
  result.missing_safety_profile_fields = safety.missing_profile_fields;
  result.medical_guarantee = false;
  result.disclaimer =
    'PharMate checks recorded rules and creates reminder times only. It does not guarantee that a medicine or schedule is medically safe, prescribe treatment, or replace a licensed clinician or pharmacist.';
  result.schedule_basis =
    scheduleMode === 'SUGGESTED'
      ? rules.some((rule) => rule.schedule_basis === 'PRESCRIPTION_DIRECTIONS')
        ? rules.some((rule) => rule.schedule_basis !== 'PRESCRIPTION_DIRECTIONS')
          ? 'MIXED_GOVERNED_DIRECTIONS'
          : 'PRESCRIPTION_DIRECTIONS'
        : rules.some((rule) => rule.schedule_basis === 'REFERENCE_REVIEW_REQUIRED')
          ? 'REFERENCE_REVIEW_REQUIRED'
          : rules.some((rule) => rule.schedule_basis === 'PATIENT_LABEL')
            ? 'PATIENT_LABEL'
            : 'VERIFIED_CLINICAL_RULE'
      : 'PATIENT_LABEL';
  result.requires_prescription_match = result.schedule_basis === 'REFERENCE_REVIEW_REQUIRED';
  result.requires_label_match = result.schedule_basis === 'REFERENCE_REVIEW_REQUIRED';
  result.rule_provenance = rules.map((rule) => ({
    drug_id: rule.drug_id,
    rule_version: Number(rule.rule_version || 1),
    evidence_source_url: rule.evidence_source_url,
    evidence_reviewed_at: rule.evidence_reviewed_at,
    basis: rule.schedule_basis,
    safety_rule_version: Number(safety.evaluated?.rule_versions?.[rule.drug_id] || 0),
  }));
  return { result, rules };
}

async function intakeFromRequest(body, executor = pool, patientId = null) {
  const requested = idsFrom(body);
  if (!requested.length) return { error: 'Select at least one medication.', status: 400 };
  if (new Set(requested.map((item) => item.drug_id)).size !== requested.length) {
    return {
      error:
        'The same active ingredient was added more than once. Remove the duplicate medicine before continuing.',
      status: 409,
    };
  }
  const rules = await loadRules(requested, executor);
  if (rules.length !== requested.length) {
    return { error: 'One or more selected medications are unavailable.', status: 400 };
  }
  for (const rule of rules) {
    if (String(rule.rx_class || '').toUpperCase() === 'RX') {
      const approved = await loadApprovedPrescriptionDirections(patientId, [rule], executor);
      if (!approved.has(String(rule.drug_id))) {
        return {
          error: `${rule.generic_name} requires exact directions from an approved prescription.`,
          status: 422,
        };
      }
      return {
        error: `${rule.generic_name} is already stored with its approved prescription directions. Add reminders from that prescription record.`,
        status: 409,
      };
    }
    if (rule.intake_error) return { error: rule.intake_error, status: 400 };
    rule.standard_frequency = rule.label_frequency;
    rule.food_instruction = FOOD_LABELS[rule.label_food_instruction] || FOOD_LABELS.NONE;
  }
  return { rules };
}

async function upsertMedicationIntakes(executor, patientId, rules) {
  const ids = rules.map((rule) => rule.drug_id);
  const placeholders = ids.map(() => '?').join(',');
  const [existing] = await executor.execute(
    `SELECT id, drug_id
     FROM (
       SELECT m.id, m.drug_id,
              ROW_NUMBER() OVER (
                PARTITION BY m.drug_id
                ORDER BY m.updated_at DESC, m.created_at DESC, m.id
              ) AS medicine_rank
       FROM medications m
       WHERE m.patient_id=? AND m.status='active' AND m.drug_id IN (${placeholders})
     ) ranked
     WHERE medicine_rank=1`,
    [patientId, ...ids]
  );
  const existingByDrug = new Map(existing.map((medicine) => [medicine.drug_id, medicine]));
  const medicationIds = new Map();
  const createdMedicationIds = new Set();

  for (const rule of rules) {
    const doseLimitBasis =
      rule.schedule_basis === 'PRESCRIPTION_DIRECTIONS'
        ? 'PRESCRIPTION_DIRECTIONS'
        : rule.schedule_basis === 'PATIENT_LABEL'
          ? 'PATIENT_LABEL'
          : rule.schedule_basis === 'REFERENCE_REVIEW_REQUIRED'
            ? 'REFERENCE_LABEL'
            : 'CLINICAL_RULE';
    if (rule.prescription_medication_id) {
      medicationIds.set(rule.drug_id, rule.prescription_medication_id);
      await executor.execute(
        `UPDATE medications
         SET max_daily_doses_snapshot=?,min_interval_hours_snapshot=?,dose_limit_basis=?
         WHERE id=? AND patient_id=?`,
        [
          Number(rule.max_daily_doses) || null,
          Number(rule.min_interval_hours) || null,
          doseLimitBasis,
          rule.prescription_medication_id,
          patientId,
        ]
      );
      continue;
    }
    const values = [
      rule.medicine_name || rule.generic_name,
      rule.brand_name,
      rule.strength_value,
      rule.strength_unit,
      rule.dosage_form,
      rule.release_type_snapshot,
      rule.standard_frequency,
      rule.standard_frequency,
      rule.dosage_instruction,
      rule.label_direction,
      rule.purpose,
      rule.food_instruction,
      rule.quantity_on_hand,
      rule.quantity_unit,
      rule.refill_reminders_enabled ? 1 : 0,
      rule.entry_method,
      rule.ocr_confidence,
      rule.patient_confirmed ? 1 : 0,
      rule.start_date,
      rule.end_date,
    ];
    const current = existingByDrug.get(rule.drug_id);
    if (current) {
      medicationIds.set(rule.drug_id, current.id);
      await executor.execute(
        `UPDATE medications
         SET drug_name_raw=?, brand_name_snapshot=?, strength_value=?, strength_unit=?,
             dosage_form_snapshot=?, release_type_snapshot=?, is_prn=?, frequency=?, frequency_code=?, dosage_instruction=?,
             label_direction=?, purpose=?, food_instruction=?, quantity_on_hand=?, quantity_unit=?,
             refill_reminders_enabled=?, entry_method=?, ocr_confidence=?, patient_confirmed=?, start_date=?, end_date=?, updated_at=NOW(3)
         WHERE id=? AND patient_id=?`,
        [...values.slice(0, 6), rule.is_prn ? 1 : 0, ...values.slice(6), current.id, patientId]
      );
      await executor.execute(
        `UPDATE medications
         SET max_daily_doses_snapshot=?,min_interval_hours_snapshot=?,dose_limit_basis=?
         WHERE id=? AND patient_id=?`,
        [
          Number(rule.max_daily_doses) || null,
          Number(rule.min_interval_hours) || null,
          doseLimitBasis,
          current.id,
          patientId,
        ]
      );
      continue;
    }
    const medicationId = uuidv4();
    medicationIds.set(rule.drug_id, medicationId);
    createdMedicationIds.add(medicationId);
    await executor.execute(
      `INSERT INTO medications
        (id,patient_id,drug_id,drug_name_raw,brand_name_snapshot,strength_value,
         strength_unit,dosage_form_snapshot,release_type_snapshot,source,is_prn,frequency,frequency_code,
         dosage_instruction,label_direction,purpose,food_instruction,quantity_on_hand,quantity_unit,
         refill_reminders_enabled,entry_method,ocr_confidence,patient_confirmed,start_date,end_date,status)
       VALUES (?,?,?,?,?,?,?,?,?,'OTC_SELF',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`,
      [
        medicationId,
        patientId,
        rule.drug_id,
        ...values.slice(0, 6),
        rule.is_prn ? 1 : 0,
        ...values.slice(6),
      ]
    );
    await executor.execute(
      `UPDATE medications
       SET max_daily_doses_snapshot=?,min_interval_hours_snapshot=?,dose_limit_basis=?
       WHERE id=? AND patient_id=?`,
      [
        Number(rule.max_daily_doses) || null,
        Number(rule.min_interval_hours) || null,
        doseLimitBasis,
        medicationId,
        patientId,
      ]
    );
  }
  return { medicationIds, createdMedicationIds };
}

router.get('/search', async (req, res) => {
  const query = String(req.query.q || '')
    .trim()
    .toLowerCase()
    .slice(0, 100);
  if (query.length < 2) return res.json([]);
  const like = `%${query}%`;
  const [rows] = await pool.execute(
    `SELECT id, generic_name, brand_names_json, dosage_form,administration_route,
            release_type,supported_frequency_codes,
            common_strength AS default_strength, frequency_default AS standard_frequency,
            food_rule, COALESCE(min_interval_hours, default_interval_hours, 0) AS min_interval_hours,
            max_daily_doses, clinical_rationale, clinical_rule_status, administration_instruction,
            meal_instruction, guidance_do, guidance_dont, common_uses, evidence_source_url,
            evidence_reviewed_at, rx_class,
            (SELECT safety_status FROM medication_safety_rules safety
             WHERE safety.drug_id=ranked.id AND safety.population_key='ADULT' LIMIT 1)
              AS safety_rule_status
            ,catalog_status,clinical_source_name,source_revision_date
     FROM (
       SELECT source_rows.*,
              ROW_NUMBER() OVER (
                PARTITION BY LOWER(TRIM(source_rows.generic_name))
                ORDER BY source_rows.clinical_rule_status DESC,
                         source_rows.is_provisional ASC,
                         source_rows.created_at ASC,
                         source_rows.id ASC
              ) AS catalog_rank
       FROM drug_reference source_rows
       WHERE source_rows.availability = 1
         AND (
           LOWER(source_rows.generic_name) LIKE ?
           OR LOWER(CAST(source_rows.brand_names_json AS CHAR)) LIKE ?
           OR (CHAR_LENGTH(?) >= 4 AND SOUNDEX(source_rows.generic_name) = SOUNDEX(?))
         )
     ) ranked
     WHERE catalog_rank = 1
     ORDER BY CASE WHEN LOWER(generic_name) = ? THEN 0
                   WHEN LOWER(generic_name) LIKE ? THEN 1 ELSE 2 END,
              clinical_rule_status DESC, generic_name
     LIMIT 20`,
    [like, like, query, query, query, `${query}%`]
  );
  res.json(
    rows.map((row) => ({
      ...row,
      food_instruction:
        row.administration_instruction || row.meal_instruction || FOOD_LABELS[row.food_rule],
      automation_ready:
        String(row.rx_class || '').toUpperCase() === 'OTC' &&
        row.safety_rule_status === 'VERIFIED' &&
        row.clinical_rule_status === 'VERIFIED' &&
        checkClinicalRule({
          ...row,
          common_strength: row.default_strength,
          frequency_default: row.standard_frequency,
        }).valid,
    }))
  );
});

router.post('/generate-schedule', async (req, res) => {
  const generated = await generateFromRequest(req.body, pool, req.user.sub);
  if (generated.error) return res.status(generated.status).json({ error: generated.error });
  if (!generated.result.can_save) {
    const blocking = generated.result.warnings?.find((item) => item.severity === 'blocking');
    return res.status(422).json({
      ...generated.result,
      error: blocking?.message || 'This schedule needs pharmacist review before it can be saved.',
    });
  }
  res.json(generated.result);
});

router.post('/save-intake', async (req, res) => {
  const conn = await pool.getConnection();
  let persisted;
  let rules;
  try {
    await conn.beginTransaction();
    const intake = await intakeFromRequest(req.body, conn, req.user.sub);
    if (intake.error) {
      await conn.rollback();
      return res.status(intake.status).json({ error: intake.error });
    }
    rules = intake.rules;
    persisted = await upsertMedicationIntakes(conn, req.user.sub, rules);
    await recordAudit({
      actor: { id: req.user.sub, role: 'patient' },
      action: 'MEDICATION_INTAKE_CONFIRMED',
      entityType: 'medication_intake',
      patientId: req.user.sub,
      metadata: { medication_count: rules.length },
      executor: conn,
    });
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  } finally {
    conn.release();
  }
  for (const rule of rules) {
    const medicationId = persisted.medicationIds.get(rule.drug_id);
    await medicationChanged(
      req.user.sub,
      persisted.createdMedicationIds.has(medicationId)
        ? 'MEDICATION_CREATED'
        : 'MEDICATION_UPDATED',
      medicationId,
      rule.generic_name
    );
  }
  res.status(201).json({
    message: 'Medicine information saved',
    medication_ids: [...persisted.medicationIds.values()],
  });
});

router.post('/save-reminders', async (req, res) => {
  if (req.body?.review_confirmed !== true) {
    return res.status(400).json({
      error: 'Review and confirm the complete schedule before saving.',
    });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const generated = await generateFromRequest(req.body, conn, req.user.sub);
    if (generated.error) {
      await conn.rollback();
      return res.status(generated.status).json({ error: generated.error });
    }
    if (!generated.result.can_save) {
      await conn.rollback();
      return res.status(409).json({
        error:
          'PharMate could not create reminder times that follow all the available instructions. Check your medicine label or prescription.',
        ...generated.result,
      });
    }
    if (
      generated.result.requires_label_match &&
      (req.body?.reference_review_confirmed !== true ||
        req.body?.prescription_match_confirmed !== true)
    ) {
      await conn.rollback();
      return res.status(400).json({
        error:
          'Confirm that you reviewed the reference schedule and that it matches the medicine label.',
      });
    }
    const { medicationIds, createdMedicationIds } = await upsertMedicationIntakes(
      conn,
      req.user.sub,
      generated.rules
    );
    const [[versionRow]] = await conn.execute(
      'SELECT COALESCE(MAX(schedule_version),0)+1 AS version FROM medication_schedules WHERE patient_id=?',
      [req.user.sub]
    );
    const rulesByDrug = new Map(generated.rules.map((rule) => [rule.drug_id, rule]));
    let count = 0;
    for (const group of generated.result.schedule) {
      for (const medicine of group.medicines) {
        const rule = rulesByDrug.get(medicine.drug_id);
        for (const treatmentDate of treatmentDateKeys(rule.start_date, rule.end_date)) {
          await conn.execute(
            `INSERT INTO medication_schedules
              (id,medication_id,patient_id,scheduled_time,generated_reason,schedule_source,
               clinical_rule_version,evidence_source_url,review_requirement,is_confirmed,
               schedule_version,status)
             VALUES (?,?,?,CONCAT(?, ' ', ?, ':00'),?,?,?,?,?,1,?,'scheduled')`,
            [
              uuidv4(),
              medicationIds.get(medicine.drug_id),
              req.user.sub,
              treatmentDate,
              group.time,
              medicine.rationale,
              rule.schedule_basis === 'REFERENCE_REVIEW_REQUIRED' ? 'REFERENCE' : 'SUGGESTED',
              Number(rule.rule_version || 1),
              rule.evidence_source_url,
              rule.schedule_basis === 'REFERENCE_REVIEW_REQUIRED'
                ? 'LABEL_MATCH_CONFIRMED'
                : rule.schedule_basis === 'PRESCRIPTION_DIRECTIONS'
                  ? 'PRESCRIPTION_DIRECTIONS'
                  : 'STANDARD_REVIEW',
              Number(versionRow.version),
            ]
          );
          count += 1;
        }
      }
    }
    await recordAudit({
      actor: { id: req.user.sub, role: 'patient' },
      action: 'AUTOMATED_SCHEDULE_CREATED',
      entityType: 'schedule',
      entityId: String(versionRow.version),
      patientId: req.user.sub,
      metadata: {
        medication_count: generated.rules.length,
        reminder_count: count,
        schedule_basis: generated.result.schedule_basis,
        prn_tracker_count: generated.result.prn_trackers?.length || 0,
        safety_evaluated: Boolean(generated.result.safety_evaluation),
      },
      executor: conn,
    });
    await conn.commit();
    for (const rule of generated.rules) {
      await medicationChanged(
        req.user.sub,
        createdMedicationIds.has(medicationIds.get(rule.drug_id))
          ? 'MEDICATION_CREATED'
          : 'MEDICATION_UPDATED',
        medicationIds.get(rule.drug_id),
        rule.generic_name
      );
    }
    await scheduleChanged(req.user.sub, Number(versionRow.version));
    res.status(201).json({
      message: count
        ? 'Schedule created successfully'
        : 'As-needed medicine saved without recurring reminders',
      count,
      version: Number(versionRow.version),
      schedule: generated.result.schedule,
      prn_trackers: generated.result.prn_trackers || [],
      medical_guarantee: false,
      disclaimer: generated.result.disclaimer,
    });
  } catch (error) {
    await conn.rollback();
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  } finally {
    conn.release();
  }
});

export default router;
