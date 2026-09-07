import { api } from '../api.js';

const STORAGE_KEY = 'pm_ocr_evaluation_outbox';

function readQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-100)));
}

export async function flushOcrEvaluations() {
  const pending = readQueue();
  const remaining = [];
  for (const evaluation of pending) {
    try {
      await api('/api/patient/ocr-evaluations', { method: 'POST', body: evaluation });
    } catch {
      remaining.push(evaluation);
    }
  }
  writeQueue(remaining);
  return { sent: pending.length - remaining.length, pending: remaining.length };
}

export async function recordOcrEvaluation(scan, confirmed = {}) {
  if (!scan?.id) return;
  const evaluation = {
    id: scan.id,
    purpose: scan.purpose || 'MEDICINE_LABEL',
    engine: scan.engine,
    engine_version: scan.engine_version,
    sample_code: scan.sample_code || null,
    device_platform: scan.device_platform,
    device_model: scan.device_model,
    app_version: scan.app_version,
    offline_mode: scan.offline_mode,
    processing_ms: scan.processing_ms,
    image_quality: scan.image_quality,
    image_quality_score: scan.image_quality_score,
    field_confidence: scan.field_confidence,
    confidence_threshold: scan.confidence_threshold,
    outcome: scan.outcome,
    detected: scan.fields || {},
    confirmed,
  };
  writeQueue([...readQueue().filter((item) => item.id !== evaluation.id), evaluation]);
  if (navigator.onLine !== false) await flushOcrEvaluations();
}
