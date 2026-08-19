import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

// Suggested Schedule — Review & Confirm (Figs 32–33, ENG §6 / UC-03 steps 4–6).
// The engine proposes; the patient may nudge each dose within ±60 min (D-E) with
// a bounded drag handle. Every move is re-validated live server-side — a move
// that breaks a spacing rule snaps back and names the conflict. Then they confirm.

const NUDGE = 60; // ±60 min bound (D-E)

function slotMinute(s) {
  return s.day_offset * 1440 + Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3, 5));
}

function label(minute) {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return { time: `${hh}:${mm}`, nextDay: minute >= 1440 };
}

export default function Schedule() {
  const { language } = useLanguage();
  const tr = (english, filipino) => (language === 'fil' ? filipino : english);
  const navigate = useNavigate();
  const [proposal, setProposal] = useState(null); // null = loading
  const [doses, setDoses] = useState([]); // editable, one per scheduled slot
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    api('/api/patient/schedule')
      .then((r) => {
        setProposal(r.data);
        setDoses(
          r.data.slots.map((s) => {
            const orig = slotMinute(s);
            return {
              medication_id: s.medication_id,
              drug_name: s.drug_name,
              generated_reason: s.generated_reason,
              orig,
              minute: orig, // committed (last-validated) value
              draft: orig, // live slider value while dragging
            };
          })
        );
      })
      .catch((e) => setError(e.message));
  }, []);

  // Live slider value (visual only) while dragging.
  function onDrag(i, value) {
    setDoses((ds) => ds.map((d, idx) => (idx === i ? { ...d, draft: value } : d)));
  }

  // On release: re-validate the candidate layout server-side (D-E).
  async function onCommit(i) {
    setNotice('');
    const candidate = doses.map((d, idx) => ({
      medication_id: d.medication_id,
      minute: idx === i ? doses[i].draft : d.minute,
    }));
    try {
      const r = await api('/api/patient/schedule/validate', {
        method: 'POST',
        body: { doses: candidate, index: i },
      });
      if (r.data.ok) {
        setDoses((ds) => ds.map((d, idx) => (idx === i ? { ...d, minute: d.draft } : d)));
      } else {
        const v = r.data.violation || {};
        const gap = v.min_gap_hours ? ` (needs ${v.min_gap_hours}h gap)` : '';
        setNotice(`Can’t move there — too close to ${v.drug || 'another dose'}${gap}.`);
        setDoses((ds) => ds.map((d, idx) => (idx === i ? { ...d, draft: d.minute } : d)));
      }
    } catch (e) {
      setError(e.message);
      setDoses((ds) => ds.map((d, idx) => (idx === i ? { ...d, draft: d.minute } : d)));
    }
  }

  async function confirm() {
    setConfirming(true);
    setError('');
    try {
      await api('/api/patient/schedule/confirm', {
        method: 'POST',
        body: {
          slots: doses.map((d) => ({
            medication_id: d.medication_id,
            minute: d.minute,
            generated_reason: d.generated_reason,
          })),
        },
      });
      setConfirmed(true);
      setTimeout(() => navigate('/patient/medications'), 1500);
    } catch (e) {
      if (e.status === 409) {
        setError(`${e.message}${e.body?.violation?.drug ? ` (vs ${e.body.violation.drug})` : ''}`);
      } else {
        setError(e.message);
      }
    } finally {
      setConfirming(false);
    }
  }

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-1">
        <button className="pm-link" onClick={() => navigate('/patient/medications')}>
          ←
        </button>
        <h1 className="pm-title" style={{ fontSize: '1.3rem' }}>
          {tr('Suggested Schedule', 'Iminungkahing Iskedyul')}
        </h1>
      </div>
      <p className="pm-subtitle">
        Review the plan. You can nudge any dose up to an hour — we’ll keep it safe.
      </p>

      {error && <div className="pm-banner pm-banner--warn mb-3">{error}</div>}
      {notice && <div className="pm-banner pm-banner--warn mb-3">{notice}</div>}
      {confirmed && (
        <div className="pm-banner pm-banner--success mb-3">
          Schedule confirmed. Your reminders are set.
        </div>
      )}

      {proposal === null && !error && (
        <div className="text-center text-muted py-5">
          {tr('Building your schedule…', 'Ginagawa ang iyong iskedyul…')}
        </div>
      )}

      {proposal && (
        <>
          {doses.length === 0 && proposal.unresolved.length === 0 && (
            <div className="pm-card text-center p-4">
              <div
                className="pm-med-icon mx-auto mb-3"
                style={{ background: '#e0edff', width: 64, height: 64, fontSize: '1.6rem' }}
              >
                📅
              </div>
              <h5 className="mb-1">{tr('Nothing to schedule yet', 'Wala pang maiiskedyul')}</h5>
              <p className="text-muted small mb-3">
                Add an active medicine with a recognized frequency to generate a schedule.
              </p>
              <button
                className="pm-btn-primary"
                onClick={() => navigate('/patient/medications/add')}
              >
                + Add Medicine
              </button>
            </div>
          )}

          {doses.length > 0 && (
            <div className="pm-card p-3 mb-3">
              <div className="pm-timeline">
                {doses.map((d, i) => {
                  const l = label(d.draft);
                  const moved = d.minute !== d.orig;
                  return (
                    <div className="pm-dose" key={`${d.medication_id}-${i}`}>
                      <div className="pm-dose__rail">
                        <span
                          className={'pm-dose__dot' + (l.nextDay ? ' pm-dose__dot--next' : '')}
                        />
                        {i < doses.length - 1 && <span className="pm-dose__line" />}
                      </div>
                      <div className="pm-dose__body">
                        <div className="pm-dose__time">
                          {l.time}
                          {l.nextDay && <small>next day</small>}
                          {moved && <small>adjusted</small>}
                        </div>
                        <div className="pm-dose__drug">{d.drug_name}</div>
                        <div className="pm-dose__reason">{d.generated_reason}</div>
                        <input
                          type="range"
                          className="form-range mt-2"
                          min={Math.max(0, d.orig - NUDGE)}
                          max={d.orig + NUDGE}
                          step={5}
                          value={d.draft}
                          onChange={(e) => onDrag(i, Number(e.target.value))}
                          onMouseUp={() => onCommit(i)}
                          onTouchEnd={() => onCommit(i)}
                          onKeyUp={() => onCommit(i)}
                          aria-label={`Adjust ${d.drug_name} dose time`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {proposal.prn.length > 0 && (
            <div className="pm-card p-3 mb-3">
              <strong className="d-block mb-2">As-needed (PRN)</strong>
              <p className="text-muted small mb-2">
                These aren&apos;t on the timetable. The app checks it&apos;s safe when you log a
                dose.
              </p>
              {proposal.prn.map((p) => (
                <div key={p.medication_id} className="d-flex align-items-center gap-2 mb-1">
                  <span className="pm-pill pm-pill--provisional">PRN</span>
                  <span>{p.drug_name}</span>
                </div>
              ))}
            </div>
          )}

          {proposal.unresolved.length > 0 && (
            <div className="pm-banner pm-banner--warn mb-3">
              <strong className="d-block mb-1">Couldn&apos;t schedule some medicines</strong>
              {proposal.unresolved.map((u) => (
                <div key={u.medication_id} className="small mt-1">
                  <strong>{u.drug_name}</strong> — {u.reason}
                  {u.conflict_with ? ` (conflicts with ${u.conflict_with})` : ''}
                </div>
              ))}
              <div className="small mt-2">Please consult your pharmacist for these.</div>
            </div>
          )}

          {doses.length > 0 && (
            <button className="pm-btn-primary" disabled={confirming || confirmed} onClick={confirm}>
              {confirming
                ? tr('Confirming…', 'Kinukumpirma…')
                : confirmed
                  ? tr('Confirmed ✓', 'Nakumpirma ✓')
                  : tr('Confirm Schedule', 'Kumpirmahin ang Iskedyul')}
            </button>
          )}
        </>
      )}
    </>
  );
}
