import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { generateClinicalSchedule } from '../services/scheduleEngine.js';
import { recordAudit } from '../services/audit.js';
import { medicationChanged, scheduleChanged } from '../services/domainEvents.js';
import { validateIntakeRecord } from '../services/medicationIntake.js';
import { checkClinicalRule } from '../services/clinicalRuleVerification.js';

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
});

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
            max_daily_doses, clinical_rationale, clinical_rule_status,
            administration_instruction,clinical_rationale,meal_instruction,guidance_do,guidance_dont,
            evidence_source_url, evidence_reviewed_at, rx_class
            ,catalog_status,clinical_source_name,source_revision_date
     FROM drug_reference
     WHERE availability = 1 AND id IN (${placeholders})`,
    ids
  );
  const requested = new Map(records.map((record) => [record.drug_id, record]));
  return rows.map((row) => {
    const request = requested.get(row.drug_id);
    const custom = request?.custom_strength;
    const validated = validateIntakeRecord(request, row);
    return {
      ...row,
      strength: custom || row.default_strength,
      intake_error: validated.error || null,
      ...(validated.value || {}),
      food_instruction:
        row.administration_instruction || row.meal_instruction || FOOD_LABELS[row.food_rule],
      label_frequency: request?.label_frequency,
      label_food_instruction: request?.label_food_instruction,
      first_dose_time: request?.first_dose_time,
    };
  });
}

async function loadInteractions(items, executor = pool) {
  const ids = [...new Set(items.map((item) => item.drug_id))];
  if (ids.length < 2) return [];
  const placeholdersA = ids.map(() => '?').join(',');
  const placeholdersB = ids.map(() => '?').join(',');
  const [rows] = await executor.execute(
    `SELECT drug_a_id, drug_b_id, min_gap_hours, severity, notes
     FROM drug_interactions
     WHERE is_provisional = 0
       AND drug_a_id IN (${placeholdersA}) AND drug_b_id IN (${placeholdersB})`,
    [...ids, ...ids]
  );
  return rows;
}

async function generateFromRequest(body, executor = pool) {
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
  if (
    new Set(requested.map((item) => item.drug_id)).size !==
    new Set(rules.map((item) => item.drug_id)).size
  ) {
    return { error: 'One or more selected medications are unavailable.', status: 400 };
  }
  for (const rule of rules) {
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
    rule.food_rule = verifiedFoodRule ? rule.food_rule : rule.label_food_instruction;
    rule.food_instruction = verifiedFoodRule
      ? rule.food_instruction
      : FOOD_LABELS[rule.label_food_instruction] || FOOD_LABELS.NONE;
    rule.clinical_rule_status = 'PATIENT_LABEL';
    rule.schedule_basis = 'PATIENT_LABEL';
  }
  const result = generateClinicalSchedule(rules, await loadInteractions(rules, executor));
  result.schedule_basis = 'PATIENT_LABEL';
  return { result, rules };
}

async function intakeFromRequest(body, executor = pool) {
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
             dosage_form_snapshot=?, release_type_snapshot=?, frequency=?, frequency_code=?, dosage_instruction=?,
             label_direction=?, purpose=?, food_instruction=?, quantity_on_hand=?, quantity_unit=?,
             refill_reminders_enabled=?, entry_method=?, ocr_confidence=?, patient_confirmed=?, start_date=?, end_date=?, updated_at=NOW(3)
         WHERE id=? AND patient_id=?`,
        [...values, current.id, patientId]
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
       VALUES (?,?,?,?,?,?,?,?,?,'OTC_SELF',0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active')`,
      [medicationId, patientId, rule.drug_id, ...values]
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
            evidence_reviewed_at, rx_class
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
  const generated = await generateFromRequest(req.body);
  if (generated.error) return res.status(generated.status).json({ error: generated.error });
  res.status(generated.result.can_save ? 200 : 422).json(generated.result);
});

router.post('/save-intake', async (req, res) => {
  const conn = await pool.getConnection();
  let persisted;
  let rules;
  try {
    await conn.beginTransaction();
    const intake = await intakeFromRequest(req.body, conn);
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
    const generated = await generateFromRequest(req.body, conn);
    if (generated.error) {
      await conn.rollback();
      return res.status(generated.status).json({ error: generated.error });
    }
    if (!generated.result.can_save) {
      await conn.rollback();
      return res
        .status(409)
        .json({
          error:
            'PharMate could not create reminder times that follow all the available instructions. Check your medicine label or prescription.',
          ...generated.result,
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
              (id,medication_id,patient_id,scheduled_time,generated_reason,schedule_source,is_confirmed,schedule_version,status)
             VALUES (?,?,?,CONCAT(?, ' ', ?, ':00'),?,'SUGGESTED',1,?,'scheduled')`,
            [
              uuidv4(),
              medicationIds.get(medicine.drug_id),
              req.user.sub,
              treatmentDate,
              group.time,
              medicine.rationale,
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
      metadata: { medication_count: generated.rules.length, reminder_count: count },
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
    res
      .status(201)
      .json({
        message: 'Schedule created successfully',
        count,
        version: Number(versionRow.version),
        schedule: generated.result.schedule,
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
