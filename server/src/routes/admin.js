/**
 * Admin routes (Sprint 7, D-5). Aggregate dashboard + CSV instruments.
 *
 * TC-05: nothing here exposes an individual name, condition, or clinical record —
 * only counts, throughput, anonymized adherence aggregates, and generic-drug
 * availability. CSV exports key on patient_code only.
 */
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { adherenceReport, doseLogReport, toCsv } from '../services/adherence.js';
import { updateOrderStatus } from '../services/orders.js';
import { recordAudit } from '../services/audit.js';
import { orderChanged } from '../services/domainEvents.js';
import { publishRole, publishUser } from '../services/realtimeEvents.js';
import { checkClinicalRule } from '../services/clinicalRuleVerification.js';
import { checkSafetyRule } from '../services/medicationSafety.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

// Aggregate-only validation results. Product names, patient IDs, recognized
// text, and images are deliberately excluded from the administrator response.
router.get('/ocr-validation', async (_req, res) => {
  const [[summary]] = await pool.execute(
    `SELECT COUNT(*) AS total_runs,
            COUNT(field_accuracy_pct) AS measured_runs,
            ROUND(AVG(field_accuracy_pct),2) AS field_accuracy_pct,
            ROUND(AVG(name_accuracy_pct),2) AS name_accuracy_pct,
            ROUND(AVG(strength_accuracy_pct),2) AS strength_accuracy_pct,
            ROUND(AVG(formulation_accuracy_pct),2) AS formulation_accuracy_pct,
            SUM(outcome='RECAPTURE_REQUIRED') AS recapture_runs,
            SUM(outcome='MANUAL_REVIEW') AS manual_review_runs,
            SUM(manual_correction_used=1) AS corrected_runs,
            SUM(offline_mode=1) AS offline_runs,
            ROUND(AVG(processing_ms),0) AS average_processing_ms,
            COUNT(DISTINCT NULLIF(CONCAT(confirmed_name,'|',confirmed_strength,'|',confirmed_formulation),'||'))
              AS distinct_packages
     FROM ocr_scan_evaluations WHERE purpose='MEDICINE_LABEL' AND sample_country='PH'`
  );
  const [quality] = await pool.execute(
    `SELECT image_quality,COUNT(*) AS runs,ROUND(AVG(field_accuracy_pct),2) AS accuracy_pct
     FROM ocr_scan_evaluations
     WHERE purpose='MEDICINE_LABEL' AND sample_country='PH'
     GROUP BY image_quality ORDER BY runs DESC`
  );
  const [devices] = await pool.execute(
    `SELECT device_platform,device_model,COUNT(*) AS runs,
            SUM(offline_mode=1) AS offline_runs,ROUND(AVG(field_accuracy_pct),2) AS accuracy_pct,
            ROUND(AVG(processing_ms),0) AS average_processing_ms
     FROM ocr_scan_evaluations
     WHERE purpose='MEDICINE_LABEL' AND sample_country='PH'
     GROUP BY device_platform,device_model ORDER BY runs DESC LIMIT 100`
  );
  const numericSummary = Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [key, value == null ? null : Number(value)])
  );
  res.json({
    measured: Number(summary.measured_runs) > 0,
    methodology: 'Corrected medicine name, strength, and formulation compared with on-device ML Kit output.',
    confidence_threshold: 0.75,
    summary: numericSummary,
    quality: quality.map((row) => ({
      image_quality: row.image_quality,
      runs: Number(row.runs),
      accuracy_pct: row.accuracy_pct == null ? null : Number(row.accuracy_pct),
    })),
    devices: devices.map((row) => ({
      ...row,
      runs: Number(row.runs),
      offline_runs: Number(row.offline_runs),
      accuracy_pct: row.accuracy_pct == null ? null : Number(row.accuracy_pct),
      average_processing_ms:
        row.average_processing_ms == null ? null : Number(row.average_processing_ms),
    })),
  });
});

const GOVERNANCE_SELECT = `
  SELECT drug.id,drug.generic_name,drug.common_strength,drug.dosage_form,
         drug.administration_route,drug.release_type,drug.supported_frequency_codes,
         drug.frequency_default,drug.max_daily_doses,drug.default_units_per_dose,
         COALESCE(drug.min_interval_hours,drug.default_interval_hours) AS min_interval_hours,
         drug.food_rule,drug.administration_instruction,drug.clinical_rationale,
         drug.guidance_do,drug.guidance_dont,drug.evidence_source_url,
         drug.clinical_source_name,drug.source_revision_date,drug.evidence_reviewed_at,
         drug.rx_class,drug.catalog_status,drug.clinical_rule_status,drug.rule_version,
         evidence.id AS evidence_id,evidence.directions_text,evidence.schedule_type,
         evidence.units_per_dose,evidence.evidence_status,evidence.evidence_version,
         evidence.registration_number,evidence.evidence_notes,
         safety.id AS safety_rule_id,safety.allergy_terms_json,safety.condition_rules_json,
         safety.minimum_age_years,safety.maximum_age_years,
         safety.minimum_weight_kg,safety.maximum_weight_kg,
         safety.age_reviewed,safety.weight_reviewed,safety.allergies_reviewed,
         safety.conditions_reviewed,safety.interactions_reviewed,
         safety.pregnancy_action,safety.breastfeeding_action,
         safety.kidney_action,safety.liver_action,safety.source_name AS safety_source_name,
         safety.source_url AS safety_source_url,
         safety.source_revision_date AS safety_source_revision_date,
         safety.evidence_notes AS safety_evidence_notes,safety.safety_status,
         safety.rule_version AS safety_rule_version
  FROM drug_reference drug
  LEFT JOIN otc_label_evidence evidence
    ON evidence.drug_id=drug.id AND evidence.population_key='ADULT'
  LEFT JOIN medication_safety_rules safety
    ON safety.drug_id=drug.id AND safety.population_key='ADULT'`;

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function governancePayload(row) {
  const clinical = checkClinicalRule(row);
  const safety = checkSafetyRule(row);
  const isPrescription = row.rx_class === 'RX';
  const effectiveStatus = isPrescription
    ? 'PATIENT_SPECIFIC_DIRECTIONS'
    : row.clinical_rule_status === 'VERIFIED' && row.safety_status === 'VERIFIED' && clinical.valid && safety.valid
      ? 'READY'
      : row.clinical_rule_status === 'IN_REVIEW' || row.safety_status === 'IN_REVIEW'
        ? 'IN_REVIEW'
        : 'INCOMPLETE';
  return {
    ...row,
    supported_frequency_codes: parseJsonArray(row.supported_frequency_codes),
    allergy_terms: parseJsonArray(row.allergy_terms_json),
    condition_rules: parseJsonArray(row.condition_rules_json),
    clinical_consistency: clinical,
    safety_consistency: safety,
    effective_status: effectiveStatus,
  };
}

