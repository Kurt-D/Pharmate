import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../index.js';
import { pool } from '../db/connection.js';
import {
  createAccessToken,
  createPatientTestUser,
  createPrivilegedTestUser,
} from './helpers/testUsers.js';

const PASSWORD = 'TestPass@123';
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const testDate = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
};
let safetyReviewerId;

async function completeSafetyReview(token, drugIds) {
  safetyReviewerId ||= await createPrivilegedTestUser({
    email: `automated.safety.reviewer.${Date.now()}@test.pharmate`,
    password: PASSWORD,
    role: 'pharmacist',
    fullName: 'Automated Safety Reviewer',
  });
  await request(app).put('/api/patient/safety-profile').set(auth(token)).send({
    date_of_birth: '1990-01-01',
    weight_kg: 65,
    allergies: 'None known',
    conditions: 'None known',
    current_medicines: 'None',
    kidney_status: 'NO',
    liver_status: 'NO',
    pregnancy_status: 'NOT_APPLICABLE',
    profile_completed: true,
  });
  for (const drugId of drugIds) {
    await pool.execute(
      `INSERT INTO medication_safety_rules
       (id,drug_id,population_key,allergy_terms_json,condition_rules_json,
        age_reviewed,weight_reviewed,allergies_reviewed,conditions_reviewed,interactions_reviewed,
        pregnancy_action,breastfeeding_action,kidney_action,liver_action,source_name,source_url,
        source_revision_date,safety_status,verified_by,verified_at)
       VALUES (UUID(),?,'ADULT',JSON_ARRAY('test ingredient'),JSON_ARRAY(),1,1,1,1,1,
               'ALLOW','ALLOW','ALLOW','ALLOW','Official test label',
               'https://example.test/safety','2026-01-01','VERIFIED',?,NOW(3))
       ON DUPLICATE KEY UPDATE allergy_terms_json=VALUES(allergy_terms_json),
       condition_rules_json=VALUES(condition_rules_json),age_reviewed=1,weight_reviewed=1,
       allergies_reviewed=1,conditions_reviewed=1,interactions_reviewed=1,
       pregnancy_action='ALLOW',breastfeeding_action='ALLOW',kidney_action='ALLOW',
       liver_action='ALLOW',source_name='Official test label',
       source_url='https://example.test/safety',source_revision_date='2026-01-01',
       safety_status='VERIFIED',verified_by=VALUES(verified_by),verified_at=NOW(3)`,
      [drugId, safetyReviewerId]
    );
    await pool.execute(
      `UPDATE drug_interactions
       SET is_provisional=0,verified_by=?,verified_at=NOW(3)
       WHERE drug_a_id=? OR drug_b_id=?`,
      [safetyReviewerId, drugId, drugId]
    );
    await pool.execute(
      `INSERT INTO otc_label_evidence
       (id,drug_id,population_key,directions_text,schedule_type,frequency_code,
        evidence_status,source_url)
       SELECT UUID(),id,'ADULT','Follow the exact test label.','FIXED_DAILY',
              frequency_default,'READY',evidence_source_url
       FROM drug_reference WHERE id=? AND rx_class='OTC'
       ON DUPLICATE KEY UPDATE directions_text='Follow the exact test label.',
       schedule_type='FIXED_DAILY',frequency_code=(SELECT frequency_default FROM drug_reference WHERE id=?),
       evidence_status='READY'`,
      [drugId, drugId]
    );
  }
}

afterAll(async () => {
  await pool.end();
});

