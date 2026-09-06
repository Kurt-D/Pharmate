import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createAccessToken, createPatientTestUser, createPrivilegedTestUser } from './helpers/testUsers.js';
import { evaluateOcrFields, fieldAccuracy, validateOcrEvaluation } from '../services/ocrEvaluation.js';

const PASSWORD = 'TestPass@123';
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const stamp = Date.now();
let patientToken;
let adminToken;

beforeAll(async () => {
  const patientId = await createPatientTestUser({
    email: `ocr.patient.${stamp}@test.pharmate`,
    password: PASSWORD,
  });
  patientToken = await createAccessToken(patientId);
  const adminId = await createPrivilegedTestUser({
    email: `ocr.admin.${stamp}@test.pharmate`,
    password: PASSWORD,
    role: 'admin',
  });
  adminToken = await createAccessToken(adminId);
});

afterAll(async () => pool.end());

test('calculates measured field accuracy from manually confirmed packaging text', () => {
  expect(fieldAccuracy('Paracetamo1', 'Paracetamol')).toBeLessThan(100);
  expect(fieldAccuracy('500 milligrams', '500 mg')).toBe(100);
  expect(evaluateOcrFields(
    { name: 'Biogesic', strength: '500 mg', formulation: 'Tablet' },
    { name: 'Biogesic', strength: '500 mg', formulation: 'Tablet' }
  )).toEqual(expect.objectContaining({ field_accuracy_pct: 100, manual_correction_used: false }));
});

test('confidence and image-quality gates cannot record an unsafe accepted scan', () => {
  expect(validateOcrEvaluation({
    engine: 'GOOGLE_ML_KIT_TEXT_RECOGNITION_V2',
    outcome: 'ACCEPTED',
    image_quality: 'GOOD',
    field_confidence: 0.5,
  }).error).toMatch(/threshold/i);
  expect(validateOcrEvaluation({
    engine: 'GOOGLE_ML_KIT_TEXT_RECOGNITION_V2',
    outcome: 'ACCEPTED',
    image_quality: 'BLURRY',
    field_confidence: 0.95,
  }).error).toMatch(/image-quality/i);
  expect(validateOcrEvaluation({ engine: 'TESSERACT', outcome: 'UNAVAILABLE' }).error).toMatch(/Google ML Kit/);
});

test('records an idempotent offline Philippine package measurement and exposes only aggregates', async () => {
  const id = uuidv4();
  const payload = {
    id,
    purpose: 'MEDICINE_LABEL',
    engine: 'GOOGLE_ML_KIT_TEXT_RECOGNITION_V2',
    engine_version: '8.2.0',
    device_platform: 'android',
    device_model: 'Test Android device',
    offline_mode: true,
    processing_ms: 420,
    image_quality: 'GOOD',
    image_quality_score: 0.91,
    field_confidence: 0.95,
    confidence_threshold: 0.75,
    outcome: 'ACCEPTED',
    detected: { name: 'Biogesic', strength: '500 mg', formulation: 'Tablet' },
    confirmed: { name: 'Biogesic', strength: '500 mg', formulation: 'Tablet' },
  };
  expect((await request(app).post('/api/patient/ocr-evaluations').set(auth(patientToken)).send(payload)).status).toBe(201);
  expect((await request(app).post('/api/patient/ocr-evaluations').set(auth(patientToken)).send(payload)).status).toBe(200);

  const report = await request(app).get('/api/admin/ocr-validation').set(auth(adminToken));
  expect(report.status).toBe(200);
  expect(report.body.measured).toBe(true);
  expect(report.body.summary.offline_runs).toBeGreaterThanOrEqual(1);
  expect(report.body.summary.field_accuracy_pct).toBe(100);
  expect(JSON.stringify(report.body)).not.toContain('Biogesic');
  expect(JSON.stringify(report.body)).not.toContain(id);
});
