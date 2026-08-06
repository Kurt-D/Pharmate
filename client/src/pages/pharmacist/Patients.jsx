import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Patient roster (pharmacist console, PART 3). Pseudonymous — patient_code only.
// Columns: priority badge (boolean, Priority vs. Standard), active meds,
// adherence. Never a name or the condition (TC-05). Priority is DERIVED from
// pharmacist prescription validation of a chronic condition — there is no
// severity control here (PART 4, flags 2 & 3).
export default function Patients() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/pharmacist/patients')
      .then((r) => setRows(r.data))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h2 className="h4 fw-bold mb-1">Patients</h2>
      <p className="text-muted">Roster by patient code — never a name (TC-05).</p>
      {error && <div className="alert alert-warning py-2">{error}</div>}

      <div className="pw-card p-3">
        {rows.length === 0 ? (
          <div className="text-muted small py-2">No patients yet.</div>
        ) : (
          <table className="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Priority</th>
                <th className="text-end">Active meds</th>
                <th className="text-end">Adherence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.patient_code}>
                  <td className="pw-code">{p.patient_code}</td>
                  <td>
                    {p.priority ? (
                      <span className="badge bg-danger-subtle text-danger-emphasis">Priority</span>
                    ) : (
                      <span className="badge bg-secondary-subtle text-secondary-emphasis">
                        Standard
                      </span>
                    )}
                  </td>
                  <td className="text-end">{p.active_meds}</td>
                  <td className="text-end">
                    {p.adherence_pct == null ? '—' : `${p.adherence_pct}%`}
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
