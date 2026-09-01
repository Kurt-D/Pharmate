import 'dotenv/config';
import { pool } from './connection.js';
import { checkClinicalRule } from '../services/clinicalRuleVerification.js';

const [medicines] = await pool.execute(
  `SELECT id,generic_name,common_strength,dosage_form,administration_route,release_type,
          supported_frequency_codes,catalog_status,clinical_rule_status,frequency_default,
          max_daily_doses,COALESCE(min_interval_hours,default_interval_hours) AS min_interval_hours,
          food_rule,administration_instruction,clinical_rationale,guidance_do,guidance_dont,
          evidence_source_url,clinical_source_name,source_revision_date,evidence_reviewed_at
   FROM drug_reference WHERE availability=1 ORDER BY generic_name`
);
const summaryOnly = process.argv.includes('--summary');
const [variantRows] = await pool.execute(
  `SELECT drug_id,COUNT(*) AS count FROM medication_rule_variants GROUP BY drug_id`
);
const [duplicateVariants] = await pool.execute(
  `SELECT drug_id,COALESCE(strength,'(missing)') AS strength,
          COALESCE(dosage_form,'(missing)') AS dosage_form,COUNT(*) AS count
   FROM medication_rule_variants
   GROUP BY drug_id,strength,dosage_form HAVING COUNT(*)>1`
);

const variantsByDrug = new Map(variantRows.map((row) => [row.drug_id, Number(row.count)]));
const checked = medicines.map((medicine) => ({ medicine, result: checkClinicalRule(medicine) }));
const hasAnchor = (medicine) => ['WITH_MEAL','EMPTY_STOMACH','BEFORE_MEAL','AFTER_MEAL','BEDTIME']
  .includes(String(medicine.food_rule || ''));
const incompleteCatalog = checked.filter(({ medicine }) => medicine.catalog_status !== 'VERIFIED');
const verified = checked.filter(({ medicine, result }) => medicine.clinical_rule_status === 'VERIFIED' && result.valid);
const invalidVerified = checked.filter(({ medicine, result }) => medicine.clinical_rule_status === 'VERIFIED' && !result.valid);
const missingEvidence = checked.filter(({ result }) => result.missing_fields.some((field) =>
  ['evidence_source_url','clinical_source_name','source_revision_date','evidence_reviewed_at'].includes(field)));
const missingIntervals = checked.filter(({ medicine }) => !hasAnchor(medicine)
  && !(Number(medicine.min_interval_hours) > 0));
const contradictory = checked.filter(({ result }) => result.conflicts.some((code) =>
  ['daily_limit_does_not_match_frequency','minimum_interval_exceeds_frequency_interval',
    'frequency_not_in_supported_codes'].includes(code)));
const invalidLinks = checked.filter(({ medicine }) => medicine.evidence_source_url
  && !/^https:\/\//i.test(String(medicine.evidence_source_url)));
const missingRuleRecords = checked.filter(({ medicine }) => !variantsByDrug.has(medicine.id));

const report = {
  generated_at: new Date().toISOString(),
  read_only: true,
  summary: {
    total_catalog_medicines: medicines.length,
    complete_catalog_entries: medicines.length - incompleteCatalog.length,
    rule_records: variantRows.length,
    missing_rule_records: missingRuleRecords.length,
    verified_scheduling_rules: verified.length,
    unverified_rules: medicines.filter((row) => row.clinical_rule_status === 'UNVERIFIED').length,
    rules_in_review: medicines.filter((row) => row.clinical_rule_status === 'IN_REVIEW').length,
    rejected_rules: medicines.filter((row) => row.clinical_rule_status === 'REJECTED').length,
    retired_rules: medicines.filter((row) => row.clinical_rule_status === 'RETIRED').length,
    invalid_verified_rules: invalidVerified.length,
    missing_evidence: missingEvidence.length,
    missing_intervals: missingIntervals.length,
    contradictory_frequency_limits: contradictory.length,
    duplicate_variants: duplicateVariants.length,
    invalid_source_links: invalidLinks.length,
    eligible_for_rule_based_scheduling: verified.length,
    limited_to_label_or_manual_scheduling: medicines.length - verified.length,
  },
  ...(!summaryOnly && { attention: checked.filter(({ result }) => !result.valid).map(({ medicine, result }) => ({
    id: medicine.id,
    medicine: medicine.generic_name,
    status: medicine.clinical_rule_status,
    missing_fields: result.missing_fields,
    conflicts: result.conflicts,
  })) }),
  ...(!summaryOnly && { duplicate_variants: duplicateVariants }),
};

console.log(JSON.stringify(report, null, 2));
await pool.end();
