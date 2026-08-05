import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Priority (Fig 54, adapted). The GUI envisioned an issue/expire "priority
// token" system; the data model instead drives priority from VERIFIED chronic
// severity (B-8 — severity-based, never streak-based). This lists the patients
// flagged high/moderate, by code. Token issuance/expiry is a documented limitation.
const CLS = { high: 'text-danger', moderate: 'text-warning' };

export default function Priority() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/admin/priority')
      .then((r) => setRows(r.data))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h2 className="h4 fw-bold mb-1">Priority</h2>
      <p className="text-muted">
        Severity-based priority (B-8). Patients flagged by verified chronic condition — by code
        only.
      </p>
      {error && <div className="alert alert-warning py-2">{error}</div>}

      <div className="pw-card p-3">
        {rows.length === 0 ? (
          <div className="text-muted small py-2">No high-severity patients flagged.</div>
        ) : (
          <table className="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Patient</th>
                <th className="text-end">Priority level</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.patient_code}>
                  <td className="pw-code">{r.patient_code}</td>
                  <td
                    className={
                      'text-end text-capitalize fw-semibold ' + (CLS[r.chronic_severity] || '')
                    }
                  >
                    {r.chronic_severity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