test('suggested schedule reuses an existing medicine and persists dosage and start date', async () => {
  const email = `automated.schedule.${Date.now()}@test.pharmate`;
  const patientId = await createPatientTestUser({ email, password: PASSWORD });
  const token = await createAccessToken(patientId);

  const [[drug]] = await pool.execute(
    "SELECT id FROM drug_reference WHERE LOWER(generic_name)='paracetamol' LIMIT 1"
  );
  await pool.execute(
    `UPDATE drug_reference
     SET common_strength='500 mg', dosage_form='Tablet', frequency_default='QID',
         administration_route='ORAL',release_type='IMMEDIATE_RELEASE',
         supported_frequency_codes=JSON_ARRAY('QID'),
         food_rule='NONE', min_interval_hours=4, max_daily_doses=4,default_units_per_dose=1,
         clinical_rationale='Verified four-hour reminder interval.',
         administration_instruction='Follow the reviewed product label.',
         guidance_do='Follow the medicine label.',guidance_dont='Do not change the dose.',
         evidence_source_url='https://example.test/official-label',
         clinical_source_name='Official test product label',
         source_revision_date='2026-01-01',evidence_reviewed_at='2026-08-30',catalog_status='VERIFIED',
         clinical_rule_status='VERIFIED', availability=1
     WHERE id=?`,
    [drug.id]
  );
  await completeSafetyReview(token, [drug.id]);

  const medicationId = uuidv4();
  await pool.execute(
    `INSERT INTO medications
       (id,patient_id,drug_id,drug_name_raw,source,is_prn,frequency,frequency_code,
        dosage_instruction,start_date,status)
     VALUES (?,?,?,?, 'OTC_SELF',0,'QID','QID','Old dosage',CURRENT_DATE,'active')`,
    [medicationId, patientId, drug.id, 'Paracetamol']
  );

  const saved = await request(app)
    .post('/api/medications/save-reminders')
    .set(auth(token))
    .send({
      review_confirmed: true,
      schedule_mode: 'SUGGESTED',
      medications: [
        {
          drug_id: drug.id,
          medicine_name: 'Paracetamol',
          schedule_times: ['00:00', '06:00', '12:00', '18:00'],
          custom_strength: '500 mg',
          dosage_form: 'Tablet',
          dosage_instruction: 'Take 1 tablet',
          quantity_on_hand: 30,
          quantity_unit: 'tablets',
          start_date: testDate(),
          end_date: testDate(6),
          entry_method: 'MANUAL',
          label_food_instruction: 'NONE',
          patient_confirmed: true,
        },
      ],
    });

  expect(saved.status).toBe(201);
  expect(saved.body.count).toBe(28);
  expect(saved.body.schedule).toEqual(
    expect.arrayContaining([expect.objectContaining({ time: expect.any(String) })])
  );
  const [[medicineCount]] = await pool.execute(
    "SELECT COUNT(*) AS count FROM medications WHERE patient_id=? AND drug_id=? AND status='active'",
    [patientId, drug.id]
  );
  expect(Number(medicineCount.count)).toBe(1);
  const [[medicine]] = await pool.execute(
    `SELECT dosage_instruction, quantity_on_hand, quantity_unit,
            patient_confirmed, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date
     FROM medications WHERE id=?`,
    [medicationId]
  );
  expect(medicine).toEqual({
    dosage_instruction: 'Take 1 tablet',
    quantity_on_hand: '30.00',
    quantity_unit: 'tablets',
    patient_confirmed: 1,
    start_date: testDate(),
  });
  const [[scheduled]] = await pool.execute(
    `SELECT COUNT(*) AS count, MIN(clinical_rule_version) AS clinical_rule_version,
            MIN(evidence_source_url) AS evidence_source_url,
            DATE_FORMAT(MIN(scheduled_time), '%Y-%m-%d') AS start_date,
            DATE_FORMAT(MAX(scheduled_time), '%Y-%m-%d') AS end_date
     FROM medication_schedules WHERE medication_id=?`,
    [medicationId]
  );
  expect(Number(scheduled.count)).toBe(28);
  expect(Number(scheduled.clinical_rule_version)).toBeGreaterThan(0);
  expect(scheduled.evidence_source_url).toBe('https://example.test/official-label');
  expect(scheduled.start_date).toBe(testDate());
  expect(scheduled.end_date).toBe(testDate(6));
  const visibleDoses = await request(app).get('/api/patient/doses/today').set(auth(token));
  expect(visibleDoses.status).toBe(200);
  expect(visibleDoses.body.filter((dose) => dose.medication_id === medicationId)).toHaveLength(4);
});

