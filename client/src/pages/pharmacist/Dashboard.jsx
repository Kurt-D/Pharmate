import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

// Pharmacist dashboard — at-a-glance counts for each work queue, each card
// links to its section. Aggregates only, no PII.
const CARDS = [
  ['pending_validations', 'Prescriptions to verify', '/pharmacist/validation'],
  ['pending_curation', 'Drugs to curate', '/pharmacist/curation'],
  ['open_inquiries', 'Open inquiries', '/pharmacist/inquiries'],
  ['open_orders', 'Refills & deliveries', '/pharmacist/orders'],
  ['followups', 'Missed-dose follow-ups', '/pharmacist/patients'],
  ['patients', 'Patients', '/pharmacist/patients'],
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/pharmacist/summary')
      .then((r) => setSummary(r.data))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h2 className="h4 fw-bold mb-1">Dashboard</h2>
      <p className="text-muted">Your work queues at a glance.</p>
      {error && <div className="alert alert-warning py-2">{error}</div>}

      <div className="row g-3">
        {CARDS.map(([key, label, to]) => {
          const value = summary ? (summary[key] ?? 0) : '—';
          const attention = key !== 'patients' && summary && summary[key] > 0;
          return (
            <div className="col-6 col-lg-4" key={label}>
              <button
                className="pw-card p-3 w-100 text-start border-0"
                onClick={() => navigate(to)}
                style={{ cursor: 'pointer' }}
              >
                <div className={'fs-3 fw-bold ' + (attention ? 'text-danger' : '')}>{value}</div>
                <div className="small text-muted">{label}</div>
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
