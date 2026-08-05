import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Medications (Fig 52). Availability management. NOTE: physical stock levels
// ("in stock / low / out") are not in the data model — availability is the
// per-medicine toggle the plan specifies (D-5). Stock tracking is a limitation.
export default function Medicines() {
  const [meds, setMeds] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/admin/medicines')
      .then((r) => setMeds(r.data))
      .catch((e) => setError(e.message));
  }, []);

  async function toggle(m) {
    await api(`/api/admin/medicines/${m.id}/availability`, {
      method: 'PUT',
      body: { available: !m.availability },
    });
    setMeds((ms) =>
      ms.map((x) => (x.id === m.id ? { ...x, availability: x.availability ? 0 : 1 } : x))
    );
  }

  return (
    <>
      <h2 className="h4 fw-bold mb-1">Medications</h2>
      <p className="text-muted">Curated formulary — toggle availability per medicine.</p>
      {error && <div className="alert alert-warning py-2">{error}</div>}

      <div className="pw-card p-3">
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
    </>
  );
}
