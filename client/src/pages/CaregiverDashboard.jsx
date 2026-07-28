import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

// Caregiver missed-dose alerts (UC-08). Patients are shown by patient_code only —
// the caregiver never sees a name, condition, or any PII.
export default function CaregiverDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/caregiver/alerts')
      .then((r) => setAlerts(r.data))
      .catch((e) => setError(e.message));
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="d-flex">
      <nav className="pm-sidebar d-flex flex-column p-3">
        <span className="pm-brand text-white mb-4">PharMate</span>
        <ul className="nav flex-column gap-1 flex-grow-1">
          <li>
            <span className="nav-link text-white">Missed Dose Alerts</span>
          </li>
        </ul>
        <button className="btn btn-outline-secondary btn-sm mt-auto" onClick={handleLogout}>
          Sign out
        </button>
      </nav>

      <main className="pm-content" style={{ padding: '1.5rem', width: '100%' }}>
        <h5 className="mb-1">Missed Dose Alerts</h5>
        <p className="text-muted small">
          You see each patient by their code only — never a name or condition.
        </p>

        {error && <div className="alert alert-warning py-2">{error}</div>}
        {alerts === null && !error && <div className="text-muted">Loading…</div>}
        {alerts && alerts.length === 0 && (
          <div className="pw-card p-4 text-center text-muted">No missed-dose alerts. 🎉</div>
        )}

        {alerts &&
          alerts.map((a) => (
            <div key={a.id} className="pw-card p-3 mb-2 d-flex align-items-center gap-3">
              <span style={{ fontSize: '1.4rem' }}>⚠️</span>
              <div className="flex-grow-1">
                <div>
                  <strong className="pw-code">{a.patient_code}</strong> missed{' '}
                  <strong>{a.drug_name || 'a dose'}</strong>
                </div>
                <div className="small text-muted">
                  {a.scheduled_time ? new Date(a.scheduled_time).toLocaleString() : ''} · flagged{' '}
                  {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
              <span className="pw-code text-uppercase small">{a.status}</span>
            </div>
          ))}
      </main>
    </div>
  );
}
