import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api, downloadFile } from '../api.js';

// Admin aggregate dashboard (D-5, TC-05). Counts, throughput, anonymized
// adherence, medicine availability, and CSV instruments — no individual PII.
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [agg, setAgg] = useState(null);
  const [meds, setMeds] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [a, m] = await Promise.all([api('/api/admin/aggregates'), api('/api/admin/medicines')]);
      setAgg(a.data);
      setMeds(m.data);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(med) {
    await api(`/api/admin/medicines/${med.id}/availability`, {
      method: 'PUT',
      body: { available: !med.availability },
    });
    setMeds((ms) =>
      ms.map((x) => (x.id === med.id ? { ...x, availability: x.availability ? 0 : 1 } : x))
    );
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const sum = (o) => (o ? Object.values(o).reduce((a, b) => a + b, 0) : 0);

  return (
    <div className="d-flex">
      <nav className="pm-sidebar d-flex flex-column p-3">
        <span className="pm-brand text-white mb-4">PharMate</span>
        <ul className="nav flex-column gap-1 flex-grow-1">
          <li>
            <span className="nav-link text-white">Overview</span>
          </li>
        </ul>
        <button className="btn btn-outline-secondary btn-sm mt-auto" onClick={handleLogout}>
          Sign out
        </button>
      </nav>

      <main className="pm-content" style={{ padding: '1.5rem', width: '100%' }}>
        <h5 className="mb-1">Admin Dashboard</h5>
        <p className="text-muted small">
          Aggregates only — no patient names or conditions (TC-05).
        </p>

        {error && <div className="alert alert-warning py-2">{error}</div>}
        {!agg ? (
          <div className="text-muted">Loading…</div>
        ) : (
          <>
            <div className="row g-3 mb-4">
              {[
                ['Patients', agg.patients],
                ['Active medications', agg.active_medications],
                [
                  'Adherence (avg)',
                  agg.adherence.average_pct == null ? '—' : `${agg.adherence.average_pct}%`,
                ],
                ['Refill queue', sum(agg.refills)],
                ['Delivery queue', sum(agg.deliveries)],
                ['No-caregiver flags', agg.no_caregiver_followups_open],
              ].map(([label, val]) => (
                <div className="col-6 col-lg-2" key={label}>
                  <div className="pw-card p-3 text-center">
                    <div className="fs-4 fw-bold">{val}</div>
                    <div className="small text-muted">{label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pw-card p-3 mb-4">
              <strong className="d-block mb-2">CSV instruments (D-6)</strong>
              <div className="d-flex flex-wrap gap-2">
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => downloadFile('/api/admin/export/adherence.csv', 'adherence.csv')}
                >
                  Adherence CSV
                </button>
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => downloadFile('/api/admin/export/dose-logs.csv', 'dose-logs.csv')}
                >
                  Dose logs CSV
                </button>
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() =>
                    downloadFile('/api/admin/export/surveys.csv?instrument=sus', 'sus.csv')
                  }
                >
                  SUS CSV
                </button>
                <button
                  className="btn btn-sm btn-outline-primary"
                  onClick={() =>
                    downloadFile('/api/admin/export/surveys.csv?instrument=tam', 'tam.csv')
                  }
                >
                  TAM CSV
                </button>
              </div>
            </div>

            <div className="pw-card p-3">
              <strong className="d-block mb-2">Medicine availability</strong>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Generic name</th>
                      <th>Restricted</th>
                      <th className="text-end">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meds.map((m) => (
                      <tr key={m.id}>
                        <td>{m.generic_name}</td>
                        <td>{m.is_restricted ? 'Yes' : '—'}</td>
                        <td className="text-end">
                          <div className="form-check form-switch d-inline-block">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              checked={!!m.availability}
                              onChange={() => toggle(m)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
