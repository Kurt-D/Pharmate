import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

// "How often do you take it?" chips → a frequency string the engine parser understands.
const FREQ_OPTIONS = [
  { label: 'Once daily', value: 'once daily' },
  { label: 'Twice daily', value: 'twice daily' },
  { label: '3x daily', value: 'three times daily' },
  { label: 'Every other day', value: 'every other day' },
  { label: 'Custom', value: '__custom__' },
];

export default function AddMedicine() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [strength, setStrength] = useState('');
  const [form, setForm] = useState('');
  const [freqChoice, setFreqChoice] = useState('once daily');
  const [customFreq, setCustomFreq] = useState('');
  const [isPrn, setIsPrn] = useState(false);
  const [source, setSource] = useState('');
  const [rxClass, setRxClass] = useState(null); // 'OTC' | 'RX' | null (unknown)

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggest, setShowSuggest] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { kind, message }
  const debounce = useRef(null);

  // Debounced drug-picker search.
  useEffect(() => {
    if (!name.trim()) {
      setSuggestions([]);
      return;
    }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const r = await api(`/api/patient/drugs?q=${encodeURIComponent(name.trim())}`);
        setSuggestions(r.data);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [name]);

  async function handleSubmit(e) {
    e.preventDefault();
    setResult(null);
    const frequency = isPrn ? 'as needed' : freqChoice === '__custom__' ? customFreq.trim() : freqChoice;
    const missing = [
      !name.trim() && 'medicine name',
      !strength.trim() && 'strength (dose)',
      !form && 'form',
      !frequency && 'how often you take it',
      !source && 'source',
    ].filter(Boolean);

    if (missing.length > 0) {
      setResult({
        kind: 'error',
        message: `Complete the following before saving: ${missing.join(', ')}.`,
      });
      return;
    }

    setSubmitting(true);
    try {
      const r = await api('/api/patient/medications', {
        method: 'POST',
        body: {
          drug_name: name.trim(),
          frequency,
          source,
          is_prn: isPrn,
          dosage_instruction: [strength, form].filter(Boolean).join(', ') || null,
        },
      });

      if (r.status === 202) {
        setResult({
          kind: 'pending',
          message:
            'This medicine isn’t in our verified list yet. It has been sent to a pharmacist for verification and will be schedulable once approved.',
        });
      } else if (r.data.status === 'pending_validation') {
        // A prescription medicine — even if labeled OTC, it needs validation.
        // Send the patient straight to the prescription upload for this med.
        setResult({
          kind: 'pending',
          message:
            'This is a prescription medicine. Please upload your prescription so a pharmacist can validate it.',
        });
        setTimeout(() => navigate(`/patient/medications/${r.data.id}/prescription`), 1600);
      } else {
        setResult({
          kind: 'success',
          message: r.data.needs_frequency_review
            ? 'Medicine added. We couldn’t read the frequency — a pharmacist will review it.'
            : 'Medicine added successfully.',
        });
        setTimeout(() => navigate('/patient/medications'), 1400);
      }
    } catch (err) {
      if (err.status === 403 && err.body?.redirect === 'visit_nearest_branch') {
        setResult({ kind: 'restricted', message: err.body.message });
      } else {
        setResult({ kind: 'error', message: err.message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-3">
        <button className="pm-link" onClick={() => navigate('/patient/medications')}>
          ←
        </button>
        <h1 className="pm-title" style={{ fontSize: '1.3rem' }}>
          Add Medicine
        </h1>
      </div>

      <div className="pm-banner pm-banner--info mb-3">
        Enter your medicine details. We&apos;ll use them to build a safe schedule.
      </div>

      {result && (
        <div
          className={
            'pm-banner mb-3 ' +
            (result.kind === 'restricted' || result.kind === 'error'
              ? 'pm-banner--warn'
              : result.kind === 'pending'
                ? 'pm-banner--info'
                : 'pm-banner--success')
          }
        >
          {result.kind === 'restricted' && (
            <strong className="d-block mb-1">Visit nearest branch</strong>
          )}
          {result.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="pm-card p-3">
        {/* Medicine name + picker */}
        <label className="form-label fw-semibold">Medicine Name</label>
        <div className="position-relative">
          <input
            className="form-control"
            placeholder="Enter medicine name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setShowSuggest(true);
              setRxClass(null); // no longer a confirmed formulary pick
            }}
            onFocus={() => setShowSuggest(true)}
            autoComplete="off"
            required
          />
          {showSuggest && suggestions.length > 0 && (
            <div
              className="pm-card position-absolute w-100 mt-1 p-1"
              style={{ zIndex: 5, maxHeight: 200, overflowY: 'auto' }}
            >
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="btn btn-sm w-100 text-start"
                  onClick={() => {
                    setName(s.generic_name);
                    setShowSuggest(false);
                    setRxClass(s.rx_class ?? null);
                    // An Rx drug can't be self-added as OTC — lock it.
                    if (s.rx_class === 'RX') setSource('RX_VALIDATED');
                  }}
                >
                  {s.generic_name}
                  {s.rx_class === 'RX' ? (
                    <span className="pm-pill pm-pill--pending ms-2">Rx</span>
                  ) : s.rx_class === 'OTC' ? (
                    <span className="pm-pill pm-pill--taken ms-2">OTC</span>
                  ) : null}
                  {s.is_provisional ? (
                    <span className="pm-pill pm-pill--provisional ms-2">unverified</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="form-text mb-3">Check the label on your medicine.</div>

        {/* Strength */}
        <label className="form-label fw-semibold">Strength (Dose)</label>
        <input
          className="form-control mb-3"
          placeholder="e.g., 500 mg"
          value={strength}
          onChange={(e) => setStrength(e.target.value)}
          required
        />

        {/* Form */}
        <label className="form-label fw-semibold">Form</label>
        <select
          className="form-select mb-3"
          value={form}
          onChange={(e) => setForm(e.target.value)}
          required
        >
          <option value="">Select form</option>
          <option>Tablet</option>
          <option>Capsule</option>
          <option>Syrup</option>
          <option>Injection</option>
        </select>

        {/* Frequency */}
        <label className="form-label fw-semibold">How often do you take it?</label>
        <div className="d-flex flex-wrap gap-2 mb-2">
          {FREQ_OPTIONS.map((o) => (
            <button
              type="button"
              key={o.value}
              className={
                'btn btn-sm ' + (freqChoice === o.value ? 'btn-primary' : 'btn-outline-secondary')
              }
              onClick={() => setFreqChoice(o.value)}
              disabled={isPrn}
            >
              {o.label}
            </button>
          ))}
        </div>
        {freqChoice === '__custom__' && !isPrn && (
          <input
            className="form-control mb-2"
            placeholder="e.g., q8h, 1-0-1, at bedtime"
            value={customFreq}
            onChange={(e) => setCustomFreq(e.target.value)}
            required
          />
        )}

        {/* PRN */}
        <div className="form-check mb-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="prn"
            checked={isPrn}
            onChange={(e) => setIsPrn(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="prn">
            Take only as needed (PRN)
          </label>
        </div>

        {/* Source */}
        <label className="form-label fw-semibold">Source</label>
        <select
          className="form-select mb-1"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={rxClass === 'RX'}
          required
        >
          <option value="" disabled>
            Select source
          </option>
          <option value="OTC_SELF">Over-the-counter (self)</option>
          <option value="RX_VALIDATED">From a prescription</option>
        </select>
        {rxClass === 'RX' && (
          <div className="form-text mb-4 text-warning-emphasis">
            This is a prescription medicine — it must be validated by a pharmacist. You’ll be asked
            to upload your prescription.
          </div>
        )}
        {rxClass !== 'RX' && <div className="mb-4" />}

        <p className="form-text mb-2">
          Complete all fields above before saving. Prescription medicines will then be sent for
          pharmacist verification.
        </p>
        <button className="pm-btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add Medicine'}
        </button>
      </form>
    </>
  );
}
