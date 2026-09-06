import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, apiUpload } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import {
  captureOcrImage,
  OCR_CONFIDENCE_THRESHOLD,
  recognizeMedicineImage,
} from '../../lib/mlKitOcr.js';
import { recordOcrEvaluation } from '../../lib/ocrTelemetry.js';

// Upload a prescription photo for an RX medication (UC-03, D-K).
// The patient paints black boxes over sensitive details; redaction is baked into
// the canvas pixels, so ONLY the redacted image is uploaded — the original never
// leaves the device.
const MAX_W = 1000; // cap export width to keep uploads small while legible

export default function PrescriptionUpload() {
  const { language } = useLanguage();
  const tr = (english, filipino) => (language === 'fil' ? filipino : english);
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const boxesRef = useRef([]); // committed redaction boxes
  const drawStart = useRef(null);

  const [hasImage, setHasImage] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { kind, message }
  const [ocrText, setOcrText] = useState('');
  const [ocrConfidence, setOcrConfidence] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [ocrScan, setOcrScan] = useState(null);
  const [ocrReviewed, setOcrReviewed] = useState(false);
  const ocrFirst = !id;
  const [medicineName, setMedicineName] = useState('');
  const [strength, setStrength] = useState('');
  const [medicineForm, setMedicineForm] = useState('Tablet');
  const [frequency, setFrequency] = useState('once daily');
  const [drugMatches, setDrugMatches] = useState([]);
  const [selectedDrug, setSelectedDrug] = useState(null);

  useEffect(() => {
    if (
      !ocrFirst ||
      selectedDrug?.generic_name === medicineName ||
      medicineName.trim().length < 2
    ) {
      if (medicineName.trim().length < 2) setDrugMatches([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await api(
          `/api/patient/drugs?q=${encodeURIComponent(medicineName.trim())}`
        );
        const verified = response.data.filter(
          (drug) => !drug.is_provisional && !drug.is_restricted
        );
        setDrugMatches(verified.slice(0, 6));
      } catch {
        setDrugMatches([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [medicineName, ocrFirst, selectedDrug]);

  function suggestFields(scan) {
    const clean = String(scan?.text || '').trim();
    const dose = scan?.fields?.strength;
    const formMatch = scan?.fields?.formulation;
    let detectedFrequency = '';
    if (/three times|3\s*(?:x|times)|tid/i.test(clean)) detectedFrequency = 'three times daily';
    else if (/twice|two times|2\s*(?:x|times)|bid/i.test(clean)) detectedFrequency = 'twice daily';
    else if (/once|one time|1\s*(?:x|time)|daily|qd/i.test(clean)) detectedFrequency = 'once daily';
    const candidate = scan?.fields?.name;
    if (candidate && !medicineName) setMedicineName(candidate);
    if (dose && !strength) setStrength(dose);
    if (formMatch) setMedicineForm(formMatch);
    if (detectedFrequency) setFrequency(detectedFrequency);
  }

  function redraw(preview) {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (const b of boxesRef.current) ctx.fillRect(b.x, b.y, b.w, b.h);
    if (preview) ctx.fillRect(preview.x, preview.y, preview.w, preview.h);
  }

  async function runOcr(media) {
    setOcrBusy(true);
    setOcrError('');
    try {
      const scan = await recognizeMedicineImage(media);
      scan.purpose = 'PRESCRIPTION';
      setOcrScan(scan);
      setOcrText(scan.text);
      setOcrConfidence(scan.field_confidence);
      suggestFields(scan);
      if (scan.outcome !== 'ACCEPTED') setOcrError(scan.message);
    } catch (error) {
      setOcrError(
        error?.message ||
          'Google ML Kit could not read this image. Retake it or enter the details manually.'
      );
    } finally {
      setOcrBusy(false);
    }
  }

  function loadPreview(source) {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_W / img.naturalWidth);
      const canvas = canvasRef.current;
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      imgRef.current = img;
      boxesRef.current = [];
      setHasImage(true);
      setResult(null);
      redraw();
    };
    img.src = source;
  }

  async function chooseImage(source) {
    setCameraError('');
    setResult(null);
    setOcrReviewed(false);
    try {
      const media = await captureOcrImage(source);
      if (!media) return;
      const preview = media.webPath || (media.thumbnail ? `data:image/jpeg;base64,${media.thumbnail}` : '');
      if (!preview) throw new Error('The selected image could not be opened.');
      loadPreview(preview);
      await runOcr(media);
    } catch (error) {
      setCameraError(
        error?.message || 'Camera access was denied or unavailable. Check permission and try again.'
      );
    }
  }

  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const p = e.touches?.[0] ?? e;
    const sx = canvasRef.current.width / rect.width;
    const sy = canvasRef.current.height / rect.height;
    return { x: (p.clientX - rect.left) * sx, y: (p.clientY - rect.top) * sy };
  }

  function down(e) {
    if (!hasImage) return;
    e.preventDefault();
    drawStart.current = pos(e);
  }
  function move(e) {
    if (!drawStart.current) return;
    const p = pos(e);
    const s = drawStart.current;
    redraw({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  }
  function up(e) {
    if (!drawStart.current) return;
    const p = pos(e);
    const s = drawStart.current;
    const box = {
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    };
    drawStart.current = null;
    if (box.w > 4 && box.h > 4) boxesRef.current.push(box);
    redraw();
  }

  function undo() {
    boxesRef.current.pop();
    redraw();
  }

  async function submit() {
    setSubmitting(true);
    setResult(null);
    try {
      const blob = await new Promise((res) => canvasRef.current.toBlob(res, 'image/jpeg', 0.85));
      const fd = new FormData();
      fd.append('photo', blob, 'prescription.jpg');
      fd.append('ocr_text', ocrText);
      if (ocrConfidence !== null) fd.append('ocr_confidence', String(ocrConfidence));
      let medicationId = id;
      if (ocrFirst) {
        if (!medicineName.trim() || !strength.trim() || !medicineForm || !frequency.trim()) {
          throw new Error('Review and complete the medicine name, strength, form, and frequency.');
        }
        if (!selectedDrug) {
          throw new Error(
            'Select the matching verified medicine from the suggestions before submitting.'
          );
        }
        const created = await api('/api/patient/medications', {
          method: 'POST',
          body: {
            drug_name: medicineName.trim(),
            frequency: frequency.trim(),
            source: 'RX_VALIDATED',
            is_prn: false,
            dosage_instruction: `${strength.trim()}, ${medicineForm}`,
          },
        });
        if (created.data.status !== 'pending_validation') {
          throw new Error(
            'This OCR medicine name is not yet verified. Select or enter its full generic name before submitting.'
          );
        }
        medicationId = created.data.id;
      }
      await apiUpload(`/api/patient/medications/${medicationId}/prescription`, fd);
      if (ocrScan) {
        await recordOcrEvaluation(ocrScan, {
          name: medicineName,
          strength,
          formulation: medicineForm,
        });
      }
      setResult({
        kind: 'success',
        message: 'Prescription uploaded. This medicine is waiting for pharmacist approval.',
      });
      setTimeout(() => navigate('/patient/medications'), 1500);
    } catch (err) {
      setResult({ kind: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-1">
        <button className="pm-link" onClick={() => navigate('/patient/medications')}>
          ←
        </button>
        <h1 className="pm-title" style={{ fontSize: '1.3rem' }}>
          {ocrFirst
            ? tr('Scan Prescription with OCR', 'I-scan ang Reseta gamit ang OCR')
            : tr('Upload Prescription', 'Mag-upload ng Reseta')}
        </h1>
      </div>
      <p className="pm-subtitle">
        Cover any personal details with black boxes before sending. Only the covered image is
        uploaded — the original stays on your phone.
      </p>

      {result && (
        <div
          className={
            'pm-banner mb-3 ' +
            (result.kind === 'success' ? 'pm-banner--success' : 'pm-banner--warn')
          }
        >
          {result.message}
        </div>
      )}

      <div className="pm-card p-3">
        {!hasImage && (
          <div className="d-grid gap-2">
            <button type="button" className="pm-btn-primary" onClick={() => chooseImage('camera')}>
              📷 Take Photo
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary d-block text-center"
              onClick={() => chooseImage('gallery')}
            >
              🖼️ Choose from Gallery
            </button>
          </div>
        )}

        {cameraError && <div className="pm-banner pm-banner--warn mb-3">{cameraError}</div>}

        <canvas
          ref={canvasRef}
          onMouseDown={down}
          onMouseMove={move}
          onMouseUp={up}
          onTouchStart={down}
          onTouchMove={move}
          onTouchEnd={up}
          style={{
            width: '100%',
            display: hasImage ? 'block' : 'none',
            touchAction: 'none',
            borderRadius: 8,
            cursor: 'crosshair',
          }}
        />

        {hasImage && (
          <>
            <p className="text-muted small mt-2 mb-2">Drag across the image to redact areas.</p>
            <div className="d-flex gap-2 mb-2">
              <button className="btn btn-sm btn-outline-secondary" onClick={undo}>
                Undo box
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary mb-0"
                onClick={() => chooseImage('gallery')}
              >
                Take or replace photo
              </button>
            </div>
            <div className="pm-ocr-review mt-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <strong>
                  {tr('Prescription text detected by OCR', 'Teksto ng reseta na nakita ng OCR')}
                </strong>
                {ocrConfidence !== null && (
                  <span>{Math.round(ocrConfidence * 100)}% field confidence</span>
                )}
              </div>
              {ocrBusy && (
                <div className="pm-banner pm-banner--info mb-2">Reading locally with Google ML Kit…</div>
              )}
              {ocrError && <div className="pm-banner pm-banner--warn mb-2">{ocrError}</div>}
              {ocrScan?.available && (
                <div className="form-text mb-2">
                  Image check: {ocrScan.image_quality.replaceAll('_', ' ').toLowerCase()} ·
                  threshold {Math.round(OCR_CONFIDENCE_THRESHOLD * 100)}%. The OCR model runs on
                  this device, including without internet.
                </div>
              )}
              <textarea
                className="form-control"
                rows={6}
                value={ocrText}
                onChange={(event) => {
                  setOcrText(event.target.value);
                  setOcrReviewed(false);
                }}
                placeholder="Detected medicine names and directions will appear here. Correct any OCR mistakes before submitting."
                aria-label="OCR-detected prescription text"
              />
              <div className="form-text">
                This text helps create a provisional schedule. A pharmacist must review the
                prescription and schedule before activation.
              </div>
            </div>
            {ocrFirst && (
              <div className="border rounded p-3 mt-3 mb-3">
                <strong className="d-block mb-2">
                  {tr(
                    'Confirm the OCR medicine details',
                    'Kumpirmahin ang detalye ng gamot mula sa OCR'
                  )}
                </strong>
                <label className="form-label">
                  {tr('Verified medicine', 'Beripikadong gamot')}
                </label>
                <div className="position-relative mb-2">
                  <input
                    className="form-control"
                  value={medicineName}
                  onChange={(event) => {
                    setMedicineName(event.target.value);
                    setSelectedDrug(null);
                    setOcrReviewed(false);
                    }}
                    placeholder="Search the verified medicine list"
                    autoComplete="off"
                  />
                  {!selectedDrug && drugMatches.length > 0 && (
                    <div
                      className="pm-card position-absolute w-100 mt-1 p-1"
                      style={{ zIndex: 10, maxHeight: 220, overflowY: 'auto' }}
                    >
                      {drugMatches.map((drug) => (
                        <button
                          type="button"
                          key={drug.id}
                          className="btn btn-sm w-100 text-start py-2"
                          onClick={() => {
                            setMedicineName(drug.generic_name);
                            setSelectedDrug(drug);
                            setDrugMatches([]);
                          }}
                        >
                          <strong>{drug.generic_name}</strong>
                          <span className="pm-pill pm-pill--pending ms-2">
                            {drug.rx_class || 'Verified'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedDrug ? (
                  <div className="pm-banner pm-banner--success py-2 mb-2">
                    ✓ Verified match selected: <strong>{selectedDrug.generic_name}</strong>
                  </div>
                ) : (
                  <div className="form-text mb-2">
                    Choose a result from the verified list. OCR text alone cannot activate a
                    medicine.
                  </div>
                )}
                <label className="form-label">{tr('Strength', 'Lakas')}</label>
                <input
                  className="form-control mb-2"
                  value={strength}
                  onChange={(event) => {
                    setStrength(event.target.value);
                    setOcrReviewed(false);
                  }}
                  placeholder="e.g., 500 mg"
                />
                <label className="form-label">{tr('Form', 'Uri')}</label>
                <select
                  className="form-select mb-2"
                  value={medicineForm}
                  onChange={(event) => {
                    setMedicineForm(event.target.value);
                    setOcrReviewed(false);
                  }}
                >
                  <option>Tablet</option>
                  <option>Capsule</option>
                  <option>Syrup</option>
                  <option>Oral Suspension</option>
                  <option>Oral Solution</option>
                  <option>Drops</option>
                  <option>Cream</option>
                  <option>Ointment</option>
                  <option>Inhaler</option>
                  <option>Injection</option>
                </select>
                <label className="form-label">
                  {tr('Prescription frequency', 'Dalas ayon sa reseta')}
                </label>
                <input
                  className="form-control"
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value)}
                  placeholder="e.g., three times daily"
                />
                <div className="form-text">
                  OCR suggestions must be checked against the prescription. The pharmacist will
                  validate them again.
                </div>
                <label className="form-check mt-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={ocrReviewed}
                    disabled={ocrScan?.outcome === 'RECAPTURE_REQUIRED'}
                    onChange={(event) => setOcrReviewed(event.target.checked)}
                  />
                  <span className="form-check-label">
                    I checked the medicine name, strength, formulation, and directions against the
                    paper prescription.
                  </span>
                </label>
              </div>
            )}
            <button
              className="pm-btn-primary"
              disabled={
                submitting ||
                (ocrFirst && !ocrReviewed) ||
                ocrScan?.outcome === 'RECAPTURE_REQUIRED'
              }
              onClick={submit}
            >
              {submitting
                ? tr('Submitting…', 'Ipinapadala…')
                : ocrFirst
                  ? tr(
                      'Submit Prescription & Suggested Schedule',
                      'Ipadala ang Reseta at Iminungkahing Iskedyul'
                    )
                  : tr('Submit for verification', 'Ipadala para sa beripikasyon')}
            </button>
          </>
        )}
      </div>
    </>
  );
}
