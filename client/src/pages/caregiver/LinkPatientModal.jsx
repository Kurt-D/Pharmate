import { useEffect, useRef, useState } from 'react';
import { Link2, ShieldCheck, X } from 'lucide-react';

const RELATIONSHIPS = ['Mother', 'Father', 'Grandparent', 'Spouse', 'Sibling', 'Other'];

export default function LinkPatientModal({ open, onClose, onConnect }) {
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [relationship, setRelationship] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputs = useRef([]);

  useEffect(() => {
    if (!open) return;
    setDigits(Array(6).fill(''));
    setRelationship('');
    setError('');
    const timer = window.setTimeout(() => inputs.current[0]?.focus(), 100);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  function setCharacter(index, value) {
    const character = value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(-1);
    setDigits((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? character : item))
    );
    setError('');
    if (character && index < 5) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index] && index > 0)
      inputs.current[index - 1]?.focus();
    if (event.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < 5) inputs.current[index + 1]?.focus();
  }

  function handlePaste(event) {
    const value = event.clipboardData
      .getData('text')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    if (!value) return;
    event.preventDefault();
    setDigits([...value.padEnd(6, '')]);
    inputs.current[Math.min(value.length, 6) - 1]?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    const code = digits.join('');
    if (code.length !== 6) return setError('Enter the complete 6-character patient code.');
    if (!relationship) return setError('Choose your relationship to the patient.');
    setSubmitting(true);
    setError('');
    try {
      await onConnect({ code, relationship });
      onClose();
    } catch (requestError) {
      setError(requestError.message || 'The code is invalid or expired.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-0 sm:items-center sm:px-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        aria-labelledby="link-patient-title"
        aria-modal="true"
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <Link2 className="h-5 w-5 stroke-[2.2]" />
            </span>
            <div>
              <h2
                className="m-0 text-xl font-bold tracking-tight text-slate-900"
                id="link-patient-title"
              >
                Link a patient
              </h2>
              <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
                Enter the secure code shown on the patient’s Profile page.
              </p>
            </div>
          </div>
          <button
            aria-label="Close link patient dialog"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold text-slate-800">
              6-character secure code
            </legend>
            <div className="grid grid-cols-6 gap-2" onPaste={handlePaste}>
              {digits.map((digit, index) => (
                <input
                  aria-label={`Code character ${index + 1}`}
                  autoCapitalize="characters"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  className="h-14 min-w-0 rounded-xl border-2 border-slate-200 bg-slate-50 text-center text-xl font-bold uppercase text-slate-900 outline-none focus:border-[#4C8CE4] focus:ring-4 focus:ring-blue-100"
                  key={index}
                  maxLength={1}
                  onChange={(event) => setCharacter(index, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(index, event)}
                  ref={(element) => {
                    inputs.current[index] = element;
                  }}
                  value={digit}
                />
              ))}
            </div>
          </fieldset>
          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Relationship to patient
            <select
              className="h-13 min-h-[52px] rounded-xl border border-slate-300 bg-white px-3 text-base font-medium text-slate-900 outline-none focus:border-[#4C8CE4] focus:ring-4 focus:ring-blue-100"
              onChange={(event) => {
                setRelationship(event.target.value);
                setError('');
              }}
              value={relationship}
            >
              <option value="">Choose relationship</option>
              {RELATIONSHIPS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <div
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700"
              role="alert"
            >
              {error}
            </div>
          )}
          <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm font-medium leading-5 text-slate-600">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <span>Codes are single-use and expire 15 minutes after the patient creates them.</span>
          </div>
          <button
            className="h-14 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[.99] disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={submitting || digits.join('').length !== 6 || !relationship}
            type="submit"
          >
            {submitting ? 'Connecting…' : 'Connect Patient'}
          </button>
        </form>
      </section>
    </div>
  );
}