// Administrator evidence preparation. Pharmacists remain the only role allowed
// to verify a clinical rule; an admin submission enters their existing queue.
router.get('/rule-governance', async (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase().slice(0, 100);
  const params = [];
  let where = ' WHERE drug.availability=1';
  if (query) {
    where += ' AND LOWER(drug.generic_name) LIKE ?';
    params.push(`%${query}%`);
  }
  const [rows] = await pool.execute(
    `${GOVERNANCE_SELECT}${where} ORDER BY drug.rx_class='OTC' DESC,drug.generic_name LIMIT 500`,
    params
  );
  const medicines = rows.map(governancePayload);
  res.json({
    summary: {
      total: medicines.length,
      ready: medicines.filter((item) => item.effective_status === 'READY').length,
      in_review: medicines.filter((item) => item.effective_status === 'IN_REVIEW').length,
      incomplete: medicines.filter((item) => item.effective_status === 'INCOMPLETE').length,
      prescription_specific: medicines.filter(
        (item) => item.effective_status === 'PATIENT_SPECIFIC_DIRECTIONS'
      ).length,
      prn: medicines.filter((item) => item.schedule_type === 'PRN_TRACKER').length,
    },
    medicines,
  });
});

router.get('/rule-governance/:id/history', async (req, res) => {
  const [adminRows] = await pool.execute(
    `SELECT revision.id,revision.rule_version,revision.action,revision.validation_result,
            revision.reason,revision.created_at,user.role AS actor_role,user.email AS actor
     FROM rule_governance_revisions revision
     JOIN users user ON user.id=revision.actor_user_id
     WHERE revision.drug_id=?`,
    [req.params.id]
  );
  const [clinicalRows] = await pool.execute(
    `SELECT revision.id,revision.rule_version,revision.action,revision.consistency_result AS validation_result,
            revision.reason,revision.created_at,'pharmacist' AS actor_role,
            pharmacist.full_name AS actor,revision.reviewer_license_number,
            revision.reviewer_license_jurisdiction,revision.reviewer_license_expires_on
     FROM clinical_rule_revisions revision
     JOIN pharmacists pharmacist ON pharmacist.id=revision.reviewed_by
     WHERE revision.drug_id=?`,
    [req.params.id]
  );
  res.json(
    [...adminRows, ...clinicalRows].sort(
      (left, right) => new Date(right.created_at) - new Date(left.created_at)
    )
  );
});