test('suggested schedule cannot be saved before Step 3 confirmation', async () => {
  const email = `automated.unconfirmed.${Date.now()}@test.pharmate`;
  const patientId = await createPatientTestUser({ email, password: PASSWORD });
  const token = await createAccessToken(patientId);
  const response = await request(app)
    .post('/api/medications/save-reminders')
    .set(auth(token))
    .send({ medications: [] });
  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/review and confirm/i);
});

test('suggested scheduling rejects duplicate active ingredients before persistence', async () => {
  const email = `automated.duplicate.${Date.now()}@test.pharmate`;
  const patientId = await createPatientTestUser({ email, password: PASSWORD });
  const token = await createAccessToken(patientId);
  const [[drug]] = await pool.execute(
    "SELECT id FROM drug_reference WHERE LOWER(generic_name)='paracetamol' LIMIT 1"
  );
  const medicine = {
    drug_id: drug.id,
    medicine_name: 'Paracetamol',
    custom_strength: '500 mg',
    dosage_form: 'Tablet',
    dosage_instruction: 'Take 1 tablet',
    quantity_on_hand: 30,
    quantity_unit: 'tablets',
    start_date: testDate(),
    entry_method: 'MANUAL',
    label_frequency: 'QID',
    schedule_times: ['07:00', '12:00', '18:30', '22:00'],
    label_food_instruction: 'NONE',
    patient_confirmed: true,
  };
  const response = await request(app)
    .post('/api/medications/generate-schedule')
    .set(auth(token))
    .send({ medications: [medicine, medicine] });
  expect(response.status).toBe(409);
  expect(response.body.error).toMatch(/same active ingredient/i);

  await pool.execute(
    `UPDATE drug_reference
     SET clinical_rule_status='UNVERIFIED', evidence_source_url=NULL
     WHERE id=?`,
    [drug.id]
  );
  await completeSafetyReview(token, [drug.id]);
  await request(app)
    .put('/api/patient/anchors')
    .set(auth(token))
    .send({
      wake_anchor: '06:30',
      breakfast_anchor: '07:00',
      lunch_anchor: '12:00',
      dinner_anchor: '18:30',
      sleep_anchor: '22:00',
    })
    .expect(200);
  const adaptive = await request(app)
    .post('/api/medications/generate-schedule')
    .set(auth(token))
    .send({ schedule_mode: 'SUGGESTED', medications: [medicine] });
  expect(adaptive.status).toBe(200);
  expect(adaptive.body.schedule_basis).toBe('PATIENT_LABEL');
  expect(adaptive.body.algorithm).toBe('EXPLAINABLE_CSP_SAFETY_CONTEXT_V3');
  expect(adaptive.body.schedule.map((slot) => slot.time)).toEqual([
    '07:00',
    '12:00',
    '18:30',
    '22:00',
  ]);
  expect(adaptive.body.rationale[0].explanation).toMatch(/entered medication timing/i);
});

