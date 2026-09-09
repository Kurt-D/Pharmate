import { Capacitor } from '@capacitor/core';
import { Camera, CameraDirection, EncodingType, MediaTypeSelection } from '@capacitor/camera';
import { Script, TextRecognition } from '@capacitor-mlkit/text-recognition';

export const OCR_ENGINE = 'GOOGLE_ML_KIT_TEXT_RECOGNITION_V2';
export const OCR_ENGINE_VERSION = '8.2.0';
export const OCR_CONFIDENCE_THRESHOLD = 0.75;

const FORMULATIONS = [
  [
    'extended release tablet',
    /\b(?:extended|sustained|modified)[ -]?release\s+tablets?\b|\b(?:xr|sr|mr)\s+tablets?\b/i,
  ],
  ['dispersible tablet', /\bdispersible\s+tablets?\b/i],
  ['chewable tablet', /\bchewable\s+tablets?\b/i],
  ['oral suspension', /\boral\s+suspensions?\b/i],
  ['oral solution', /\boral\s+solutions?\b/i],
  ['eye drops', /\b(?:eye|ophthalmic)\s+drops?\b/i],
  ['ear drops', /\b(?:ear|otic)\s+drops?\b/i],
  ['tablet', /\b(?:tab(?:let)?s?)\b/i],
  ['capsule', /\b(?:cap(?:sule)?s?)\b/i],
  ['syrup', /\bsyrups?\b/i],
  ['suspension', /\bsuspensions?\b/i],
  ['solution', /\bsolutions?\b/i],
  ['drops', /\bdrops?\b/i],
  ['cream', /\bcreams?\b/i],
  ['ointment', /\bointments?\b/i],
  ['inhaler', /\binhalers?\b/i],
  ['suppository', /\bsuppositor(?:y|ies)\b/i],
  ['powder', /\bpowders?\b/i],
  ['ampoule', /\bampoules?\b/i],
  ['vial', /\bvials?\b/i],
  ['injection', /\binjections?\b/i],
];

const LABEL_NOISE =
  /\b(?:manufactured|distributed|registration|reg\.?\s*no|batch|lot|expiry|expires|keep out|store at|prescription|warning|generic name|brand name|each tablet|each capsule|film-coated)\b/i;
