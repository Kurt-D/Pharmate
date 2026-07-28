import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

// Suggested Schedule — Review & Confirm (Figs 32–33, ENG §6 / UC-03 steps 4–6).
// The engine proposes; the patient reviews each dose with its reason and confirms.
export default function Schedule() {
  const navigate = useNavigate();
  const [proposal, setProposal] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    api('/api/patient/schedule')
      .then((r) => setProposal(r.data))
      .catch((e) => setError(e.message));
  }, []);

  async function confirm() {
    setConfirming(true);
    setError('');
    try {
      await api('/api/patient/schedule/confirm', { method: 'POST' });
      setConfirmed(true);
      setTimeout(() => navigate('/patient/medications'), 1500);
    } catch (e) {
      setError(e.message);
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
          Suggested Schedule
        </h1>
      </div>
      <p className="pm-subtitle">Review the plan we built, then confirm to set your reminders.</p>

      {error && <div className="pm-banner pm-banner--warn mb-3">{error}</div>}
      {confirmed && (
        <div className="pm-banner pm-banner--success mb-3">
          Schedule confirmed. Your reminders are set.
        </div>
      )}

      {proposal === null && !error && (
        <div className="text-center text-muted py-5">Building your schedule…</div>
      )}

      {proposal && (
        <>
          {proposal.slots.length === 0 && proposal.unresolved.length === 0 && (
            <div className="pm-card text-center p-4">
              <div
                className="pm-med-icon mx-auto mb-3"
                style={{ background: '#e0edff', width: 64, height: 64, fontSize: '1.6rem' }}
              >
                📅
              </div>
              <h5 className="mb-1">Nothing to schedule yet</h5>
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

          {proposal.slots.length > 0 && (
            <div className="pm-card p-3 mb-3">
              <div className="pm-timeline">
                {proposal.slots.map((s, i) => (
                  <div className="pm-dose" key={`${s.medication_id}-${i}`}>
                    <div className="pm-dose__rail">
                      <span
                        className={'pm-dose__dot' + (s.day_offset > 0 ? ' pm-dose__dot--next' : '')}
                      />
                      {i < proposal.slots.length - 1 && <span className="pm-dose__line" />}
                    </div>
                    <div className="pm-dose__body">
                      <div className="pm-dose__time">
                        {s.time}
                        {s.day_offset > 0 && <small>next day</small>}
                      </div>
                      <div className="pm-dose__drug">{s.drug_name}</div>
                      <div className="pm-dose__reason">{s.generated_reason}</div>
                    </div>
                  </div>
                ))}
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

          {proposal.slots.length > 0 && (
            <button className="pm-btn-primary" disabled={confirming || confirmed} onClick={confirm}>
              {confirming ? 'Confirming…' : confirmed ? 'Confirmed ✓' : 'Confirm Schedule'}
            </button>
          )}
        </>
      )}
    </>
  );
}