test('medicine search tolerates a minor spelling mistake and separates catalog availability from timing verification', async () => {
  const email = `catalog.search.${Date.now()}@test.pharmate`;
  const patientId = await createPatientTestUser({ email, password: PASSWORD });
  const token = await createAccessToken(patientId);
  const response = await request(app).get('/api/medications/search?q=paracetmol').set(auth(token));
  expect(response.status).toBe(200);
  expect(
    response.body.some((medicine) => medicine.generic_name.toLowerCase() === 'paracetamol')
  ).toBe(true);

  const cetirizineSearch = await request(app)
    .get('/api/medications/search?q=cetirizine')
    .set(auth(token));
  const cetirizine = cetirizineSearch.body.find(
    (medicine) => medicine.generic_name.toLowerCase() === 'cetirizine'
  );
  await pool.execute(
    `UPDATE drug_reference SET clinical_rule_status='IN_REVIEW',catalog_status='VERIFIED',
     rx_class='OTC',is_restricted=0,availability=1,
     common_strength='10 mg',dosage_form='tablet',administration_route='ORAL',
     release_type='IMMEDIATE_RELEASE',supported_frequency_codes=JSON_ARRAY('QD'),
     frequency_default='QD',food_rule='NONE',min_interval_hours=24,max_daily_doses=1,
     default_units_per_dose=1,administration_instruction='Follow the medicine label.',
     clinical_rationale='Reference once-daily reminder.',
     guidance_do='Follow the medicine label.',guidance_dont='Do not exceed the label dose.',
     evidence_source_url='https://dailymed.nlm.nih.gov/dailymed/',
     clinical_source_name='DailyMed test label',source_revision_date='2026-01-01',
     evidence_reviewed_at='2026-09-01' WHERE id=?`,
    [cetirizine.id]
  );
  await completeSafetyReview(token, [cetirizine.id]);
  const suggested = await request(app)
    .post('/api/medications/generate-schedule')
    .set(auth(token))
    .send({
      schedule_mode: 'SUGGESTED',
      medications: [
        {
          drug_id: cetirizine.id,
          medicine_name: 'cetirizine',
          schedule_times: ['08:00'],
          custom_strength: '10 mg',
          dosage_form: 'Tablet',
          dosage_instruction: '1 tablet',
          quantity_on_hand: 0,
          quantity_unit: 'tablets',
          start_date: testDate(),
          entry_method: 'MANUAL',
          label_food_instruction: 'NONE',
          patient_confirmed: true,
        },
      ],
    });
  expect(suggested.status).toBe(200);
  expect(suggested.body.schedule_basis).toBe('REFERENCE_REVIEW_REQUIRED');
  expect(suggested.body.schedule).toHaveLength(1);
  expect(suggested.body.schedule[0].medicines[0].name).toBe('cetirizine');
});

test('a sourced OTC reference rule requires review while manual label scheduling remains available', async () => {
  const email = `catalog.manual.${Date.now()}@test.pharmate`;
  const patientId = await createPatientTestUser({ email, password: PASSWORD });
  const token = await createAccessToken(patientId);
  const [[drug]] = await pool.execute(
    "SELECT id, generic_name, common_strength, dosage_form FROM drug_reference WHERE LOWER(generic_name)='cetirizine' LIMIT 1"
  );
  await pool.execute(
    `UPDATE drug_reference SET clinical_rule_status='UNVERIFIED', catalog_status='VERIFIED',
      common_strength='10 mg', dosage_form='tablet', administration_route='ORAL',
      release_type='IMMEDIATE_RELEASE', supported_frequency_codes=JSON_ARRAY('QD'),
      frequency_default='QD', food_rule='NONE', min_interval_hours=24, max_daily_doses=1,
      default_units_per_dose=1,
      administration_instruction='Follow the medicine label.',
      clinical_rationale='Reference once-daily reminder.',
      guidance_do='Follow the medicine label.', guidance_dont='Do not exceed the label dose.',
      evidence_source_url='https://dailymed.nlm.nih.gov/dailymed/',
      clinical_source_name='DailyMed', source_revision_date='2026-01-01',
      evidence_reviewed_at='2026-08-30', rx_class='OTC', is_restricted=0, availability=1
     WHERE id=?`,
    [drug.id]
  );
  await completeSafetyReview(token, [drug.id]);
  const medicine = {
    drug_id: drug.id,
    medicine_name: 'cetirizine',
    schedule_times: ['08:00'],
    custom_strength: '10 mg',
    dosage_form: 'tablet',
    dosage_instruction: '1 tablet',
    quantity_on_hand: 20,
    quantity_unit: 'tablets',
    start_date: testDate(),
    entry_method: 'MANUAL',
    label_food_instruction: 'NONE',
    patient_confirmed: true,
  };
  const reference = await request(app)
    .post('/api/medications/generate-schedule')
    .set(auth(token))
    .send({ schedule_mode: 'SUGGESTED', medications: [{ ...medicine }] });
  expect(reference.status).toBe(200);
  expect(reference.body.schedule_basis).toBe('REFERENCE_REVIEW_REQUIRED');
  expect(reference.body.requires_prescription_match).toBe(true);
  expect(reference.body.rule_provenance[0].evidence_source_url).toMatch(/dailymed\.nlm\.nih\.gov/);
  await request(app)
    .post('/api/medications/save-reminders')
    .set(auth(token))
    .send({
      schedule_mode: 'SUGGESTED',
      review_confirmed: true,
      medications: [medicine],
    })
    .expect(400);
  const savedReference = await request(app)
    .post('/api/medications/save-reminders')
    .set(auth(token))
    .send({
      schedule_mode: 'SUGGESTED',
      review_confirmed: true,
      reference_review_confirmed: true,
      prescription_match_confirmed: true,
      medications: [medicine],
    });
  expect(savedReference.status).toBe(201);
  const [[referenceRow]] = await pool.execute(
    `SELECT schedule_source,review_requirement FROM medication_schedules
     WHERE patient_id=? ORDER BY created_at DESC LIMIT 1`,
    [patientId]
  );
  expect(referenceRow.schedule_source).toBe('REFERENCE');
  expect(referenceRow.review_requirement).toBe('LABEL_MATCH_CONFIRMED');
  const manipulated = await request(app)
    .post('/api/medications/generate-schedule')
    .set(auth(token))
    .send({ medications: [{ ...medicine, label_frequency: 'SIX_TIMES_WHENEVER' }] });
  expect(manipulated.status).toBe(400);
  const labelBased = await request(app)
    .post('/api/medications/generate-schedule')
    .set(auth(token))
    .send({
      medications: [
        {
          ...medicine,
          label_frequency: 'QD',
          frequency_source: 'PATIENT_SELECTED',
          first_dose_time: '08:00',
        },
      ],
    });
  expect(labelBased.status).toBe(200);
  expect(labelBased.body.schedule_basis).toBe('PATIENT_LABEL');
  expect(labelBased.body.schedule).toHaveLength(1);
  const manualIntake = await request(app)
    .post('/api/medications/save-intake')
    .set(auth(token))
    .send({ medications: [{ ...medicine, label_frequency: 'QD' }] });
  expect(manualIntake.status).toBe(201);
  expect(manualIntake.body.medication_ids).toHaveLength(1);
});