router.put('/rule-governance/:id', async (req, res) => {
  const action = String(req.body?.action || 'SAVE_DRAFT').toUpperCase();
  if (!['SAVE_DRAFT', 'SUBMIT'].includes(action)) {
    return res.status(400).json({ error: 'action must be SAVE_DRAFT or SUBMIT' });
  }
  const codes = [
    ...new Set(
      (Array.isArray(req.body?.supported_frequency_codes)
        ? req.body.supported_frequency_codes
        : String(req.body?.supported_frequency_codes || '').split(',')
      )
        .map((code) => String(code).trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
  const allergyTerms = [
    ...new Set(
      (Array.isArray(req.body?.allergy_terms)
        ? req.body.allergy_terms
        : String(req.body?.allergy_terms || '').split(',')
      )
        .map((term) => String(term).trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  const conditionRules = Array.isArray(req.body?.condition_rules)
    ? req.body.condition_rules
        .map((item) => ({
          term: String(item?.term || '').trim().toLowerCase(),
          action: ['ALLOW', 'REVIEW', 'BLOCK'].includes(String(item?.action || '').toUpperCase())
            ? String(item.action).toUpperCase()
            : 'REVIEW',
          message: String(item?.message || '').trim().slice(0, 500),
        }))
        .filter((item) => item.term)
    : [];
  const clinicalFields = {
    common_strength: String(req.body?.common_strength || '').trim(),
    dosage_form: String(req.body?.dosage_form || '').trim(),
    administration_route: String(req.body?.administration_route || '').trim().toUpperCase(),
    release_type: String(req.body?.release_type || '').trim().toUpperCase(),
    supported_frequency_codes: codes,
    frequency_default: String(req.body?.frequency_default || '').trim().toUpperCase(),
    max_daily_doses: req.body?.max_daily_doses === '' ? null : Number(req.body?.max_daily_doses),
    default_units_per_dose:
      req.body?.units_per_dose === '' ? null : Number(req.body?.units_per_dose),
    min_interval_hours:
      req.body?.min_interval_hours === '' ? null : Number(req.body?.min_interval_hours),
    food_rule: String(req.body?.food_rule || 'NONE').trim().toUpperCase(),
    administration_instruction: String(req.body?.administration_instruction || '').trim(),
    clinical_rationale: String(req.body?.clinical_rationale || '').trim(),
    guidance_do: String(req.body?.guidance_do || '').trim(),
    guidance_dont: String(req.body?.guidance_dont || '').trim(),
    evidence_source_url: String(req.body?.evidence_source_url || '').trim(),
    clinical_source_name: String(req.body?.clinical_source_name || '').trim(),
    source_revision_date: req.body?.source_revision_date || null,
    evidence_reviewed_at: req.body?.evidence_reviewed_at || null,
  };
  const safetyFields = {
    allergy_terms_json: allergyTerms,
    condition_rules_json: conditionRules,
    minimum_age_years:
      req.body?.minimum_age_years === '' ? null : Number(req.body?.minimum_age_years),
    maximum_age_years:
      req.body?.maximum_age_years === '' ? null : Number(req.body?.maximum_age_years),
    minimum_weight_kg:
      req.body?.minimum_weight_kg === '' ? null : Number(req.body?.minimum_weight_kg),
    maximum_weight_kg:
      req.body?.maximum_weight_kg === '' ? null : Number(req.body?.maximum_weight_kg),
    age_reviewed: req.body?.age_reviewed ? 1 : 0,
    weight_reviewed: req.body?.weight_reviewed ? 1 : 0,
    allergies_reviewed: req.body?.allergies_reviewed ? 1 : 0,
    conditions_reviewed: req.body?.conditions_reviewed ? 1 : 0,
    interactions_reviewed: req.body?.interactions_reviewed ? 1 : 0,
    pregnancy_action: String(req.body?.pregnancy_action || '').toUpperCase() || null,
    breastfeeding_action: String(req.body?.breastfeeding_action || '').toUpperCase() || null,
    kidney_action: String(req.body?.kidney_action || '').toUpperCase() || null,
    liver_action: String(req.body?.liver_action || '').toUpperCase() || null,
    source_name: String(req.body?.safety_source_name || '').trim(),
    source_url: String(req.body?.safety_source_url || '').trim(),
    source_revision_date: req.body?.safety_source_revision_date || null,
    evidence_notes: String(req.body?.safety_evidence_notes || '').trim(),
  };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[current]] = await conn.execute(`${GOVERNANCE_SELECT} WHERE drug.id=? FOR UPDATE`, [
      req.params.id,
    ]);
    if (!current) {
      await conn.rollback();
      return res.status(404).json({ error: 'Medicine not found' });
    }
    if (action === 'SUBMIT' && current.rx_class !== 'OTC') {
      await conn.rollback();
      return res.status(422).json({
        error: 'Prescription medicines use approved patient-specific directions, not a catalog schedule.',
      });
    }
    const clinicalCandidate = {
      ...current,
      ...clinicalFields,
      supported_frequency_codes: clinicalFields.supported_frequency_codes,
    };
    const safetyCandidate = { ...current, ...safetyFields };
    const clinicalValidation = checkClinicalRule(clinicalCandidate);
    const safetyValidation = checkSafetyRule(safetyCandidate);
    if (action === 'SUBMIT' && (!clinicalValidation.valid || !safetyValidation.valid)) {
      await conn.rollback();
      return res.status(422).json({
        error: 'Complete every clinical, evidence, and patient-safety field before submitting.',
        clinical_consistency: clinicalValidation,
        safety_consistency: safetyValidation,
      });
    }
    const nextVersion = Math.max(
      Number(current.rule_version || 1),
      Number(current.safety_rule_version || 1)
    ) + 1;
    const clinicalStatus = action === 'SUBMIT' ? 'IN_REVIEW' : 'UNVERIFIED';
    const safetyStatus = action === 'SUBMIT' ? 'IN_REVIEW' : 'DRAFT';
    await conn.execute(
      `UPDATE drug_reference SET common_strength=?,dosage_form=?,administration_route=?,release_type=?,
       supported_frequency_codes=?,frequency_default=?,max_daily_doses=?,default_units_per_dose=?,min_interval_hours=?,
       food_rule=?,administration_instruction=?,clinical_rationale=?,guidance_do=?,guidance_dont=?,
       evidence_source_url=?,clinical_source_name=?,source_revision_date=?,evidence_reviewed_at=?,
       clinical_rule_status=?,verified_by=NULL,verified_at=NULL,rule_version=? WHERE id=?`,
      [
        clinicalFields.common_strength,
        clinicalFields.dosage_form,
        clinicalFields.administration_route || null,
        clinicalFields.release_type || null,
        JSON.stringify(codes),
        clinicalFields.frequency_default || null,
        clinicalFields.max_daily_doses,
        clinicalFields.default_units_per_dose,
        clinicalFields.min_interval_hours,
        clinicalFields.food_rule,
        clinicalFields.administration_instruction || null,
        clinicalFields.clinical_rationale || null,
        clinicalFields.guidance_do || null,
        clinicalFields.guidance_dont || null,
        clinicalFields.evidence_source_url || null,
        clinicalFields.clinical_source_name || null,
        clinicalFields.source_revision_date,
        clinicalFields.evidence_reviewed_at,
        clinicalStatus,
        nextVersion,
        current.id,
      ]
    );
    await conn.execute(
      `INSERT INTO medication_safety_rules
       (id,drug_id,population_key,allergy_terms_json,condition_rules_json,
        minimum_age_years,maximum_age_years,minimum_weight_kg,maximum_weight_kg,
        age_reviewed,weight_reviewed,allergies_reviewed,conditions_reviewed,interactions_reviewed,
        pregnancy_action,breastfeeding_action,kidney_action,liver_action,
        source_name,source_url,source_revision_date,evidence_notes,safety_status,rule_version,
        prepared_by_user_id,submitted_at)
       VALUES (?,?, 'ADULT',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
               CASE WHEN ?='IN_REVIEW' THEN NOW(3) ELSE NULL END)
       ON DUPLICATE KEY UPDATE allergy_terms_json=VALUES(allergy_terms_json),
       condition_rules_json=VALUES(condition_rules_json),minimum_age_years=VALUES(minimum_age_years),
       maximum_age_years=VALUES(maximum_age_years),minimum_weight_kg=VALUES(minimum_weight_kg),
       maximum_weight_kg=VALUES(maximum_weight_kg),age_reviewed=VALUES(age_reviewed),
       weight_reviewed=VALUES(weight_reviewed),allergies_reviewed=VALUES(allergies_reviewed),
       conditions_reviewed=VALUES(conditions_reviewed),interactions_reviewed=VALUES(interactions_reviewed),
       pregnancy_action=VALUES(pregnancy_action),breastfeeding_action=VALUES(breastfeeding_action),
       kidney_action=VALUES(kidney_action),liver_action=VALUES(liver_action),source_name=VALUES(source_name),
       source_url=VALUES(source_url),source_revision_date=VALUES(source_revision_date),
       evidence_notes=VALUES(evidence_notes),safety_status=VALUES(safety_status),
       rule_version=VALUES(rule_version),prepared_by_user_id=VALUES(prepared_by_user_id),
       submitted_at=VALUES(submitted_at),verified_by=NULL,verified_at=NULL`,
      [
        uuidv4(),
        current.id,
        JSON.stringify(allergyTerms),
        JSON.stringify(conditionRules),
        safetyFields.minimum_age_years,
        safetyFields.maximum_age_years,
        safetyFields.minimum_weight_kg,
        safetyFields.maximum_weight_kg,
        safetyFields.age_reviewed,
        safetyFields.weight_reviewed,
        safetyFields.allergies_reviewed,
        safetyFields.conditions_reviewed,
        safetyFields.interactions_reviewed,
        safetyFields.pregnancy_action,
        safetyFields.breastfeeding_action,
        safetyFields.kidney_action,
        safetyFields.liver_action,
        safetyFields.source_name || null,
        safetyFields.source_url || null,
        safetyFields.source_revision_date,
        safetyFields.evidence_notes || null,
        safetyStatus,
        nextVersion,
        req.user.sub,
        safetyStatus,
      ]
    );
    if (current.rx_class === 'OTC') {
      const scheduleType = String(req.body?.schedule_type || '').toUpperCase() || null;
      await conn.execute(
        `INSERT INTO otc_label_evidence
         (id,drug_id,population_key,registration_number,directions_text,schedule_type,
          frequency_code,units_per_dose,min_interval_hours,max_daily_doses,food_rule,
          source_authority,source_url,source_revision_date,evidence_status,evidence_version,
          evidence_notes,prepared_by_user_id,submitted_at)
         VALUES (?,?, 'ADULT',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
                 CASE WHEN ?='IN_REVIEW' THEN NOW(3) ELSE NULL END)
         ON DUPLICATE KEY UPDATE registration_number=VALUES(registration_number),
         directions_text=VALUES(directions_text),schedule_type=VALUES(schedule_type),
         frequency_code=VALUES(frequency_code),units_per_dose=VALUES(units_per_dose),
         min_interval_hours=VALUES(min_interval_hours),max_daily_doses=VALUES(max_daily_doses),
         food_rule=VALUES(food_rule),source_authority=VALUES(source_authority),
         source_url=VALUES(source_url),source_revision_date=VALUES(source_revision_date),
         evidence_status=VALUES(evidence_status),evidence_version=VALUES(evidence_version),
         evidence_notes=VALUES(evidence_notes),prepared_by_user_id=VALUES(prepared_by_user_id),
         submitted_at=VALUES(submitted_at)`,
        [
          current.evidence_id || uuidv4(),
          current.id,
          String(req.body?.registration_number || '').trim() || null,
          String(req.body?.directions_text || '').trim() || null,
          scheduleType,
          clinicalFields.frequency_default || null,
          req.body?.units_per_dose === '' ? null : Number(req.body?.units_per_dose),
          clinicalFields.min_interval_hours,
          clinicalFields.max_daily_doses,
          clinicalFields.food_rule,
          clinicalFields.clinical_source_name || null,
          clinicalFields.evidence_source_url || null,
          clinicalFields.source_revision_date,
          action === 'SUBMIT' ? 'REVIEWED' : 'COLLECTED',
          nextVersion,
          String(req.body?.evidence_notes || '').trim() || null,
          req.user.sub,
          clinicalStatus,
        ]
      );
    }
    await conn.execute(
      `UPDATE medication_rule_variants SET strength=?,dosage_form=?,administration_route=?,
       release_type=?,supported_frequency_codes=?,frequency_code=?,daily_dose_count=?,
       min_interval_hours=?,max_daily_doses=?,food_rule=?,administration_instruction=?,
       clinical_rationale=?,guidance_do=?,guidance_dont=?,source_name=?,source_url=?,
       source_revision_date=?,evidence_reviewed_at=?,schedule_rule_status=?,rule_version=?,
       automation_status='NEEDS_EVIDENCE',
       automation_block_reason='Awaiting pharmacist review of clinical and safety evidence',
       assessed_at=NOW(3),reviewed_by=NULL,verified_at=NULL WHERE drug_id=?`,
      [
        clinicalFields.common_strength,
        clinicalFields.dosage_form,
        clinicalFields.administration_route || null,
        clinicalFields.release_type || null,
        JSON.stringify(codes),
        clinicalFields.frequency_default || null,
        clinicalFields.max_daily_doses,
        clinicalFields.min_interval_hours,
        clinicalFields.max_daily_doses,
        clinicalFields.food_rule,
        clinicalFields.administration_instruction || null,
        clinicalFields.clinical_rationale || null,
        clinicalFields.guidance_do || null,
        clinicalFields.guidance_dont || null,
        clinicalFields.clinical_source_name || null,
        clinicalFields.evidence_source_url || null,
        clinicalFields.source_revision_date,
        clinicalFields.evidence_reviewed_at,
        clinicalStatus,
        nextVersion,
        current.id,
      ]
    );
    const after = { clinical: clinicalFields, safety: safetyFields };
    await conn.execute(
      `INSERT INTO rule_governance_revisions
       (id,drug_id,rule_version,action,before_data,after_data,validation_result,actor_user_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        uuidv4(),
        current.id,
        nextVersion,
        action === 'SUBMIT' ? 'SUBMITTED' : 'DRAFT_SAVED',
        JSON.stringify(governancePayload(current)),
        JSON.stringify(after),
        JSON.stringify({ clinical: clinicalValidation, safety: safetyValidation }),
        req.user.sub,
      ]
    );
    await recordAudit({
      actor: { id: req.user.sub, role: 'admin' },
      action: action === 'SUBMIT' ? 'RULE_EVIDENCE_SUBMITTED' : 'RULE_EVIDENCE_DRAFT_SAVED',
      entityType: 'drug_reference',
      entityId: current.id,
      metadata: { rule_version: nextVersion },
      executor: conn,
    });
    await conn.commit();
    publishRole('pharmacist', 'FORMULARY_UPDATED', {
      action: action === 'SUBMIT' ? 'rule_submitted' : 'rule_draft_saved',
      drug_id: current.id,
    });
    res.json({
      id: current.id,
      status: clinicalStatus,
      rule_version: nextVersion,
      clinical_consistency: clinicalValidation,
      safety_consistency: safetyValidation,
    });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

// Privacy-safe immutable activity feed. Metadata must contain identifiers and
// operational state only; patient names, diagnoses and prescription content are
// deliberately never selected here.
router.get('/audit-events', async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
  const [rows] = await pool.execute(
    `SELECT ae.id, ae.actor_role, ae.action, ae.entity_type, ae.entity_id,
            ae.metadata_json, ae.created_at, p.patient_code
     FROM audit_events ae
     LEFT JOIN patients p ON p.id = ae.patient_id
     ORDER BY ae.created_at DESC LIMIT ?`,
    [limit]
  );
  res.json(
    rows.map((row) => ({
      ...row,
      metadata:
        typeof row.metadata_json === 'string'
          ? JSON.parse(row.metadata_json || '{}')
          : row.metadata_json || {},
      metadata_json: undefined,
    }))
  );
});

function countByStatus(rows) {
  const out = {};
  for (const r of rows) out[r.status] = r.c;
  return out;
}

// ── GET /api/admin/aggregates ─────────────────────────────────────────────────
router.get('/aggregates', async (_req, res) => {
  const [[patients]] = await pool.execute('SELECT COUNT(*) AS c FROM patients');
  const [[meds]] = await pool.execute(
    "SELECT COUNT(*) AS c FROM medications WHERE status = 'active'"
  );
  const [refills] = await pool.execute(
    'SELECT status, COUNT(*) AS c FROM refill_requests GROUP BY status'
  );
  const [deliveries] = await pool.execute(
    'SELECT status, COUNT(*) AS c FROM delivery_requests GROUP BY status'
  );
  const [[adh]] = await pool.execute(
    `SELECT COUNT(*) AS scheduled,
            SUM(status IN ('taken','taken_late')) AS taken,
            COUNT(DISTINCT patient_id) AS patients
     FROM medication_schedules`
  );
  const [[followups]] = await pool.execute(
    "SELECT COUNT(*) AS c FROM caregiver_alerts WHERE channel = 'pharmacist' AND status = 'unseen'"
  );

  res.json({
    patients: patients.c,
    active_medications: meds.c,
    refills: countByStatus(refills),
    deliveries: countByStatus(deliveries),
    adherence: {
      scheduled: adh.scheduled,
      taken: Number(adh.taken ?? 0),
      average_pct: adh.scheduled
        ? Number(((Number(adh.taken ?? 0) / adh.scheduled) * 100).toFixed(1))
        : null,
      patients_measured: adh.patients,
    },
    no_caregiver_followups_open: followups.c,
  });
});

// ── GET /api/admin/medicines ──────────────────────────────────────────────────
// Generic-drug availability management (not PII).
router.get('/medicines', async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, generic_name, common_strength, dosage_form, short_description,
            rx_class, availability, stock_quantity, is_restricted, is_provisional
     FROM drug_reference ORDER BY generic_name`
  );
  res.json(rows);
});

// ── POST /api/admin/medicines ────────────────────────────────────────────────
router.post('/medicines', async (req, res) => {
  const genericName = String(req.body?.generic_name || '').trim();
  const strength = String(req.body?.common_strength || '').trim();
  const form = String(req.body?.dosage_form || '').trim();
  const description = String(req.body?.short_description || '').trim();
  const rxClass = req.body?.rx_class === 'OTC' ? 'OTC' : 'RX';
  const stock = Number(req.body?.stock_quantity);
  if (!genericName || !strength || !form || !description) {
    return res.status(400).json({ error: 'Name, strength, form, and description are required' });
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
    return res.status(400).json({ error: 'Stock must be a whole number between 0 and 1,000,000' });
  }
  const [[duplicate]] = await pool.execute(
    'SELECT id FROM drug_reference WHERE LOWER(generic_name) = LOWER(?) AND common_strength = ? LIMIT 1',
    [genericName, strength]
  );
  if (duplicate) return res.status(409).json({ error: 'This medicine and strength already exist' });
  const id = uuidv4();
  await pool.execute(
    `INSERT INTO drug_reference
       (id, generic_name, common_strength, dosage_form, short_description,
        rx_class, availability, stock_quantity, is_provisional)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [id, genericName, strength, form, description, rxClass, stock > 0 ? 1 : 0, stock]
  );
  await pool.execute(
    `INSERT INTO medication_rule_variants
       (id,drug_id,strength,dosage_form,schedule_rule_status,rule_version)
     VALUES (?,?,?,?, 'UNVERIFIED',1)`,
    [uuidv4(), id, strength, form]
  );
  await pool.execute(
    `INSERT INTO medication_safety_rules
       (id,drug_id,population_key,allergy_terms_json,evidence_notes)
     VALUES (?,?, 'ADULT',JSON_ARRAY(?),
             'Complete every safety domain in Rule Governance before submission.')`,
    [uuidv4(), id, genericName.toLowerCase()]
  );
  if (rxClass === 'OTC') {
    await pool.execute(
      `INSERT INTO otc_label_evidence
       (id,drug_id,population_key,evidence_status,evidence_notes)
       VALUES (?,?, 'ADULT','MISSING',
               'Add the exact registered product label in Rule Governance.')`,
      [uuidv4(), id]
    );
  }
  await recordAudit({
    actor: { id: req.user.sub, role: 'admin' },
    action: 'FORMULARY_MEDICINE_CREATED',
    entityType: 'drug_reference',
    entityId: id,
    metadata: { generic_name: genericName },
  });
  publishRole('pharmacist', 'FORMULARY_UPDATED', { action: 'created', drug_id: id });
  res.status(201).json({ id });
});

// ── PUT /api/admin/medicines/:id ─────────────────────────────────────────────
router.put('/medicines/:id', async (req, res) => {
  const genericName = String(req.body?.generic_name || '').trim();
  const strength = String(req.body?.common_strength || '').trim();
  const form = String(req.body?.dosage_form || '').trim();
  const description = String(req.body?.short_description || '').trim();
  const rxClass = req.body?.rx_class === 'OTC' ? 'OTC' : 'RX';
  const stock = Number(req.body?.stock_quantity);
  if (!genericName || !strength || !form || !description) {
    return res.status(400).json({ error: 'Name, strength, form, and description are required' });
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
    return res.status(400).json({ error: 'Stock must be a whole number between 0 and 1,000,000' });
  }
  const [result] = await pool.execute(
    `UPDATE drug_reference
     SET generic_name = ?, common_strength = ?, dosage_form = ?, short_description = ?,
         rx_class = ?, stock_quantity = ?, availability = ?
     WHERE id = ?`,
    [genericName, strength, form, description, rxClass, stock, stock > 0 ? 1 : 0, req.params.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Medicine not found' });
  await pool.execute(
    `UPDATE medication_rule_variants SET strength=?,dosage_form=?,schedule_rule_status='UNVERIFIED'
     WHERE drug_id=?`,
    [strength, form, req.params.id]
  );
  await recordAudit({
    actor: { id: req.user.sub, role: 'admin' },
    action: 'FORMULARY_MEDICINE_UPDATED',
    entityType: 'drug_reference',
    entityId: req.params.id,
  });
  publishRole('pharmacist', 'FORMULARY_UPDATED', { action: 'updated', drug_id: req.params.id });
  res.json({ id: req.params.id });
});

// Delete only unused references; patient medication history must never be erased.
router.delete('/medicines/:id', async (req, res) => {
  const [[usage]] = await pool.execute(
    'SELECT COUNT(*) AS count FROM medications WHERE drug_id = ?',
    [req.params.id]
  );
  if (Number(usage.count) > 0) {
    return res.status(409).json({
      error: 'This medicine is in use and cannot be deleted. Set its stock to 0 instead.',
    });
  }
  const [result] = await pool.execute('DELETE FROM drug_reference WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Medicine not found' });
  await recordAudit({
    actor: { id: req.user.sub, role: 'admin' },
    action: 'FORMULARY_MEDICINE_DELETED',
    entityType: 'drug_reference',
    entityId: req.params.id,
  });
  publishRole('pharmacist', 'FORMULARY_UPDATED', { action: 'deleted', drug_id: req.params.id });
  res.status(204).end();
});

// ── PUT /api/admin/medicines/:id/availability ─────────────────────────────────
router.put('/medicines/:id/availability', async (req, res) => {
  const available = req.body?.available ? 1 : 0;
  const [r] = await pool.execute('UPDATE drug_reference SET availability = ? WHERE id = ?', [
    available,
    req.params.id,
  ]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'Medicine not found' });
  await recordAudit({
    actor: { id: req.user.sub, role: 'admin' },
    action: 'FORMULARY_AVAILABILITY_UPDATED',
    entityType: 'drug_reference',
    entityId: req.params.id,
    metadata: { availability: Boolean(available) },
  });
  publishRole('pharmacist', 'FORMULARY_UPDATED', {
    action: 'availability',
    drug_id: req.params.id,
    availability: Boolean(available),
  });
  publishRole('admin', 'INVENTORY_UPDATED', {
    drug_id: req.params.id,
    availability: Boolean(available),
  });
  publishRole('pharmacist', 'INVENTORY_UPDATED', {
    drug_id: req.params.id,
    availability: Boolean(available),
  });
  res.json({ id: req.params.id, availability: available });
});

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// ── GET /api/admin/export/adherence.csv ───────────────────────────────────────
router.get('/export/adherence.csv', async (_req, res) => {
  const rows = await adherenceReport();
  const headers = [
    'patient_code',
    'scheduled',
    'taken',
    'taken_late',
    'missed',
    'adherence_pct',
    'streak',
  ];
  sendCsv(res, 'adherence.csv', toCsv(headers, rows));
});

// ── GET /api/admin/export/dose-logs.csv ───────────────────────────────────────
router.get('/export/dose-logs.csv', async (_req, res) => {
  const rows = await doseLogReport();
  const headers = [
    'patient_code',
    'drug',
    'scheduled_time',
    'logged_at',
    'status',
    'confirmation_method',
  ];
  sendCsv(res, 'dose-logs.csv', toCsv(headers, rows));
});

// ── GET /api/admin/export/surveys.csv?instrument=sus|tam ───────────────────────
router.get('/export/surveys.csv', async (req, res) => {
  const instrument = req.query.instrument === 'tam' ? 'tam' : 'sus';
  const table = instrument === 'tam' ? 'tam_responses' : 'sus_responses';
  const [rows] = await pool.execute(
    `SELECT id, role, responses_json, submitted_at FROM ${table} ORDER BY submitted_at ASC`
  );
  // Flatten responses_json into q-columns; union all keys for a stable header.
  const qKeys = new Set();
  const flat = rows.map((r) => {
    const answers =
      typeof r.responses_json === 'string' ? JSON.parse(r.responses_json) : r.responses_json;
    Object.keys(answers || {}).forEach((k) => qKeys.add(k));
    return { id: r.id, role: r.role, submitted_at: r.submitted_at, ...answers };
  });
  const headers = ['id', 'role', 'submitted_at', ...[...qKeys].sort()];
  sendCsv(res, `${instrument}.csv`, toCsv(headers, flat));
});

// ── GET /api/admin/users?role= ────────────────────────────────────────────────
// User management (Fig 51). Pseudonymous — patients by patient_code, staff by
// role; never a name (TC-05).
router.get('/users', async (req, res) => {
  const role = req.query.role;
  const params = [];
  let where = '';
  if (['patient', 'pharmacist', 'caregiver', 'admin'].includes(role)) {
    where = 'WHERE u.role = ?';
    params.push(role);
  }
  const [rows] = await pool.execute(
    `SELECT u.id, u.role, u.is_active, u.created_at, p.patient_code
     FROM users u LEFT JOIN patients p ON p.id = u.id
     ${where} ORDER BY u.created_at DESC LIMIT 200`,
    params
  );
  res.json(
    rows.map((r) => ({
      id: r.id,
      role: r.role,
      label: r.patient_code || `${r.role}-${String(r.id).slice(0, 8)}`,
      is_active: r.is_active,
      created_at: r.created_at,
    }))
  );
});

// ── PUT /api/admin/users/:id/active ───────────────────────────────────────────
router.put('/users/:id/active', async (req, res) => {
  const active = req.body?.active ? 1 : 0;
  const [r] = await pool.execute('UPDATE users SET is_active = ? WHERE id = ?', [
    active,
    req.params.id,
  ]);
  if (r.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
  await recordAudit({
    actor: { id: req.user.sub, role: 'admin' },
    action: 'USER_ACTIVE_STATUS_UPDATED',
    entityType: 'user',
    entityId: req.params.id,
    metadata: { is_active: Boolean(active) },
  });
  publishUser(req.params.id, 'ACCOUNT_STATUS_CHANGED', { is_active: Boolean(active) });
  res.json({ id: req.params.id, is_active: active });
});

// Pharmacist credential review is deliberately separate from account status.
// An active pharmacist-role account cannot sign a clinical decision until an
// administrator records an independently checked, unexpired license.
router.get('/pharmacist-credentials', async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT pharmacist.id,pharmacist.full_name,pharmacist.license_number,
            pharmacist.license_jurisdiction,pharmacist.license_status,
            pharmacist.license_expires_on,pharmacist.license_evidence_url,
            pharmacist.license_verified_at,user.is_active
     FROM pharmacists pharmacist
     JOIN users user ON user.id=pharmacist.id
     ORDER BY FIELD(pharmacist.license_status,'PENDING','EXPIRED','SUSPENDED','VERIFIED'),
              pharmacist.full_name`
  );
  res.json({
    summary: {
      total: rows.length,
      verified: rows.filter((row) => row.license_status === 'VERIFIED').length,
      pending: rows.filter((row) => row.license_status === 'PENDING').length,
      blocked: rows.filter((row) => ['SUSPENDED', 'EXPIRED'].includes(row.license_status)).length,
    },
    pharmacists: rows,
    verification_portal: 'https://verification.prc.gov.ph/',
    notice:
      'Credential status is an administrative record. Confirm the license independently with the issuing regulator before marking it verified.',
  });
});

router.put('/pharmacist-credentials/:id', async (req, res) => {
  const status = String(req.body?.license_status || 'PENDING').trim().toUpperCase();
  if (!['PENDING', 'VERIFIED', 'SUSPENDED', 'EXPIRED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid credential status' });
  }
  const licenseNumber = String(req.body?.license_number || '').trim().slice(0, 100);
  const jurisdiction = String(req.body?.license_jurisdiction || '').trim().slice(0, 100);
  const evidenceUrl = String(req.body?.license_evidence_url || '').trim().slice(0, 1000);
  const expiresOn = String(req.body?.license_expires_on || '').trim();
  if (evidenceUrl && !/^https:\/\//i.test(evidenceUrl)) {
    return res.status(400).json({ error: 'Credential evidence must use an HTTPS URL' });
  }
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
    return res.status(400).json({ error: 'Enter a valid license expiry date' });
  }
  if (status === 'VERIFIED') {
    if (!licenseNumber || !jurisdiction || !evidenceUrl || !expiresOn) {
      return res.status(422).json({
        error:
          'License number, jurisdiction, regulator evidence, and expiry date are required to verify a pharmacist.',
      });
    }
    const expiry = new Date(`${expiresOn}T23:59:59Z`);
    if (Number.isNaN(expiry.getTime()) || expiry < new Date()) {
      return res.status(422).json({ error: 'An expired license cannot be marked verified' });
    }
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[current]] = await conn.execute(
      `SELECT id,license_status FROM pharmacists WHERE id=? FOR UPDATE`,
      [req.params.id]
    );
    if (!current) {
      await conn.rollback();
      return res.status(404).json({ error: 'Pharmacist not found' });
    }
    await conn.execute(
      `UPDATE pharmacists
       SET license_number=?,license_jurisdiction=?,license_status=?,license_expires_on=?,
           license_evidence_url=?,
           license_verified_at=CASE WHEN ?='VERIFIED' THEN NOW(3) ELSE license_verified_at END,
           license_verified_by=CASE WHEN ?='VERIFIED' THEN ? ELSE license_verified_by END
       WHERE id=?`,
      [
        licenseNumber || null,
        jurisdiction || null,
        status,
        expiresOn || null,
        evidenceUrl || null,
        status,
        status,
        req.user.sub,
        req.params.id,
      ]
    );
    await recordAudit({
      actor: { id: req.user.sub, role: 'admin' },
      action: 'PHARMACIST_CREDENTIAL_STATUS_UPDATED',
      entityType: 'pharmacist_credential',
      entityId: req.params.id,
      metadata: {
        from: current.license_status,
        to: status,
        jurisdiction: jurisdiction || null,
        expires_on: expiresOn || null,
        evidence_recorded: Boolean(evidenceUrl),
      },
      executor: conn,
    });
    await conn.commit();
    publishUser(req.params.id, 'PHARMACIST_CREDENTIAL_CHANGED', { license_status: status });
    res.json({ id: req.params.id, license_status: status });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
});

// ── GET /api/admin/orders ─────────────────────────────────────────────────────
// Orders management (Fig 53). No payment amount (D-4). Patient by code only.
router.get('/orders', async (_req, res) => {
  const [refills] = await pool.execute(
    `SELECT r.id, 'refill' AS kind, r.status, r.requested_at, r.updated_at,
            p.patient_code, m.drug_name_raw AS drug, m.source, dr.rx_class,
            b.name AS branch
     FROM refill_requests r JOIN patients p ON p.id = r.patient_id
     JOIN medications m ON m.id = r.medication_id
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     JOIN pharmacy_branches b ON b.id = r.branch_id
     ORDER BY r.requested_at DESC LIMIT 100`
  );
  const [deliveries] = await pool.execute(
    `SELECT d.id, 'delivery' AS kind, d.status, d.requested_at, d.updated_at,
            p.patient_code, m.drug_name_raw AS drug, m.source, dr.rx_class,
            b.name AS branch
     FROM delivery_requests d JOIN patients p ON p.id = d.patient_id
     JOIN medications m ON m.id = d.medication_id
     LEFT JOIN drug_reference dr ON dr.id = m.drug_id
     JOIN pharmacy_branches b ON b.id = d.branch_id
     ORDER BY d.requested_at DESC LIMIT 100`
  );
  const all = [...refills, ...deliveries].sort(
    (a, b) => new Date(b.requested_at) - new Date(a.requested_at)
  );
  const counts = {
    total: all.length,
    pending: 0,
    processing: 0,
    ready: 0,
    out_for_delivery: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const o of all) {
    if (Object.hasOwn(counts, o.status)) counts[o.status]++;
    if (o.status === 'delivered' || o.status === 'ready') counts.completed++;
  }
  res.json({ counts, orders: all.slice(0, 100) });
});

// ── POST /api/admin/orders/:kind/:id/status ──────────────────────────────────
// Admins coordinate fulfilment, but cannot skip or reverse operational stages.
// Prescription approval remains in the pharmacist validation workspace; an Rx
// request can only exist here after the service-level prescription gate passes.
router.post('/orders/:kind/:id/status', async (req, res) => {
  const { kind, id } = req.params;
  if (!['refill', 'delivery'].includes(kind)) {
    return res.status(400).json({ error: 'kind must be refill or delivery' });
  }

  const table = kind === 'delivery' ? 'delivery_requests' : 'refill_requests';
  const [[order]] = await pool.execute(`SELECT status, patient_id FROM ${table} WHERE id = ?`, [
    id,
  ]);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const requestedStatus = String(req.body?.status || '');
  const transitions =
    kind === 'delivery'
      ? {
          pending: ['processing', 'cancelled'],
          processing: ['out_for_delivery', 'cancelled'],
          out_for_delivery: ['delivered', 'cancelled'],
        }
      : {
          pending: ['processing', 'cancelled'],
          processing: ['ready', 'cancelled'],
        };
  if (!(transitions[order.status] || []).includes(requestedStatus)) {
    return res.status(409).json({
      error: `Cannot move a ${kind} order from ${order.status} to ${requestedStatus}`,
    });
  }

  const result = await updateOrderStatus(kind, id, requestedStatus);
  if (result.error === 'bad_status') return res.status(400).json({ error: 'Invalid status' });
  if (result.error === 'not_found') return res.status(404).json({ error: 'Order not found' });
  await recordAudit({
    actor: { id: req.user.sub, role: 'admin' },
    action: 'ORDER_STATUS_UPDATED',
    entityType: `${kind}_order`,
    entityId: id,
    patientId: order.patient_id,
    metadata: { from: order.status, to: requestedStatus },
  });
  await orderChanged({ patientId: order.patient_id, kind, orderId: id, status: requestedStatus });
  res.json(result);
});

// ── GET /api/admin/alerts ─────────────────────────────────────────────────────
// Unified, privacy-safe operations feed. It combines adherence, fulfilment,
// inventory, prescription, and account conditions without exposing names,
// diagnoses, addresses, or prescription images.
router.get('/alerts', async (_req, res) => {
  const [adherence] = await pool.execute(
    `SELECT ca.id, ca.channel, ca.status, ca.created_at, p.patient_code,
            m.drug_name_raw AS drug, ms.scheduled_time
     FROM caregiver_alerts ca JOIN patients p ON p.id = ca.patient_id
     LEFT JOIN medication_schedules ms ON ms.id = ca.schedule_id
     LEFT JOIN medications m ON m.id = ms.medication_id
     ORDER BY ca.created_at DESC LIMIT 100`
  );
  const [refills] = await pool.execute(
    `SELECT r.id, r.status, r.requested_at AS created_at, p.patient_code,
            m.drug_name_raw AS drug
     FROM refill_requests r JOIN patients p ON p.id = r.patient_id
     JOIN medications m ON m.id = r.medication_id
     WHERE r.status IN ('pending','processing') ORDER BY r.requested_at DESC LIMIT 50`
  );
  const [deliveries] = await pool.execute(
    `SELECT d.id, d.status, d.requested_at AS created_at, p.patient_code,
            m.drug_name_raw AS drug
     FROM delivery_requests d JOIN patients p ON p.id = d.patient_id
     JOIN medications m ON m.id = d.medication_id
     WHERE d.status IN ('pending','processing','out_for_delivery')
     ORDER BY d.requested_at DESC LIMIT 50`
  );
  const [inventory] = await pool.execute(
    `SELECT id, generic_name, stock_quantity, created_at
     FROM drug_reference WHERE stock_quantity <= 10
     ORDER BY stock_quantity ASC, generic_name LIMIT 50`
  );
  const [prescriptions] = await pool.execute(
    `SELECT pp.id, pp.status, pp.created_at, p.patient_code, m.drug_name_raw AS drug
     FROM prescription_photos pp JOIN medications m ON m.id = pp.medication_id
     JOIN patients p ON p.id = m.patient_id
     WHERE pp.status IN ('pending','needs_clearer')
     ORDER BY pp.created_at DESC LIMIT 50`
  );
  const [[accounts]] = await pool.execute(
    `SELECT COUNT(*) AS count, MAX(created_at) AS created_at
     FROM users WHERE is_active = 0`
  );

  const now = Date.now();
  const ageSeverity = (createdAt, warningHours = 24) =>
    now - new Date(createdAt).getTime() >= warningHours * 3600000 ? 'critical' : 'warning';
  const alerts = [
    ...adherence.map((row) => ({
      id: `adherence:${row.id}`,
      type: 'adherence',
      severity: row.status === 'unseen' ? 'critical' : 'info',
      title: `${row.patient_code} missed ${row.drug || 'a scheduled dose'}`,
      description: `Follow-up is assigned to the ${row.channel} channel.`,
      status: row.status,
      patient_code: row.patient_code,
      created_at: row.created_at,
      navigate_to: '/admin/alerts',
    })),
    ...refills.map((row) => ({
      id: `refill:${row.id}`,
      type: 'order',
      severity: ageSeverity(row.created_at),
      title: `${row.status === 'pending' ? 'Refill waiting for acceptance' : 'Refill being prepared'}`,
      description: `${row.patient_code} · ${row.drug}`,
      status: row.status,
      patient_code: row.patient_code,
      created_at: row.created_at,
      navigate_to: '/admin/orders',
    })),
    ...deliveries.map((row) => ({
      id: `delivery:${row.id}`,
      type: 'order',
      severity: ageSeverity(row.created_at),
      title:
        row.status === 'out_for_delivery'
          ? 'Delivery currently in transit'
          : 'Delivery requires processing',
      description: `${row.patient_code} · ${row.drug}`,
      status: row.status,
      patient_code: row.patient_code,
      created_at: row.created_at,
      navigate_to: '/admin/orders',
    })),
    ...inventory.map((row) => ({
      id: `inventory:${row.id}`,
      type: 'inventory',
      severity: Number(row.stock_quantity) === 0 ? 'critical' : 'warning',
      title:
        Number(row.stock_quantity) === 0
          ? `${row.generic_name} is out of stock`
          : `${row.generic_name} is running low`,
      description: `${Number(row.stock_quantity)} units currently available.`,
      status: Number(row.stock_quantity) === 0 ? 'out_of_stock' : 'low_stock',
      created_at: row.created_at,
      navigate_to: '/admin/medicines',
    })),
    ...prescriptions.map((row) => ({
      id: `prescription:${row.id}`,
      type: 'prescription',
      severity: row.status === 'needs_clearer' ? 'critical' : ageSeverity(row.created_at, 12),
      title:
        row.status === 'needs_clearer'
          ? 'Prescription needs patient resubmission'
          : 'Prescription awaiting pharmacist review',
      description: `${row.patient_code} · ${row.drug}`,
      status: row.status,
      patient_code: row.patient_code,
      created_at: row.created_at,
      navigate_to: '/admin/alerts',
    })),
  ];
  if (Number(accounts.count) > 0) {
    alerts.push({
      id: 'accounts:inactive',
      type: 'account',
      severity: 'info',
      title: `${Number(accounts.count)} inactive account${Number(accounts.count) === 1 ? '' : 's'}`,
      description: 'Review account status in User Management.',
      status: 'inactive',
      created_at: accounts.created_at || new Date(),
      navigate_to: '/admin/users',
    });
  }
  alerts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const counts = alerts.reduce(
    (result, alert) => {
      result.total += 1;
      result[alert.severity] = (result[alert.severity] || 0) + 1;
      result[alert.type] = (result[alert.type] || 0) + 1;
      return result;
    },
    { total: 0, critical: 0, warning: 0, info: 0 }
  );
  res.json({ counts, alerts: alerts.slice(0, 200) });
});

// ── GET /api/admin/adherence-trend?days= ──────────────────────────────────────
// Per-day adherence for the dashboard chart (anonymized aggregate).
router.get('/adherence-trend', async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 30);
  const [rows] = await pool.execute(
    `SELECT DATE(scheduled_time) AS d, COUNT(*) AS scheduled,
            SUM(status IN ('taken','taken_late')) AS taken
     FROM medication_schedules
     GROUP BY DATE(scheduled_time) ORDER BY d DESC LIMIT ${days}`
  );
  res.json(
    rows.reverse().map((r) => ({
      date: r.d,
      pct: r.scheduled ? Math.round((Number(r.taken) / r.scheduled) * 100) : null,
    }))
  );
});

// ── GET /api/admin/priority ───────────────────────────────────────────────────
// Priority-token overview (PART 3, PART 4 flag 4): AGGREGATE COUNTS ONLY. Admin
// never sees a per-patient priority list or any clinical reason column — that is
// the pharmacist's ID-only roster, not the admin's. Priority is the boolean
// priority_flag derived from prescription validation (PART 2).
router.get('/priority', async (_req, res) => {
  const [[c]] = await pool.execute(
    `SELECT SUM(priority_flag = 1) AS priority,
            SUM(priority_flag = 0) AS standard,
            COUNT(*)              AS total
     FROM patients`
  );
  const [[chats]] = await pool.execute(
    `SELECT COUNT(*) AS total,
            SUM(priority = 'high' AND status = 'open') AS priority_open,
            SUM(priority = 'high') AS priority_total,
            SUM(priority = 'normal' AND status = 'open') AS standard_open
     FROM inquiry_threads`
  );
  const [activity] = await pool.execute(
    `SELECT DATE(opened_at) AS date,
            SUM(priority = 'high') AS priority,
            SUM(priority = 'normal') AS standard
     FROM inquiry_threads
     WHERE opened_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(opened_at) ORDER BY date`
  );
  res.json({
    priority: Number(c.priority ?? 0),
    standard: Number(c.standard ?? 0),
    total: Number(c.total ?? 0),
    chats: {
      total: Number(chats.total ?? 0),
      priority_open: Number(chats.priority_open ?? 0),
      priority_total: Number(chats.priority_total ?? 0),
      standard_open: Number(chats.standard_open ?? 0),
    },
    activity: activity.map((row) => ({
      date: row.date,
      priority: Number(row.priority ?? 0),
      standard: Number(row.standard ?? 0),
    })),
    reward_policy: [
      { day: 3, tokens: 1 },
      { day: 6, tokens: 1 },
      { day: 7, tokens: 2 },
    ],
  });
});

export default router;
