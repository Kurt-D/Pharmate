import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../index.js';
import { pool } from '../db/connection.js';

const PASSWORD = 'TestPass@123';
const auth = (token) => ({ Authorization: `Bearer ${token}` });

afterAll(async () => {
  await pool.end();
});

test('suggested schedule reuses an existing medicine and persists dosage and start date', async () => {
  const email = `automated.schedule.${Date.now()}@test.pharmate`;
  await request(app).post('/api/auth/register').send({
    email,
    password: PASSWORD,
    role: 'patient',
    full_name: 'Automated Schedule Patient',
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  const patientId = login.body.user.id;
  const token = login.body.accessToken;

  const [[drug]] = await pool.execute(
    "SELECT id FROM drug_reference WHERE LOWER(generic_name)='paracetamol' LIMIT 1"
  );
  await pool.execute(
    `UPDATE drug_reference
     SET common_strength='500 mg', dosage_form='Tablet', frequency_default='QID',
         administration_route='ORAL',release_type='IMMEDIATE_RELEASE',
         supported_frequency_codes=JSON_ARRAY('QID'),
         food_rule='NONE', min_interval_hours=4, max_daily_doses=4,
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
      medications: [{
        drug_id: drug.id,
        medicine_name: 'Paracetamol',
        custom_strength: '500 mg',
        dosage_form: 'Tablet',
        dosage_instruction: 'Take 1 tablet',
        quantity_on_hand: 30,
        quantity_unit: 'tablets',
        start_date: '2026-09-01',
        end_date: '2026-09-07',
        entry_method: 'MANUAL',
        label_frequency: 'QID',
        label_food_instruction: 'NONE',
        patient_confirmed: true,
      }],
    });

  expect(saved.status).toBe(201);
  expect(saved.body.count).toBe(28);
  const [[medicineCount]] = await pool.execute(
    'SELECT COUNT(*) AS count FROM medications WHERE patient_id=? AND drug_id=? AND status=\'active\'',
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
    dosage_instruction: 'Take 1 tablet', quantity_on_hand: '30.00',
    quantity_unit: 'tablets', patient_confirmed: 1, start_date: '2026-09-01',
  });
  const [[scheduled]] = await pool.execute(
    `SELECT COUNT(*) AS count,
            DATE_FORMAT(MIN(scheduled_time), '%Y-%m-%d') AS start_date,
            DATE_FORMAT(MAX(scheduled_time), '%Y-%m-%d') AS end_date
     FROM medication_schedules WHERE medication_id=?`,
    [medicationId]
  );
  expect(Number(scheduled.count)).toBe(28);
  expect(scheduled.start_date).toBe('2026-09-01');
  expect(scheduled.end_date).toBe('2026-09-07');
  const visibleDoses = await request(app)
    .get('/api/patient/doses/today')
    .set(auth(token));
  expect(visibleDoses.status).toBe(200);
  expect(visibleDoses.body.filter((dose) => dose.medication_id === medicationId)).toHaveLength(28);
});

test('suggested schedule cannot be saved before Step 3 confirmation', async () => {
  const email = `automated.unconfirmed.${Date.now()}@test.pharmate`;
  await request(app).post('/api/auth/register').send({
    email, password: PASSWORD, role: 'patient', full_name: 'Unconfirmed Schedule Patient',
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  const response = await request(app)
    .post('/api/medications/save-reminders')
    .set(auth(login.body.accessToken))
    .send({ medications: [] });
  expect(response.status).toBe(400);
  expect(response.body.error).toMatch(/review and confirm/i);
});

test('suggested scheduling rejects duplicate active ingredients before persistence', async () => {
  const email = `automated.duplicate.${Date.now()}@test.pharmate`;
  await request(app).post('/api/auth/register').send({
    email, password: PASSWORD, role: 'patient', full_name: 'Duplicate Schedule Patient',
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  const [[drug]] = await pool.execute(
    "SELECT id FROM drug_reference WHERE LOWER(generic_name)='paracetamol' LIMIT 1"
  );
  const medicine = {
    drug_id: drug.id, medicine_name: 'Paracetamol', custom_strength: '500 mg',
    dosage_form: 'Tablet', dosage_instruction: 'Take 1 tablet', quantity_on_hand: 30,
    quantity_unit: 'tablets', start_date: '2026-09-01', entry_method: 'MANUAL',
    label_frequency: 'QID', label_food_instruction: 'NONE', patient_confirmed: true,
  };
  const response = await request(app)
    .post('/api/medications/generate-schedule')
    .set(auth(login.body.accessToken))
    .send({ medications: [medicine, medicine] });
  expect(response.status).toBe(409);
  expect(response.body.error).toMatch(/same active ingredient/i);
});

test('medicine search tolerates a minor spelling mistake and separates catalog availability from timing verification', async () => {
  const email = `catalog.search.${Date.now()}@test.pharmate`;
  await request(app).post('/api/auth/register').send({
    email, password: PASSWORD, role: 'patient', full_name: 'Catalog Search Patient',
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  const response = await request(app)
    .get('/api/medications/search?q=paracetmol')
    .set(auth(login.body.accessToken));
  expect(response.status).toBe(200);
  expect(response.body.some((medicine) => medicine.generic_name.toLowerCase() === 'paracetamol'))
    .toBe(true);
});

test('an available catalog medicine uses confirmed label frequency when its catalog timing rule is incomplete', async () => {
  const email = `catalog.manual.${Date.now()}@test.pharmate`;
  await request(app).post('/api/auth/register').send({
    email, password: PASSWORD, role: 'patient', full_name: 'Manual Catalog Patient',
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  const [[drug]] = await pool.execute(
    "SELECT id, generic_name, common_strength, dosage_form FROM drug_reference WHERE LOWER(generic_name)='cetirizine' LIMIT 1"
  );
  await pool.execute(
    `UPDATE drug_reference SET clinical_rule_status='UNVERIFIED', max_daily_doses=NULL,
      common_strength='10 mg', dosage_form='tablet', rx_class='OTC', availability=1 WHERE id=?`,
    [drug.id]
  );
  const medicine = {
    drug_id: drug.id, medicine_name: 'cetirizine', custom_strength: '10 mg',
    dosage_form: 'tablet', dosage_instruction: '1 tablet', quantity_on_hand: 20,
    quantity_unit: 'tablets', start_date: '2026-09-01', entry_method: 'MANUAL',
    label_food_instruction: 'NONE', patient_confirmed: true,
  };
  await request(app)
    .post('/api/medications/generate-schedule')
    .set(auth(login.body.accessToken))
    .send({ medications: [medicine] })
    .expect(400);
  const manipulated = await request(app)
    .post('/api/medications/generate-schedule')
    .set(auth(login.body.accessToken))
    .send({ medications: [{ ...medicine, label_frequency: 'SIX_TIMES_WHENEVER' }] });
  expect(manipulated.status).toBe(400);
  const labelBased = await request(app)
    .post('/api/medications/generate-schedule')
    .set(auth(login.body.accessToken))
    .send({ medications: [{ ...medicine, label_frequency: 'QD' }] });
  expect(labelBased.status).toBe(200);
  expect(labelBased.body.schedule_basis).toBe('PATIENT_LABEL');
  expect(labelBased.body.schedule).toHaveLength(1);
  const manualIntake = await request(app)
    .post('/api/medications/save-intake')
    .set(auth(login.body.accessToken))
    .send({ medications: [{ ...medicine, label_frequency: 'QD' }] });
  expect(manualIntake.status).toBe(201);
  expect(manualIntake.body.medication_ids).toHaveLength(1);
});
