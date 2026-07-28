import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Orders (Tier 2b, D-4). Request a refill or delivery and track status — no
// payments anywhere. Delivery requires a branch that offers it (TC-08).
const STATUS_CLS = {
  pending: 'pm-pill--pending',
  processing: 'pm-pill--provisional',
  ready: 'pm-pill--taken',
  out_for_delivery: 'pm-pill--provisional',
  delivered: 'pm-pill--taken',
  cancelled: 'pm-pill--missed',
};

export default function Orders() {
  const [meds, setMeds] = useState([]);
  const [branches, setBranches] = useState([]);
  const [orders, setOrders] = useState({ refills: [], deliveries: [] });
  const [loyalty, setLoyalty] = useState(null);
  const [form, setForm] = useState({
    kind: 'refill',
    medication_id: '',
    branch_id: '',
    address: '',
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const [m, b, o, l] = await Promise.all([
        api('/api/patient/medications'),
        api('/api/directory/branches'),
        api('/api/patient/orders'),
        api('/api/patient/loyalty'),
      ]);
      setMeds(m.data.filter((x) => x.status === 'active'));
      setBranches(b.data);
      setOrders(o.data);
      setLoyalty(l.data);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setError('');
    setMsg('');
    if (!form.medication_id) return setError('Choose a medicine.');
    const path = form.kind === 'delivery' ? '/api/patient/deliveries' : '/api/patient/refills';
    try {
      await api(path, {
        method: 'POST',
        body: {
          medication_id: form.medication_id,
          branch_id: form.branch_id || null,
          address: form.kind === 'delivery' ? form.address : undefined,
        },
      });
      setMsg(`${form.kind === 'delivery' ? 'Delivery' : 'Refill'} requested.`);
      setForm({ kind: form.kind, medication_id: '', branch_id: '', address: '' });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  const pill = (s) => (
    <span className={'pm-pill ' + (STATUS_CLS[s] || 'pm-pill--pending')}>{s}</span>
  );

  return (
    <>
      <div className="d-flex justify-content-between align-items-center">
        <h1 className="pm-title" style={{ fontSize: '1.4rem' }}>
          Orders
        </h1>
        {loyalty && loyalty.tier !== 'none' && (
          <span className="pm-pill pm-pill--taken text-uppercase">
            {loyalty.tier} · {loyalty.streak}🔥
          </span>
        )}
      </div>
      <p className="pm-subtitle">Request a refill or delivery. Payment is handled at the branch.</p>

      {error && <div className="pm-banner pm-banner--warn mb-3">{error}</div>}
      {msg && <div className="pm-banner pm-banner--success mb-3">{msg}</div>}

      <div className="pm-card p-3 mb-3">
        <div className="btn-group w-100 mb-3">
          {['refill', 'delivery'].map((k) => (
            <button
              key={k}
              className={'btn ' + (form.kind === k ? 'btn-primary' : 'btn-outline-secondary')}
              onClick={() => set('kind', k)}
            >
              {k === 'refill' ? 'Refill (pickup)' : 'Delivery'}
            </button>
          ))}
        </div>

        <label className="form-label fw-semibold">Medicine</label>
        <select
          className="form-select mb-2"
          value={form.medication_id}
          onChange={(e) => set('medication_id', e.target.value)}
        >
          <option value="">Select medicine</option>
          {meds.map((m) => (
            <option key={m.id} value={m.id}>
              {m.drug_name_raw}
            </option>
          ))}
        </select>

        <label className="form-label fw-semibold">Branch</label>
        <select
          className="form-select mb-2"
          value={form.branch_id}
          onChange={(e) => set('branch_id', e.target.value)}
        >
          <option value="">Select branch</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} — {b.address}
            </option>
          ))}
        </select>

        {form.kind === 'delivery' && (
          <>
            <label className="form-label fw-semibold">Delivery address</label>
            <input
              className="form-control mb-2"
              placeholder="House no., street, barangay"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </>
        )}

        <button className="pm-btn-primary mt-2" onClick={submit}>
          Request {form.kind}
        </button>
      </div>

      {[
        ['Refills', orders.refills],
        ['Deliveries', orders.deliveries],
      ].map(([title, list]) => (
        <div key={title} className="mb-3">
          <strong className="d-block mb-2">{title}</strong>
          {list.length === 0 ? (
            <p className="text-muted small">None yet.</p>
          ) : (
            list.map((o) => (
              <div
                key={o.id}
                className="pm-card d-flex align-items-center justify-content-between p-3 mb-2"
              >
                <div>
                  <div className="pm-dose__drug">{o.drug}</div>
                  <div className="text-muted small">{o.branch}</div>
                </div>
                {pill(o.status)}
              </div>
            ))
          )}
        </div>
      ))}
    </>
  );
}
