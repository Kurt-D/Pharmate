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
  const [rxOrders, setRxOrders] = useState([]);
  const [selectedRx, setSelectedRx] = useState(null);
  const [license, setLicense] = useState('');
  const [reason, setReason] = useState('');
  const [adjusted, setAdjusted] = useState({});
  const [error, setError] = useState('');

  const loadRx = useCallback(() => {
    try {
      const all = JSON.parse(localStorage.getItem('pm_rx_orders') || '[]');
      setRxOrders(all.filter((order) => order.status === 'prescription_under_review'));
      setSelectedRx((current) => all.find((order) => order.id === current?.id) || null);
    } catch {
      setRxOrders([]);
    }
  }, []);

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
    loadRx();
  }, [load, loadRx]);

  function chooseRx(order) {
    setSelectedRx(order);
    setReason('');
    setAdjusted(Object.fromEntries(order.items.map((item) => [item.id, item.quantity])));
  }

  function decideRx(action) {
    if (!selectedRx) return;
    if (action === 'approve' && !license.trim())
      return setError('Enter your PRC license number before signing the approval.');
    if (action !== 'approve' && !reason.trim())
      return setError('Enter clear feedback for the patient.');
    const all = JSON.parse(localStorage.getItem('pm_rx_orders') || '[]');
    const next = all.map((order) => {
      if (order.id !== selectedRx.id) return order;
      const items = order.items.map((item) => ({
        ...item,
        quantity: Math.max(
          1,
          Math.min(item.max_quantity, Number(adjusted[item.id] || item.quantity))
        ),
      }));
      const total = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
      return {
        ...order,
        items,
        total,
        status:
          action === 'approve'
            ? 'approved_preparing'
            : action === 'resubmit'
              ? 'needs_resubmission'
              : 'rejected',
        pharmacist:
          action === 'approve'
            ? { prc_license: license.trim(), signed_at: new Date().toISOString() }
            : null,
        rejection_reason: action === 'approve' ? '' : reason.trim(),
      };
    });
    localStorage.setItem('pm_rx_orders', JSON.stringify(next));
    try {
      const prescription = JSON.parse(localStorage.getItem('pm_rx_prescription') || 'null');
      if (prescription?.id === selectedRx.prescription?.id) {
        localStorage.setItem(
          'pm_rx_prescription',
          JSON.stringify({
            ...prescription,
            status:
              action === 'approve'
                ? 'verified'
                : action === 'resubmit'
                  ? 'needs_resubmission'
                  : 'rejected',
          })
        );
      }
    } catch {
      /* Keep the order decision even if local prescription metadata is unavailable. */
    }
    setSelectedRx(null);
    setLicense('');
    setReason('');
    setError('');
    loadRx();
  }

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
      <h2 className="h4 fw-bold mb-1">Orders &amp; Rx Sign-Off</h2>
      <p className="text-muted">
        Prescription orders cannot enter packing until a pharmacist verifies and signs them.
      </p>
      {error && <div className="alert alert-warning py-2">{error}</div>}
      <section className="pm-rx-verification-workspace">
        <header>
          <div>
            <h3>Awaiting Pharmacist Sign-Off</h3>
            <p>Review the prescription against every requested item and remaining balance.</p>
          </div>
          <button onClick={loadRx} type="button">
            Refresh Queue
          </button>
        </header>
        <div className="pm-rx-review-layout">
          <aside>
            <strong>{rxOrders.length} Rx orders waiting</strong>
            {rxOrders.length ? (
              rxOrders.map((order) => (
                <button
                  className={selectedRx?.id === order.id ? 'active' : ''}
                  onClick={() => chooseRx(order)}
                  type="button"
                  key={order.id}
                >
                  <span>
                    <b>{order.id}</b>
                    <small>
                      {order.items.length} medicines · {new Date(order.created_at).toLocaleString()}
                    </small>
                  </span>
                  <em>{order.status.replaceAll('_', ' ')}</em>
                </button>
              ))
            ) : (
              <p>No prescription orders are waiting.</p>
            )}
          </aside>
          <main>
            {selectedRx ? (
              <>
                <div className="pm-rx-review-columns">
                  <section>
                    <h4>Prescription Image</h4>
                    <div className="pm-rx-prescription-view">
                      {selectedRx.prescription.preview &&
                      selectedRx.prescription.type?.startsWith('image/') ? (
                        <img src={selectedRx.prescription.preview} alt="Patient prescription" />
                      ) : (
                        <div>
                          <strong>{selectedRx.prescription.name}</strong>
                          <small>Open the PDF in the prescription validation workspace.</small>
                        </div>
                      )}
                    </div>
                    <ul>
                      <li>Doctor’s name and PRC number are visible</li>
                      <li>Patient name and prescription date are valid</li>
                      <li>Signature, strength, dosage, and quantity match</li>
                    </ul>
                  </section>
                  <section>
                    <h4>Requested Medicines</h4>
                    {selectedRx.items.map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <small>
                            {item.category} · {item.pack}
                          </small>
                        </div>
                        <label>
                          Approved quantity
                          <input
                            type="number"
                            min="1"
                            max={item.max_quantity}
                            value={adjusted[item.id] ?? item.quantity}
                            onChange={(event) =>
                              setAdjusted((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                          />
                          <small>Maximum balance: {item.max_quantity}</small>
                        </label>
                      </article>
                    ))}
                  </section>
                </div>
                <label className="pm-rx-license">
                  PRC License Number
                  <input
                    value={license}
                    onChange={(event) => setLicense(event.target.value)}
                    placeholder="Required for approval signature"
                  />
                </label>
                <label className="pm-rx-feedback">
                  Feedback to patient
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Required when rejecting or requesting a clearer prescription"
                  />
                </label>
                <div className="pm-rx-review-actions">
                  <button onClick={() => decideRx('reject')} type="button">
                    Reject with Feedback
                  </button>
                  <button onClick={() => decideRx('resubmit')} type="button">
                    Request Resubmission
                  </button>
                  <button onClick={() => decideRx('approve')} type="button">
                    Approve &amp; Sign
                  </button>
                </div>
              </>
            ) : (
              <div className="pm-rx-review-empty">
                <strong>Select an Rx order</strong>
                <p>The prescription and requested quantities will appear side by side.</p>
              </div>
            )}
          </main>
        </div>
      </section>
      {table('refill', orders.refills)}
      {table('delivery', orders.deliveries)}
    </>
  );
}
