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
  /(?:\b\d+(?:[ ,]\d{3})*(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?)(?:\s*(?:\/|per)\s*\d+(?:\.\d+)?\s*(?:ml|g))?\b|\b\d+(?:\.\d+)?\s*%)/i;

// OCR commonly separates letters in units ("500 m g") or mistakes the g for a 9
// ("500 m9"). Normalize only where the letters follow a number so medicine names
// and the rest of the label are left untouched.
function normalizeStrengthText(value) {
  return String(value || '')
    .replaceAll('\u00a0', ' ')
    .replace(/[–—]/g, '-')
    .replace(/(\d)\s*m\s*c\s*[g9]\b/gi, '$1 mcg')
    .replace(/(\d)\s*m\s*[g9]\b/gi, '$1 mg')
    .replace(/(\d)\s*m\s*l\b/gi, '$1 ml')
    .replace(/(\d)\s*(?:µg|ug)\b/gi, '$1 mcg')
    .replace(/\b(?:per)\b/gi, '/')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatStrength(value) {
  return String(value || '')
    .replace(/(\d)[ ,](?=\d{3}\b)/g, '$1')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\bml\b/gi, 'mL')
    .replace(/\bmcg\b/gi, 'mcg')
    .replace(/\bmg\b/gi, 'mg')
    .replace(/\biu\b/gi, 'IU')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function extractMedicineFields(text) {
  const clean = String(text || '')
    .replaceAll('\u00a0', ' ')
    .trim();
  const strengthText = normalizeStrengthText(clean);
  const lines = clean
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const strengthMatch = strengthText.match(STRENGTH_PATTERN)?.[0] || '';
  const formulation = FORMULATIONS.find(([, pattern]) => pattern.test(clean))?.[0] || '';
  const candidate = lines
    .map((line) =>
      line
        .replace(STRENGTH_PATTERN, '')
        .replace(normalizeStrengthText(line).match(STRENGTH_PATTERN)?.[0] || '', '')
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
    strength: formatStrength(strengthMatch),
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
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
  } catch {
    /* The scan sheet remains usable with the photo fallback. */
  }
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    const panel = document.createElement('section');
    const heading = document.createElement('div');
    const preview = document.createElement('div');
    const video = document.createElement('video');
    const scannerGuide = document.createElement('div');
    const utilityControls = document.createElement('div');
    const controls = document.createElement('div');
    const guidance = document.createElement('p');
    const status = document.createElement('p');
    const flash = document.createElement('button');
    const rearCamera = document.createElement('button');
    const choosePhoto = document.createElement('button');
    const capture = document.createElement('button');
    const cancel = document.createElement('button');
    const finish = (value) => {
      stream?.getTracks().forEach((track) => track.stop());
      overlay.remove();
      resolve(value);
    };
    const setStatus = (message) => {
      status.textContent = message;
    };
    const switchCamera = async () => {
      try {
        const replacement = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        stream?.getTracks().forEach((track) => track.stop());
        stream = replacement;
        video.srcObject = stream;
        await video.play();
        setStatus('Back camera selected. Keep the medicine label inside the blue frame.');
      } catch {
        setStatus('The back camera is not available on this device. You can still capture the label shown.');
      }
    };
    const toggleFlash = async () => {
      const track = stream?.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() || {};
      if (!capabilities.torch) {
        setStatus('Flash is not available in this browser or on this camera. Move to brighter light instead.');
        return;
      }
      try {
        const enabled = flash.getAttribute('aria-pressed') !== 'true';
        await track.applyConstraints({ advanced: [{ torch: enabled }] });
        flash.setAttribute('aria-pressed', String(enabled));
        flash.innerHTML = `${flashIcon} <span>${enabled ? 'Flash on' : 'Flash'}</span>`;
        setStatus(enabled ? 'Flash turned on.' : 'Flash turned off.');
      } catch {
        setStatus('Flash could not be turned on. Move to brighter light instead.');
      }
    };

    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '10000',
      background: 'rgba(8, 18, 34, 0.72)',
      display: 'grid',
      placeItems: 'center',
      padding: '24px 16px',
    });
    Object.assign(panel.style, {
      width: 'min(100%, 460px)',
      background: '#fff',
      borderRadius: '24px',
      boxShadow: '0 24px 60px rgba(0,0,0,.36)',
      overflow: 'hidden',
      padding: '18px',
    });
    heading.innerHTML = '<strong style="display:block;color:#102b57;font-size:20px;text-align:center">Scan Medicine Label</strong><span style="display:block;color:#63758b;font-size:13px;line-height:1.4;margin:5px auto 14px;max-width:290px;text-align:center">Keep the label inside the frame.</span>';
    Object.assign(video.style, {
      width: '100%',
      height: 'min(52vh, 310px)',
      background: '#edf4ff',
      borderRadius: '16px',
      display: 'block',
      objectFit: 'cover',
    });
    Object.assign(preview.style, {
      background: '#102340',
      border: '2px solid #1769ff',
      borderRadius: '16px',
      height: 'min(52vh, 310px)',
      overflow: 'hidden',
      position: 'relative',
    });
    scannerGuide.innerHTML = '<div style="border:2px solid rgba(255,255,255,.92);border-radius:12px;box-shadow:0 0 0 999px rgba(6,20,42,.28);height:62%;left:11%;position:absolute;top:16%;width:78%"></div><span style="background:#fff;border-radius:99px;box-shadow:0 3px 12px rgba(0,0,0,.2);bottom:8%;color:#0f4e9c;font-size:12px;font-weight:800;left:50%;padding:7px 11px;position:absolute;transform:translateX(-50%);white-space:nowrap">Align medicine label</span><i style="animation:pmBrowserScanLine 1.8s ease-in-out infinite;background:linear-gradient(90deg,transparent,#63a9ff,transparent);box-shadow:0 0 12px #5ca6ff;height:2px;left:14%;position:absolute;right:14%;top:22%"></i>';
    scannerGuide.setAttribute('aria-hidden', 'true');
    const scannerAnimation = document.createElement('style');
    scannerAnimation.textContent = '@keyframes pmBrowserScanLine{0%,100%{transform:translateY(0)}50%{transform:translateY(150px)}}';
    preview.append(video, scannerGuide);
    if (!stream) {
      video.style.display = 'none';
      const unavailable = document.createElement('div');
      unavailable.innerHTML = '<span aria-hidden="true" style="align-items:center;background:#dcecff;border-radius:50%;color:#1769f5;display:flex;height:58px;justify-content:center;margin-bottom:12px;width:58px"><svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/></svg></span><strong style="display:block;font-size:16px">Camera unavailable</strong><span style="display:block;font-size:13px;line-height:1.45;margin-top:6px">Choose a clear label photo to continue.</span>';
      Object.assign(unavailable.style, {
        alignItems: 'center', background: '#eef5ff', border: '2px dashed #7aaaf8', borderRadius: '16px', boxSizing: 'border-box', color: '#264d85', display: 'flex', flexDirection: 'column', height: 'min(52vh, 310px)', justifyContent: 'center', padding: '24px', textAlign: 'center',
      });
      panel.append(heading, unavailable);
    }
    Object.assign(controls.style, {
      display: 'flex',
      gap: '12px',
      padding: '14px 0 0',
      justifyContent: 'center',
    });
    Object.assign(utilityControls.style, {
      display: 'flex',
      gap: '8px',
      justifyContent: 'space-between',
      padding: '10px 0 0',
    });
    for (const button of [capture, cancel, flash, rearCamera, choosePhoto]) {
      Object.assign(button.style, {
        minHeight: '48px',
        padding: '0 24px',
        borderRadius: '24px',
        fontWeight: '700',
      });
    }
    const flashIcon = '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/></svg>';
    const backCameraIcon = '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><path d="M10 13h5m0 0-2-2m2 2-2 2"/></svg>';
    const photoIcon = '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.3"/><path d="m4 17 5-5 4 4 3-3 4 4"/></svg>';
    capture.textContent = 'Capture label';
    cancel.textContent = 'Cancel';
    flash.innerHTML = `${flashIcon} <span>Flash</span>`;
    rearCamera.innerHTML = `${backCameraIcon} <span>Back camera</span>`;
    choosePhoto.innerHTML = `${photoIcon} <span>Choose photo</span>`;
    flash.setAttribute('aria-pressed', 'false');
    flash.setAttribute('aria-label', 'Turn camera flash on');
    rearCamera.setAttribute('aria-label', 'Use back camera');
    if (!stream) {
      flash.disabled = true;
      rearCamera.disabled = true;
      flash.title = 'Flash is available when camera access is allowed.';
      rearCamera.title = 'Back camera is available when camera access is allowed.';
      flash.style.opacity = '0.52';
      rearCamera.style.opacity = '0.52';
    }
    capture.style.background = '#1769ff';
    capture.style.color = '#fff';
    cancel.style.background = '#fff';
    for (const button of [flash, rearCamera]) {
      button.style.background = '#edf4ff';
      button.style.border = '1px solid #b9d4fb';
      button.style.color = '#1757b8';
      button.style.alignItems = 'center';
      button.style.display = 'inline-flex';
      button.style.fontSize = '13px';
      button.style.gap = '6px';
      button.style.justifyContent = 'center';
      button.style.padding = '0 14px';
    }
    choosePhoto.style.background = '#edf4ff';
    choosePhoto.style.border = '1px solid #b9d4fb';
    choosePhoto.style.color = '#1757b8';
    choosePhoto.style.alignItems = 'center';
    choosePhoto.style.display = 'inline-flex';
    choosePhoto.style.fontSize = '13px';
    choosePhoto.style.gap = '6px';
    choosePhoto.style.justifyContent = 'center';
    choosePhoto.style.padding = '0 14px';
    Object.assign(guidance.style, {
      color: '#536176', fontSize: '12px', lineHeight: '1.45', margin: '12px 0 0', textAlign: 'left',
    });
    guidance.textContent = 'Tip: keep the medicine name and strength visible.';
    Object.assign(status.style, {
      color: '#1757b8', fontSize: '12px', fontWeight: '600', lineHeight: '1.4', margin: '8px 0 0', minHeight: '18px', textAlign: 'center',
    });
    status.setAttribute('aria-live', 'polite');
    setStatus(
      stream ? 'Camera ready.' : 'Use a saved photo when the camera is unavailable.'
    );
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    capture.onclick = async () => {
      try {
        if (!stream) throw new Error('Camera is unavailable. Choose a photo instead.');
        if (!video.videoWidth || !video.videoHeight) throw new Error('Camera is not ready yet.');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.95));
        if (!blob) throw new Error('The photo could not be captured.');
        finish({ webPath: URL.createObjectURL(blob), format: 'image/jpeg', browserCaptured: true });
      } catch (error) {
        setStatus(error?.message || 'The photo could not be captured. Try again or choose a photo.');
      }
    };
    flash.onclick = toggleFlash;
    rearCamera.onclick = switchCamera;
    choosePhoto.onclick = async () => {
      const photo = await pickBrowserImage();
      if (photo) finish(photo);
    };
    cancel.onclick = () => finish(null);
    if (stream) {
      controls.append(capture, cancel);
      utilityControls.append(flash, rearCamera, choosePhoto);
    } else {
      controls.append(choosePhoto, cancel);
      utilityControls.append(flash, rearCamera);
    }
    if (stream) panel.append(heading, preview);
    panel.append(scannerAnimation);
    panel.append(utilityControls, guidance, status, controls);
    overlay.append(panel);
    document.body.append(overlay);
    if (stream) {
      video.play().catch(() => {
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        video.style.display = 'none';
        setStatus('Camera preview could not start. Choose a clear photo instead.');
      });
    }
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

// Browser sessions do not have access to Capacitor's native ML Kit bridge.
// Use the bundled OCR worker there so a clear uploaded/captured label is still
// read automatically rather than forcing every web user into manual entry.
async function recognizeBrowserLabel(imagePath, base, started) {
  const quality = classifyImageQuality(await imageStats(imagePath));
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
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(imagePath);
    const text = String(data?.text || '').trim();
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
      blocks: [],
      message: incomplete
        ? 'Some label details need a quick review before continuing.'
        : confidence < OCR_CONFIDENCE_THRESHOLD
          ? 'Label text was detected. Review the medicine details before confirming.'
          : 'Label text was read automatically. Confirm the details before logging.',
    };
  } finally {
    await worker.terminate();
  }
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
  if (!Capacitor.isNativePlatform()) {
    const imagePath = media?.webPath || media?.uri;
    if (imagePath) return recognizeBrowserLabel(imagePath, base, started);
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
        "We couldn't read the label automatically. Please review the photo and enter the medicine details below.",
    };
  }
  if (!media?.uri) {
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
      message: 'The selected label image could not be opened. Choose another photo and try again.',
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