test('PRN medicine is saved as a non-recurring tracker', async () => {
  const email = `automated.prn.${Date.now()}@test.pharmate`;
  const patientId = await createPatientTestUser({
    email,
    password: PASSWORD,
  });
  const token = await createAccessToken(patientId);
  const [[drug]] = await pool.execute(
    "SELECT id,generic_name,common_strength,dosage_form FROM drug_reference WHERE rx_class='OTC' AND availability=1 LIMIT 1"
  );
  await completeSafetyReview(token, [drug.id]);
  await pool.execute(
    `UPDATE drug_reference SET catalog_status='VERIFIED',clinical_rule_status='VERIFIED',
     administration_route='ORAL',release_type='IMMEDIATE_RELEASE',
     supported_frequency_codes=JSON_ARRAY('PRN'),frequency_default='PRN',
     max_daily_doses=4,min_interval_hours=6,default_units_per_dose=1,food_rule='NONE',
     administration_instruction='Follow the exact product label.',
     clinical_rationale='As-needed tracker uses the reviewed label limits.',
     guidance_do='Follow the exact product label.',
     guidance_dont='Do not exceed four doses in 24 hours.',
     evidence_source_url='https://dailymed.nlm.nih.gov/dailymed/',
     clinical_source_name='DailyMed test label',source_revision_date='2026-01-01',
     evidence_reviewed_at='2026-09-01',is_provisional=0 WHERE id=?`,
    [drug.id]
  );
  const medicine = {
    drug_id: drug.id,
    medicine_name: drug.generic_name,
    custom_strength: drug.common_strength,
    dosage_form: drug.dosage_form,
    dosage_instruction: 'Take 1 tablet',
    quantity_on_hand: 12,
    quantity_unit: 'tablets',
    start_date: testDate(),
    label_frequency: 'PRN',
    label_direction: 'Take 1 tablet every 6 hours as needed; do not exceed 4 doses in 24 hours',
    label_food_instruction: 'NONE',
    entry_method: 'MANUAL',
    patient_confirmed: true,
  };
  const generated = await request(app)
    .post('/api/medications/generate-schedule')
    .set(auth(token))
    .send({ schedule_mode: 'SUGGESTED', medications: [medicine] });
  expect(generated.status).toBe(200);
  expect(generated.body.schedule).toEqual([]);
  expect(generated.body.prn_trackers).toEqual([
    expect.objectContaining({ recurring_reminders: false, directions: medicine.label_direction }),
  ]);

  const saved = await request(app)
    .post('/api/medications/save-reminders')
    .set(auth(token))
    .send({ schedule_mode: 'SUGGESTED', review_confirmed: true, medications: [medicine] });
  expect(saved.status).toBe(201);
  expect(saved.body.count).toBe(0);
  const [[stored]] = await pool.execute(
    "SELECT is_prn,frequency_code FROM medications WHERE patient_id=? AND drug_id=? AND status='active'",
    [patientId, drug.id]
  );
  expect(stored).toEqual(expect.objectContaining({ is_prn: 1, frequency_code: 'PRN' }));
});