const STRENGTH_PATTERN =
  /(?:\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|g|mL|ml|IU|units?)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:mL|ml|g))?\b|\b\d+(?:\.\d+)?\s*%)/i;

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function extractMedicineFields(text) {
  const clean = String(text || '')
    .replaceAll('\u00a0', ' ')
    .trim();
  const lines = clean
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const strengthMatch = clean.match(STRENGTH_PATTERN)?.[0] || '';
  const formulation = FORMULATIONS.find(([, pattern]) => pattern.test(clean))?.[0] || '';
  const candidate = lines
    .map((line) =>
      line
        .replace(STRENGTH_PATTERN, '')
        .replace(new RegExp(FORMULATIONS.map(([, pattern]) => pattern.source).join('|'), 'gi'), '')
        .replace(/[^A-Za-z0-9+\- ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .find(
      (line) =>
        line.length >= 4 && line.length <= 80 && /[a-z]{3}/i.test(line) && !LABEL_NOISE.test(line)
    );
  return {
    name: titleCase(candidate || ''),
    strength: strengthMatch.replace(/\s+/g, ' ').replace(/µg|ug/i, 'mcg'),
    formulation: titleCase(formulation),
  };
}

export function extractPrescriptionQuantity(text) {
  const clean = String(text || '').replaceAll('\u00a0', ' ');
  const explicit = clean.match(/(?:dispense|quantity|qty\.?|total)\s*(?::|#|-)?\s*(\d{1,4})\b/i);
  if (explicit) return Number(explicit[1]);
  const unitCount = clean.match(/\b(\d{1,4})\s*(?:tablets?|capsules?|caps?|tabs?)\b/i);
  return unitCount ? Number(unitCount[1]) : null;
}

export function classifyImageQuality({ width, height, brightness, contrast, sharpness }) {
  if (Math.min(Number(width) || 0, Number(height) || 0) < 480) {
    return {
      code: 'TOO_SMALL',
      score: 0.25,
      message: 'Move closer and retake the label at a higher resolution.',
    };
  }
  if ((Number(brightness) || 0) < 45) {
    return {
      code: 'LOW_LIGHT',
      score: 0.35,
      message: 'The label is too dark. Add light and avoid shadows.',
    };
  }
  if ((Number(sharpness) || 0) < 35 || (Number(contrast) || 0) < 18) {
    return {
      code: 'BLURRY',
      score: 0.4,
      message: 'The label looks blurry. Hold the phone steady and retake it.',
    };
  }
  const score = Math.min(
    1,
    0.65 + Math.min(0.2, Number(sharpness) / 1000) + Math.min(0.15, Number(contrast) / 300)
  );
  return { code: 'GOOD', score: Math.round(score * 10000) / 10000, message: '' };
}

export function calculateFieldConfidence(fields, text, qualityScore = 1) {
  const clean = String(text || '').trim();
  let score = 0;
  if (fields.name) score += 0.45;
  if (fields.strength) score += 0.3;
  if (fields.formulation) score += 0.2;
  if (clean.length >= 12 && clean.split(/\s+/).length >= 3) score += 0.05;
  return Math.round(Math.min(score, Number(qualityScore) || 0) * 10000) / 10000;
}

async function imageStats(url) {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const luminance = new Float32Array(canvas.width * canvas.height);
  let sum = 0;
  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const value = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    luminance[pixel] = value;
    sum += value;
  }
  const brightness = sum / luminance.length;
  let variance = 0;
  let laplacianSum = 0;
  let laplacianSquares = 0;
  let laplacianCount = 0;
  for (let y = 1; y < canvas.height - 1; y += 1) {
    for (let x = 1; x < canvas.width - 1; x += 1) {
      const index = y * canvas.width + x;
      const delta =
        luminance[index - canvas.width] +
        luminance[index + canvas.width] +
        luminance[index - 1] +
        luminance[index + 1] -
        4 * luminance[index];
      laplacianSum += delta;
      laplacianSquares += delta * delta;
      laplacianCount += 1;
    }
  }
  for (const value of luminance) variance += (value - brightness) ** 2;
  const meanLaplacian = laplacianCount ? laplacianSum / laplacianCount : 0;
  const sharpness = laplacianCount ? laplacianSquares / laplacianCount - meanLaplacian ** 2 : 0;
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    brightness,
    contrast: Math.sqrt(variance / luminance.length),
    sharpness,
  };
}

function pickBrowserImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { webPath: URL.createObjectURL(file), format: file.type } : null);
    };
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

async function captureBrowserCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Live camera capture is not supported by this browser. Use the installed app.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    const video = document.createElement('video');
    const controls = document.createElement('div');
    const capture = document.createElement('button');
    const cancel = document.createElement('button');
    const finish = (value) => {
      stream.getTracks().forEach((track) => track.stop());
      overlay.remove();
      resolve(value);
    };

    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '10000',
      background: '#05070b',
      display: 'grid',
      gridTemplateRows: '1fr auto',
      padding: 'env(safe-area-inset-top) 0 env(safe-area-inset-bottom)',
    });
    Object.assign(video.style, { width: '100%', height: '100%', objectFit: 'contain' });
    Object.assign(controls.style, {
      display: 'flex',
      gap: '12px',
      padding: '18px',
      justifyContent: 'center',
    });
    for (const button of [capture, cancel]) {
      Object.assign(button.style, {
        minHeight: '48px',
        padding: '0 24px',
        borderRadius: '24px',
        fontWeight: '700',
      });
    }
    capture.textContent = 'Capture label';
    cancel.textContent = 'Cancel';
    capture.style.background = '#1769ff';
    capture.style.color = '#fff';
    cancel.style.background = '#fff';
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    capture.onclick = async () => {
      try {
        if (!video.videoWidth || !video.videoHeight) throw new Error('Camera is not ready yet.');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.95));
        if (!blob) throw new Error('The photo could not be captured.');
        finish({ webPath: URL.createObjectURL(blob), format: 'image/jpeg', browserCaptured: true });
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        overlay.remove();
        reject(error);
      }
    };
    cancel.onclick = () => finish(null);
    controls.append(capture, cancel);
    overlay.append(video, controls);
    document.body.append(overlay);
    video.play().catch((error) => {
      stream.getTracks().forEach((track) => track.stop());
      overlay.remove();
      reject(error);
    });
  });
}

