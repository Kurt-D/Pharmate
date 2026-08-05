import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Alerts (Fig 49-style, admin view). Missed-dose alerts across the system, by
// patient_code only — no PII.
export default function Alerts() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/admin/alerts')
      .then((r) => setRows(r.data))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h2 className="h4 fw-bold mb-1">Alerts</h2>
      <p className="text-muted">Missed-dose alerts — patient code only.</p>
      {error && <div className="alert alert-warning py-2">{error}</div>}

      <div className="pw-card p-3">
        {rows.length === 0 ? (
          <div className="text-muted small py-2">No alerts. 🎉</div>
        ) : (
          <table className="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Medicine</th>
                <th>Channel</th>
                <th>Raised</th>
                <th className="text-end">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="pw-code">{a.patient_code}</td>
                  <td>{a.drug || '—'}</td>
                  <td className="text-capitalize small text-muted">{a.channel}</td>
                  <td className="small text-muted">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="text-end text-capitalize">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
