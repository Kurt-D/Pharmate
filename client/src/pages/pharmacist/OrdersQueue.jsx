import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';

// Refill & delivery queue (Tier 2b). Patients shown by patient_code only; the
// pharmacist advances status. Request + status tracking only — no payments.
const NEXT = {
  refill: ['pending', 'processing', 'ready', 'cancelled'],
  delivery: ['pending', 'processing', 'out_for_delivery', 'delivered', 'cancelled'],
};

export default function OrdersQueue() {
  const [orders, setOrders] = useState({ refills: [], deliveries: [] });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api('/api/pharmacist/orders');
      setOrders(r.data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(kind, id, status) {
    try {
      await api(`/api/pharmacist/orders/${kind}/${id}/status`, {
        method: 'POST',
        body: { status },
      });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function table(kind, list) {
    return (
      <div className="pw-card p-3 mb-3">
        <strong className="d-block mb-2 text-capitalize">{kind}s</strong>
        {list.length === 0 ? (
          <div className="text-muted small py-2">No open {kind} requests.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Medicine</th>
                  <th>Requested</th>
                  <th className="text-end">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <span className="pw-code">{o.patient_code}</span>
                    </td>
                    <td>{o.drug}</td>
                    <td className="small text-muted">
                      {new Date(o.requested_at).toLocaleString()}
                    </td>
                    <td className="text-end">
                      <select
                        className="form-select form-select-sm d-inline-block"
                        style={{ width: 'auto' }}
                        value={o.status}
                        onChange={(e) => setStatus(kind, o.id, e.target.value)}
                      >
                        {NEXT[kind].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <h2 className="h4 fw-bold mb-1">Refills & Deliveries</h2>
      <p className="text-muted">
        Request + status tracking only — payment is handled at the branch. Patients shown by code.
      </p>
      {error && <div className="alert alert-warning py-2">{error}</div>}
      {table('refill', orders.refills)}
      {table('delivery', orders.deliveries)}
    </>
  );
}