export async function captureOcrImage(source = 'camera') {
  if (!Capacitor.isNativePlatform()) {
    return source === 'gallery' ? pickBrowserImage() : captureBrowserCamera();
  }
  if (source === 'gallery') {
    const response = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: false,
      limit: 1,
      quality: 95,
      correctOrientation: true,
      includeMetadata: true,
    });
    return response.results?.[0] || null;
  }
  return Camera.takePhoto({
    quality: 95,
    targetWidth: 2000,
    targetHeight: 2000,
    correctOrientation: true,
    encodingType: EncodingType.JPEG,
    cameraDirection: CameraDirection.Rear,
    saveToGallery: false,
    includeMetadata: true,
  });
}

export async function recognizeMedicineImage(media) {
  const started = performance.now();
  const platform = Capacitor.getPlatform();
  const base = {
    id: crypto.randomUUID(),
    engine: OCR_ENGINE,
    engine_version: OCR_ENGINE_VERSION,
    device_platform: platform,
    device_model: navigator.userAgent.slice(0, 120),
    app_version: '1.0.0',
    offline_mode: navigator.onLine === false,
    confidence_threshold: OCR_CONFIDENCE_THRESHOLD,
  };
  if (!Capacitor.isNativePlatform() || !media?.uri) {
    return {
      ...base,
      available: false,
      outcome: 'UNAVAILABLE',
      image_quality: 'UNKNOWN',
      image_quality_score: null,
      field_confidence: null,
      processing_ms: Math.round(performance.now() - started),
      text: '',
      fields: { name: '', strength: '', formulation: '' },
      message:
        'Google ML Kit scanning is available in the installed Android or iOS app. Enter the label details manually in this browser.',
    };
  }
  const quality = classifyImageQuality(await imageStats(media.webPath || media.uri));
  if (quality.code !== 'GOOD') {
    return {
      ...base,
      available: true,
      outcome: 'RECAPTURE_REQUIRED',
      image_quality: quality.code,
      image_quality_score: quality.score,
      field_confidence: 0,
      processing_ms: Math.round(performance.now() - started),
      text: '',
      fields: { name: '', strength: '', formulation: '' },
      message: quality.message,
    };
  }
  const recognized = await TextRecognition.processImage({ path: media.uri, script: Script.Latin });
  const text = String(recognized.text || '').trim();
  const fields = extractMedicineFields(text);
  const confidence = calculateFieldConfidence(fields, text, quality.score);
  const incomplete = !fields.name || (!fields.strength && !fields.formulation);
  return {
    ...base,
    available: true,
    outcome: incomplete
      ? 'MANUAL_REVIEW'
      : confidence >= OCR_CONFIDENCE_THRESHOLD
        ? 'ACCEPTED'
        : 'MANUAL_REVIEW',
    image_quality: incomplete ? 'INCOMPLETE' : quality.code,
    image_quality_score: quality.score,
    field_confidence: confidence,
    processing_ms: Math.round(performance.now() - started),
    text,
    fields,
    blocks: recognized.blocks || [],
    message: incomplete
      ? 'Some medicine details were not found. Check and complete every field before continuing.'
      : confidence < OCR_CONFIDENCE_THRESHOLD
        ? 'The scan needs manual review. Check the medicine name, strength, and formulation.'
        : 'Text was read on this device. Confirm every field against the package.',
  };
}
