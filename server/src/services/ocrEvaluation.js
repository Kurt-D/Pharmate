import { pool } from '../db/connection.js';

const QUALITY = new Set(['GOOD', 'BLURRY', 'INCOMPLETE', 'LOW_LIGHT', 'TOO_SMALL', 'UNKNOWN']);
const OUTCOMES = new Set(['ACCEPTED', 'MANUAL_REVIEW', 'RECAPTURE_REQUIRED', 'UNAVAILABLE']);
const PURPOSES = new Set(['MEDICINE_LABEL', 'PRESCRIPTION']);

function clean(value, max = 255) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

export function normalizeOcrField(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\b(?:tabs?|tablets?)\b/g, 'tablet')
    .replace(/\b(?:caps?|capsules?)\b/g, 'capsule')
    .replace(/micrograms?/g, 'mcg')
    .replace(/milligrams?/g, 'mg')
    .replace(/millilit(?:er|re)s?/g, 'ml')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

function editDistance(left, right) {
  const a = [...left];
  const b = [...right];
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + Number(a[i - 1] !== b[j - 1]));
      previous = current;
    }
  }
  return row[b.length];
}

export function fieldAccuracy(detected, confirmed) {
  const expected = normalizeOcrField(confirmed);
  const actual = normalizeOcrField(detected);
  if (!expected) return null;
  if (!actual) return 0;
  const length = Math.max(expected.length, actual.length, 1);
  return Math.max(0, Math.round((1 - editDistance(actual, expected) / length) * 10000) / 100);
}

export function evaluateOcrFields(detected = {}, confirmed = {}) {
  const scores = {
    name_accuracy_pct: fieldAccuracy(detected.name, confirmed.name),
    strength_accuracy_pct: fieldAccuracy(detected.strength, confirmed.strength),
    formulation_accuracy_pct: fieldAccuracy(detected.formulation, confirmed.formulation),
  };
  const available = Object.values(scores).filter(Number.isFinite);
  return {
    ...scores,
    field_accuracy_pct: available.length
      ? Math.round((available.reduce((sum, score) => sum + score, 0) / available.length) * 100) / 100
      : null,
    manual_correction_used: available.some((score) => score < 100),
  };
}

export function validateOcrEvaluation(input = {}) {
  const purpose = String(input.purpose || 'MEDICINE_LABEL').toUpperCase();
  const imageQuality = String(input.image_quality || 'UNKNOWN').toUpperCase();
  const outcome = String(input.outcome || '').toUpperCase();
  if (!PURPOSES.has(purpose)) return { error: 'Unsupported OCR purpose.' };
  if (!QUALITY.has(imageQuality)) return { error: 'Unsupported image-quality result.' };
  if (!OUTCOMES.has(outcome)) return { error: 'Unsupported OCR outcome.' };
  if (String(input.engine || '') !== 'GOOGLE_ML_KIT_TEXT_RECOGNITION_V2') {
    return { error: 'Only Google ML Kit OCR measurements are accepted.' };
  }
  const confidence = input.field_confidence == null ? null : Number(input.field_confidence);
  const qualityScore = input.image_quality_score == null ? null : Number(input.image_quality_score);
  const threshold = Number(input.confidence_threshold ?? 0.75);
  if (confidence != null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    return { error: 'OCR field confidence must be between 0 and 1.' };
  }
  if (qualityScore != null && (!Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 1)) {
    return { error: 'Image-quality score must be between 0 and 1.' };
  }
  if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 0.99) {
    return { error: 'OCR confidence threshold must be between 0.50 and 0.99.' };
  }
  if (outcome === 'ACCEPTED' && (confidence == null || confidence < threshold)) {
    return { error: 'A scan below the confidence threshold cannot be accepted.' };
  }
  if (['BLURRY', 'INCOMPLETE', 'LOW_LIGHT', 'TOO_SMALL'].includes(imageQuality) && outcome === 'ACCEPTED') {
    return { error: 'A scan with an image-quality warning cannot be accepted.' };
  }
  const processingMs = input.processing_ms == null ? null : Number(input.processing_ms);
  if (processingMs != null && (!Number.isInteger(processingMs) || processingMs < 0 || processingMs > 300000)) {
    return { error: 'OCR processing time is invalid.' };
  }
  const detected = {
    name: clean(input.detected?.name),
    strength: clean(input.detected?.strength, 100),
    formulation: clean(input.detected?.formulation, 100),
  };
  const confirmed = {
    name: clean(input.confirmed?.name),
    strength: clean(input.confirmed?.strength, 100),
    formulation: clean(input.confirmed?.formulation, 100),
  };
  return {
    value: {
      id: clean(input.id, 36),
      purpose,
      engine: 'GOOGLE_ML_KIT_TEXT_RECOGNITION_V2',
      engine_version: clean(input.engine_version, 40) || '8.2.0',
      sample_code: clean(input.sample_code, 80),
      device_platform: clean(input.device_platform, 40) || 'unknown',
      device_model: clean(input.device_model, 120),
      app_version: clean(input.app_version, 40),
      offline_mode: Boolean(input.offline_mode),
      processing_ms: processingMs,
      image_quality: imageQuality,
      image_quality_score: qualityScore,
      field_confidence: confidence,
      confidence_threshold: threshold,
      outcome,
      detected,
      confirmed,
      ...evaluateOcrFields(detected, confirmed),
    },
  };
}

export async function saveOcrEvaluation(patientId, value, executor = pool) {
  const id = value.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return { error: 'A valid OCR evaluation id is required.' };
  const [result] = await executor.execute(
    `INSERT IGNORE INTO ocr_scan_evaluations
       (id,patient_id,purpose,engine,engine_version,sample_country,sample_code,
        device_platform,device_model,app_version,offline_mode,processing_ms,
        image_quality,image_quality_score,field_confidence,confidence_threshold,outcome,
        detected_name,detected_strength,detected_formulation,
        confirmed_name,confirmed_strength,confirmed_formulation,
        name_accuracy_pct,strength_accuracy_pct,formulation_accuracy_pct,field_accuracy_pct,
        manual_correction_used)
     VALUES (?,?,?,?,?,'PH',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      patientId,
      value.purpose,
      value.engine,
      value.engine_version,
      value.sample_code,
      value.device_platform,
      value.device_model,
      value.app_version,
      value.offline_mode ? 1 : 0,
      value.processing_ms,
      value.image_quality,
      value.image_quality_score,
      value.field_confidence,
      value.confidence_threshold,
      value.outcome,
      value.detected.name,
      value.detected.strength,
      value.detected.formulation,
      value.confirmed.name,
      value.confirmed.strength,
      value.confirmed.formulation,
      value.name_accuracy_pct,
      value.strength_accuracy_pct,
      value.formulation_accuracy_pct,
      value.field_accuracy_pct,
      value.manual_correction_used ? 1 : 0,
    ]
  );
  return { id, recorded: Boolean(result.affectedRows) };
}
