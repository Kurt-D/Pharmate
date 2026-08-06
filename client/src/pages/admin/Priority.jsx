import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Priority-token overview (admin). AGGREGATE COUNTS ONLY (PART 4, flag 4): the
// admin never sees a per-patient priority list or any clinical reason column —
// that is the pharmacist's ID-only roster. Priority is the boolean priority_flag
// derived from pharmacist prescription validation (PART 2).
export default function Priority() {
  const [counts, setCounts] = useState({ priority: 0, standard: 0, total: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/admin/priority')
      .then((r) => setCounts(r.data))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h2 className="h4 fw-bold mb-1">Priority</h2>
      <p className="text-muted">
        Aggregate counts only — priority is verified through pharmacist prescription validation. No
        per-patient records here.
      </p>
      {error && <div className="alert alert-warning py-2">{error}</div>}

      <div className="row g-3">
        {[
          ['Priority patients', counts.priority],
          ['Standard patients', counts.standard],
          ['Total patients', counts.total],
        ].map(([label, val]) => (
          <div className="col-12 col-md-4" key={label}>
            <div className="pw-card p-3 text-center">
              <div className="fs-3 fw-bold">{val}</div>
              <div className="small text-muted">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
