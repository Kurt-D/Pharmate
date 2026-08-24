import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

// "How often do you take it?" chips → a frequency string the engine parser understands.
const FREQ_OPTIONS = [
  { label: 'Once daily', value: 'once daily' },
  { label: 'Twice daily', value: 'twice daily' },
  { label: '3x daily', value: 'three times daily' },
  { label: 'Every other day', value: 'every other day' },
  { label: 'Custom', value: '__custom__' },
];

export default function AddMedicine() {
  const { language } = useLanguage();
  const tr = (english, filipino) => (language === 'fil' ? filipino : english);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [entryMode, setEntryMode] = useState(
    searchParams.get('mode') === 'manual' ? 'manual' : null
  );

  const [name, setName] = useState(searchParams.get('name') || '');
  const [strength, setStrength] = useState(searchParams.get('strength') || '');
  const [form, setForm] = useState(() => {
    const value = searchParams.get('form') || '';
    return value ? value[0].toUpperCase() + value.slice(1) : '';
  });
  const [freqChoice, setFreqChoice] = useState('once daily');
  const [customFreq, setCustomFreq] = useState('');
  const [isPrn, setIsPrn] = useState(false);
  const [source, setSource] = useState(
    searchParams.get('rx') === 'RX' ? 'RX_VALIDATED' : searchParams.get('name') ? 'OTC_SELF' : ''
  );
  const [rxClass, setRxClass] = useState(searchParams.get('rx') || null); // 'OTC' | 'RX' | null (unknown)

  const [suggestions, setSuggestions] = useState([]);
  const [selectedDrug, setSelectedDrug] = useState(null);
  const [showDrugInfo, setShowDrugInfo] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [searchingDrugs, setSearchingDrugs] = useState(false);

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
    setSearchingDrugs(true);
    debounce.current = setTimeout(async () => {
      try {
        const r = await api(`/api/patient/drugs?q=${encodeURIComponent(name.trim())}`);
        setSuggestions(r.data);
        const exact = r.data.find(
          (drug) => drug.generic_name.toLowerCase() === name.trim().toLowerCase()
        );
        if (exact) setSelectedDrug(exact);
      } catch {
        setSuggestions([]);
      } finally {
        setSearchingDrugs(false);
      }
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [name]);

  async function handleSubmit(e) {
    e.preventDefault();
    setResult(null);
    const frequency = isPrn
      ? 'as needed'
      : freqChoice === '__custom__'
        ? customFreq.trim()
        : freqChoice;
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

  if (!entryMode) {
    return (
      <>
        <div className="d-flex align-items-center gap-2 mb-3">
          <button className="pm-link" onClick={() => navigate('/patient/medications')}>
            ←
          </button>
          <h1 className="pm-title" style={{ fontSize: '1.3rem' }}>
            {tr('Add Medicine', 'Magdagdag ng Gamot')}
          </h1>
        </div>
        <div className="pm-banner pm-banner--info mb-3">
          Choose how you want to add your medicine.
        </div>
        <div className="d-grid gap-3">
          <button
            type="button"
            className="pm-card p-4 text-start"
            onClick={() => setEntryMode('manual')}
          >
            <div className="fs-2 mb-2" aria-hidden="true">
              ⌨️
            </div>
            <strong className="d-block fs-5 text-primary">
              {tr('Enter Medicine Manually', 'Manu-manong Ilagay ang Gamot')}
            </strong>
            <span className="text-muted">
              {tr(
                'Type the medicine name, dose, form, and frequency.',
                'I-type ang pangalan, dosis, uri, at dalas ng gamot.'
              )}
            </span>
          </button>
          <button
            type="button"
            className="pm-card p-4 text-start border-primary"
            onClick={() => navigate('/patient/medications/prescription')}
          >
            <div className="fs-2 mb-2" aria-hidden="true">
              📷
            </div>
            <strong className="d-block fs-5 text-primary">
              {tr('Scan Prescription with OCR', 'I-scan ang Reseta gamit ang OCR')}
            </strong>
            <span className="text-muted">
              {tr(
                'Upload or photograph a prescription. OCR will read it before pharmacist review.',
                'I-upload o kunan ng larawan ang reseta. Babasahin ito ng OCR bago suriin ng parmasyutiko.'
              )}
            </span>
          </button>
        </div>
      </>
    );
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
        <label className="form-label fw-semibold">{tr('Medicine Name', 'Pangalan ng Gamot')}</label>
        <div className="position-relative">
          <input
            className="form-control"
            placeholder="Enter medicine name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setShowSuggest(true);
              setRxClass(null); // no longer a confirmed formulary pick
              setSelectedDrug(null);
              setShowDrugInfo(false);
            }}
            onFocus={() => setShowSuggest(true)}
            autoComplete="off"
            required
          />
          {showSuggest && name.trim() && (
            <div
              className="pm-card position-absolute w-100 mt-1 p-1"
              style={{ zIndex: 5, maxHeight: 200, overflowY: 'auto' }}
            >
              {searchingDrugs && (
                <div className="small text-muted p-2">Searching verified medicines…</div>
              )}
              {!searchingDrugs && suggestions.length === 0 && (
                <div className="small text-muted p-2">
                  No verified medicine matches “{name.trim()}”.
                </div>
              )}
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="btn btn-sm w-100 text-start"
                  onClick={() => {
                    setName(s.generic_name);
                    setSelectedDrug(s);
                    setShowDrugInfo(false);
                    setShowSuggest(false);
                    setRxClass(s.rx_class ?? null);
                    if (s.common_strength) setStrength(s.common_strength);
                    if (s.dosage_form) {
                      const value = s.dosage_form;
                      setForm(value[0].toUpperCase() + value.slice(1));
                    }
                    if (s.rx_class === 'RX') setSource('RX_VALIDATED');
                    if (s.rx_class === 'OTC') setSource('OTC_SELF');
                  }}
                >
                  <span className="d-flex align-items-center gap-1">
                    <strong>{s.generic_name}</strong>
                    {s.rx_class === 'RX' ? (
                      <span className="pm-pill pm-pill--pending">Rx</span>
                    ) : s.rx_class === 'OTC' ? (
                      <span className="pm-pill pm-pill--taken">OTC</span>
                    ) : null}
                    {s.is_provisional ? (
                      <span className="pm-pill pm-pill--provisional">unverified</span>
                    ) : null}
                  </span>
                  <small className="d-block text-muted mt-1">
                    {[s.therapeutic_category, s.drug_class].filter(Boolean).join(' · ')}
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedDrug && (
          <div className="pm-selected-drug">
            <div>
              <strong>{selectedDrug.generic_name}</strong>
              <span className={selectedDrug.rx_class === 'RX' ? 'rx' : 'otc'}>
                {selectedDrug.rx_class}
              </span>
              <button
                type="button"
                className="pm-medicine-info-button"
                aria-label={`${showDrugInfo ? 'Hide' : 'View'} information about ${selectedDrug.generic_name}`}
                aria-expanded={showDrugInfo}
                onClick={() => setShowDrugInfo((current) => !current)}
              >
                i
              </button>
            </div>
            <small>
              {[selectedDrug.therapeutic_category, selectedDrug.drug_class]
                .filter(Boolean)
                .join(' · ')}
            </small>
            {showDrugInfo && (
              <p className="pm-medicine-info-panel">
                {selectedDrug.short_description ||
                  selectedDrug.common_uses ||
                  'No additional information available.'}
              </p>
            )}
          </div>
        )}
        <div className="form-text mb-3">
          Enter one or more letters, then select a medicine from the verified database list.
        </div>

        {/* Strength */}
        <label className="form-label fw-semibold">{tr('Strength (Dose)', 'Lakas (Dosis)')}</label>
        <input
          className="form-control mb-3"
          placeholder="e.g., 500 mg"
          value={strength}
          onChange={(e) => setStrength(e.target.value)}
          required
        />

        {/* Form */}
        <label className="form-label fw-semibold">{tr('Form', 'Uri')}</label>
        <select
          className="form-select mb-3"
          value={form}
          onChange={(e) => setForm(e.target.value)}
          required
        >
          <option value="">Select form</option>
          {form &&
            ![
              'Tablet',
              'Capsule',
              'Syrup',
              'Injection',
              'Solution',
              'Suspension',
              'Cream',
              'Ointment',
              'Inhaler',
              'Eye drops',
              'Ear drops',
              'Transdermal patch',
            ].includes(form) && <option>{form}</option>}
          <option>Tablet</option>
          <option>Capsule</option>
          <option>Syrup</option>
          <option>Injection</option>
          <option>Solution</option>
          <option>Suspension</option>
          <option>Cream</option>
          <option>Ointment</option>
          <option>Inhaler</option>
          <option>Eye drops</option>
          <option>Ear drops</option>
          <option>Transdermal patch</option>
        </select>

        {/* Frequency */}
        <label className="form-label fw-semibold">
          {tr('How often do you take it?', 'Gaano kadalas ito iniinom?')}
        </label>
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
        <label className="form-label fw-semibold">{tr('Source', 'Pinagmulan')}</label>
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
          <option value="RX_VALIDATED">From a prescription (validate now)</option>
        </select>
        {rxClass === 'RX' ? (
          <div className="form-text mb-4">
            This is a prescription-only medicine. After adding it, upload a prescription photo. The
            medicine becomes active only after a pharmacist approves it.
          </div>
        ) : (
          <div className="mb-4" />
        )}

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
