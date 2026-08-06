import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Orders (Tier 2b, D-4). Two tabs by medicine class — OTC vs Prescription — each
// letting the patient request a refill (pickup) or delivery. No payments (D-4);
// delivery requires a branch that offers it (TC-08). Prescription medicines that
// aren't yet validated are declined by the server (UC-09).
const STATUS_CLS = {
  pending: 'pm-pill--pending',
  processing: 'pm-pill--provisional',
  ready: 'pm-pill--taken',
  out_for_delivery: 'pm-pill--provisional',
  delivered: 'pm-pill--taken',
  cancelled: 'pm-pill--missed',
};

// A medicine's effective class: the drug's FDA class, or its source when the
// drug is uncurated (no formulary row yet).
const classOf = (o) => o.rx_class || (o.source === 'RX_VALIDATED' ? 'RX' : 'OTC');

export default function Orders() {
  const [meds, setMeds] = useState([]);
  const [branches, setBranches] = useState([]);
  const [orders, setOrders] = useState({ refills: [], deliveries: [] });
  const [loyalty, setLoyalty] = useState(null);
  const [tab, setTab] = useState('OTC'); // 'OTC' | 'RX'
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

  function switchTab(t) {
    setTab(t);
    setForm((f) => ({ ...f, medication_id: '' })); // clear cross-class selection
    setMsg('');
    setError('');
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

  const medsInTab = meds.filter((m) => classOf(m) === tab);
  const historyInTab = [
    ...orders.refills.map((o) => ({ ...o, kind: 'Refill' })),
    ...orders.deliveries.map((o) => ({ ...o, kind: 'Delivery' })),
  ]
    .filter((o) => classOf(o) === tab)
    .sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));

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

      <ul className="nav nav-tabs mb-3">
        {[
          ['OTC', 'Over-the-counter'],
          ['RX', 'Prescription'],
        ].map(([k, label]) => (
          <li className="nav-item" key={k}>
            <button
              className={'nav-link' + (tab === k ? ' active' : '')}
              onClick={() => switchTab(k)}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>

      {tab === 'RX' && (
        <div className="pm-banner pm-banner--info mb-3">
          Prescription medicines must have a pharmacist-approved prescription on record before a
          refill or delivery can be requested.
        </div>
      )}

      <div className="pm-card p-3 mb-3">
        <div className="btn-group w-100 mb-3">
          {[
            ['refill', 'Refill (pickup)'],
            ['delivery', 'Delivery'],
          ].map(([k, label]) => (
            <button
              key={k}
              className={'btn ' + (form.kind === k ? 'btn-primary' : 'btn-outline-secondary')}
              onClick={() => set('kind', k)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="form-label fw-semibold">Medicine</label>
        <select
          className="form-select mb-2"
          value={form.medication_id}
          onChange={(e) => set('medication_id', e.target.value)}
        >
          <option value="">
            {medsInTab.length ? 'Select medicine' : 'No active medicines in this category'}
          </option>
          {medsInTab.map((m) => (
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

        <button className="pm-btn-primary mt-2" onClick={submit} disabled={!medsInTab.length}>
          Request {form.kind}
        </button>
      </div>

      <strong className="d-block mb-2">
        Your {tab === 'RX' ? 'prescription' : 'over-the-counter'} requests
      </strong>
      {historyInTab.length === 0 ? (
        <p className="text-muted small">None yet.</p>
      ) : (
        historyInTab.map((o) => (
          <div
            key={o.kind + o.id}
            className="pm-card d-flex align-items-center justify-content-between p-3 mb-2"
          >
            <div>
              <div className="pm-dose__drug">{o.drug}</div>
              <div className="text-muted small">
                {o.kind} · {o.branch}
              </div>
            </div>
            {pill(o.status)}
          </div>
        ))
      )}
    </>
  );
}
