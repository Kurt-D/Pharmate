import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

const ICON_BG = ['#e0edff', '#dcfce7', '#fef3c7', '#ede9fe', '#ffe4e6'];

function statusPill(status) {
  if (status === 'pending_drug')
    return <span className="pm-pill pm-pill--pending">Awaiting verification</span>;
  if (status === 'pending_validation')
    return <span className="pm-pill pm-pill--pending">Pending validation</span>;
  return null;
}

export default function Medications() {
  const navigate = useNavigate();
  const [meds, setMeds] = useState(null); // null = loading
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/patient/medications')
      .then((r) => setMeds(r.data))
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <>
        <h1 className="pm-title">Medications</h1>
        <p className="pm-subtitle">Track your medications.</p>
        <div className="pm-banner pm-banner--warn">{error}</div>
      </>
    );
  }

  if (meds === null) {
    return (
      <>
        <h1 className="pm-title">Medications</h1>
        <p className="pm-subtitle">Track your medications.</p>
        <div className="text-center text-muted py-5">Loading…</div>
      </>
    );
  }

  return (
    <>
      <h1 className="pm-title">Medications</h1>
      <p className="pm-subtitle">Track your medications.</p>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <strong>Your Medicines</strong>
        <button className="pm-link" onClick={() => navigate('/patient/medications/add')}>
          + Add Medicine
        </button>
      </div>

      {meds.length === 0 ? (
        <div className="pm-card text-center p-4">
          <div
            className="pm-med-icon mx-auto mb-3"
            style={{ background: '#e0edff', width: 64, height: 64, fontSize: '1.6rem' }}
          >
            💊
          </div>
          <h5 className="mb-1">No medicines added yet</h5>
          <p className="text-muted small mb-4">
            Add your medicines to get started with your schedule.
          </p>
          <button className="pm-btn-primary" onClick={() => navigate('/patient/medications/add')}>
            + Add Medicine
          </button>
          <div className="pm-banner pm-banner--info mt-4 text-start">
            <strong>Why add medicines first?</strong>
            <div className="small mt-1">
              Adding medicines first helps you easily create accurate schedules for the right
              medicines.
            </div>
          </div>
        </div>
      ) : (
        <>
          {meds.map((m, i) => {
            // RX med awaiting a prescription: prompt upload (or re-upload if the
            // pharmacist rejected / asked for a clearer photo).
            const needsPhoto =
              m.status === 'pending_validation' &&
              m.source === 'RX_VALIDATED' &&
              m.prescription_status !== 'pending';
            const wasRejected =
              m.prescription_status === 'rejected' || m.prescription_status === 'needs_clearer';
            return (
              <div key={m.id} className="pm-card p-3 mb-3">
                <div className="d-flex align-items-center gap-3">
                  <div className="pm-med-icon" style={{ background: ICON_BG[i % ICON_BG.length] }}>
                    💊
                  </div>
                  <div className="flex-grow-1">
                    <div className="d-flex align-items-center gap-2">
                      <strong>{m.drug_name_raw}</strong>
                      {statusPill(m.status)}
                    </div>
                    <div className="text-muted small">
                      {[m.dosage_instruction, m.frequency].filter(Boolean).join(' • ') || '—'}
                    </div>
                  </div>
                </div>
                {wasRejected && m.prescription_reason && (
                  <div className="pm-banner pm-banner--warn mt-2 small">
                    Pharmacist note: {m.prescription_reason}
                  </div>
                )}
                {needsPhoto && (
                  <button
                    className="pm-btn-primary mt-2"
                    onClick={() => navigate(`/patient/medications/${m.id}/prescription`)}
                  >
                    📷 {wasRejected ? 'Re-upload prescription' : 'Upload prescription'}
                  </button>
                )}
              </div>
            );
          })}

          <div className="pm-card p-3 mb-3">
            <div className="d-flex align-items-start gap-2">
              <span>ℹ️</span>
              <div className="small">
                <strong>Ready to set up your schedule?</strong>
                <div className="text-muted">
                  We&apos;ll help you plan the safest times to take your medicines.
                </div>
              </div>
            </div>
            <button className="pm-btn-primary mt-3" onClick={() => navigate('/patient/schedule')}>
              📅 Create Schedule
            </button>
          </div>
        </>
      )}
    </>
  );
}
