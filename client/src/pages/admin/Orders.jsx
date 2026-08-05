import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Orders management (Fig 53). Status tracking only — NO payment amount column
// (D-4 removed payments). Patient by code only.
export default function Orders() {
  const [data, setData] = useState({ counts: {}, orders: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/admin/orders')
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message));
  }, []);

  const c = data.counts;
  return (
    <>
      <h2 className="h4 fw-bold mb-1">Orders</h2>
      <p className="text-muted">Refills & deliveries — request and status tracking only.</p>
      {error && <div className="alert alert-warning py-2">{error}</div>}

      <div className="row g-3 mb-4">
        {[
          ['Total orders', c.total ?? 0],
          ['Pending', c.pending ?? 0],
          ['Out for delivery', c.out_for_delivery ?? 0],
          ['Delivered', c.delivered ?? 0],
        ].map(([label, val]) => (
          <div className="col-6 col-lg-3" key={label}>
            <div className="pw-card p-3 text-center">
              <div className="fs-4 fw-bold">{val}</div>
              <div className="small text-muted">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="pw-card p-3">
        <table className="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Medicine</th>
              <th>Type</th>
              <th>Requested</th>
              <th className="text-end">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.orders.map((o) => (
              <tr key={o.id}>
                <td className="pw-code">{o.patient_code}</td>
                <td>{o.drug}</td>
                <td className="text-capitalize small text-muted">{o.kind}</td>
                <td className="small text-muted">{new Date(o.requested_at).toLocaleString()}</td>
                <td className="text-end">
                  <span className="badge bg-secondary-subtle text-dark">{o.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
