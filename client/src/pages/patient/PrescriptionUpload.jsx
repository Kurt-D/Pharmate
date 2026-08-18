import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiUpload } from '../../api.js';

// Upload a prescription photo for an RX medication (UC-03, D-K).
// The patient paints black boxes over sensitive details; redaction is baked into
// the canvas pixels, so ONLY the redacted image is uploaded — the original never
// leaves the device.
const MAX_W = 1000; // cap export width to keep uploads small while legible

export default function PrescriptionUpload() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const boxesRef = useRef([]); // committed redaction boxes
  const drawStart = useRef(null);

  const [hasImage, setHasImage] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { kind, message }

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOpen]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function redraw(preview) {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (const b of boxesRef.current) ctx.fillRect(b.x, b.y, b.w, b.h);
    if (preview) ctx.fillRect(preview.x, preview.y, preview.w, preview.h);
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
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
    img.src = URL.createObjectURL(file);
  }

  async function openCamera() {
    setCameraError('');
    setResult(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not supported in this browser. Choose an image from your gallery instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setCameraError('Camera access was denied or unavailable. Check your browser permission, then try again.');
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video?.videoWidth || !video?.videoHeight) return;

    const scale = Math.min(1, MAX_W / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    const image = new Image();
    image.onload = () => {
      imgRef.current = image;
      boxesRef.current = [];
      setHasImage(true);
      closeCamera();
      redraw();
    };
    image.src = canvas.toDataURL('image/jpeg', 0.9);
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
      await apiUpload(`/api/patient/medications/${id}/prescription`, fd);
      setResult({ kind: 'success', message: 'Prescription submitted for verification.' });
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
          Upload Prescription
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
        {!hasImage && !cameraOpen && (
          <div className="d-grid gap-2">
            <button type="button" className="pm-btn-primary" onClick={openCamera}>
              📷 Take Photo
            </button>
            <label className="btn btn-outline-secondary d-block text-center" style={{ cursor: 'pointer' }}>
              🖼️ Choose from Gallery
              <input type="file" accept="image/*" hidden onChange={onFile} />
            </label>
          </div>
        )}

        {cameraError && <div className="pm-banner pm-banner--warn mb-3">{cameraError}</div>}

        {cameraOpen && (
          <div>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-100 rounded"
              style={{ background: '#111', maxHeight: 420, objectFit: 'cover' }}
            />
            <p className="text-muted small mt-2 mb-2">
              Position the full prescription inside the frame, then capture it.
            </p>
            <div className="d-flex gap-2">
              <button type="button" className="pm-btn-primary" onClick={capturePhoto}>
                📸 Capture Photo
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={closeCamera}>
                Cancel
              </button>
            </div>
          </div>
        )}

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
              <label
                className="btn btn-sm btn-outline-secondary mb-0"
                style={{ cursor: 'pointer' }}
              >
                Take or replace photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={onFile}
                />
              </label>
            </div>
            <button className="pm-btn-primary" disabled={submitting} onClick={submit}>
              {submitting ? 'Submitting…' : 'Submit for verification'}
            </button>
          </>
        )}
      </div>
    </>
  );
}