test('prescription schedules ignore catalog defaults and use approved patient directions exactly', async () => {
  const suffix = Date.now();
  const patientEmail = `automated.rx.${suffix}@test.pharmate`;
  const pharmacistEmail = `automated.rx.pharmacist.${suffix}@test.pharmate`;
  const pharmacistId = await createPrivilegedTestUser({
    email: pharmacistEmail,
    password: PASSWORD,
    role: 'pharmacist',
    full_name: 'Prescription Test Pharmacist',
  });
  const patientId = await createPatientTestUser({
    email: patientEmail,
    password: PASSWORD,
  });
  const token = await createAccessToken(patientId);
  const [[drug]] = await pool.execute(
    "SELECT id,generic_name,common_strength,dosage_form FROM drug_reference WHERE rx_class='RX' AND availability=1 AND is_restricted=0 LIMIT 1"
  );
  await completeSafetyReview(token, [drug.id]);
  const prescriptionMedicationId = uuidv4();
  await pool.execute(
    `INSERT INTO medications
     (id,patient_id,drug_id,drug_name_raw,source,is_prn,frequency,frequency_code,
      dosage_instruction,label_direction,strength_value,strength_unit,dosage_form_snapshot,
      start_date,status,pharmacist_id,validated_at,patient_confirmed)
     VALUES (?,?,?,?, 'RX_VALIDATED',0,'Every 12 hours','Q12H',
             'Take 1 tablet','Take exactly 1 tablet every 12 hours',500,'mg',?,CURRENT_DATE,
             'active',?,NOW(3),1)`,
    [
      prescriptionMedicationId,
      patientId,
      drug.id,
      drug.generic_name,
      drug.dosage_form,
      pharmacistId,
    ]
  );
  await pool.execute("UPDATE medications SET interval_start_time='08:00:00' WHERE id=?", [
    prescriptionMedicationId,
  ]);
  const generated = await request(app)
    .post('/api/medications/generate-schedule')
    .set(auth(token))
    .send({
      schedule_mode: 'SUGGESTED',
      medications: [
        {
          drug_id: drug.id,
          medicine_name: drug.generic_name,
          custom_strength: drug.common_strength,
          dosage_form: drug.dosage_form,
          dosage_instruction: 'Patient-entered value must be ignored',
          quantity_on_hand: 1,
          quantity_unit: 'tablet',
          start_date: testDate(),
          label_frequency: 'QD',
          label_food_instruction: 'NONE',
          entry_method: 'MANUAL',
          patient_confirmed: true,
        },
      ],
    });
  expect(generated.status).toBe(200);
  expect(generated.body.schedule_basis).toBe('PRESCRIPTION_DIRECTIONS');
  expect(generated.body.schedule).toHaveLength(2);
  expect(generated.body.schedule[0].medicines[0]).toEqual(
    expect.objectContaining({
      dosage_instruction: 'Take 1 tablet',
      label_direction: 'Take exactly 1 tablet every 12 hours',
      frequency: 'Q12H',
    })
  );
});
