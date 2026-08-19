import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

// Caregiver console. UC-08 (read missed-dose alerts) + UC-09 (act on a linked
// patient's behalf: refill, delivery, medication inquiry). Patients are shown by
// patient_code only — never a name, condition, or any PII (PART 3). The caregiver
// is blocked from UC-03/04/06/07 by the caregiver-role middleware server-side.
const NAV = [
  ['alerts', 'Missed Dose Alerts'],
  ['patients', 'My Patients'],
  ['link', 'Link a Patient'],
];

const STATUS_CLS = {
  pending: 'pm-pill--pending',
  processing: 'pm-pill--provisional',
  ready: 'pm-pill--taken',
  out_for_delivery: 'pm-pill--provisional',
  delivered: 'pm-pill--taken',
  cancelled: 'pm-pill--missed',
};
const classOf = (o) => o.rx_class || (o.source === 'RX_VALIDATED' ? 'RX' : 'OTC');

export default function CaregiverDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [view, setView] = useState('alerts');

  const [alerts, setAlerts] = useState(null);
  const [patients, setPatients] = useState([]);
  const [error, setError] = useState('');

  const loadPatients = useCallback(async () => {
    try {
      const r = await api('/api/caregiver/patients');
      setPatients(r.data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    api('/api/caregiver/alerts')
      .then((r) => setAlerts(r.data))
      .catch((e) => setError(e.message));
    loadPatients();
  }, [loadPatients]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="d-flex">
      <nav className="pm-sidebar d-flex flex-column p-3">
        <span className="pm-brand text-white mb-4">PharMate</span>
        <ul className="nav flex-column gap-1 flex-grow-1">
          {NAV.map(([k, label]) => (
            <li key={k}>
              <button
                className={
                  'nav-link text-start w-100 btn btn-link ' +
                  (view === k ? 'fw-bold text-white' : 'text-white-50')
                }
                onClick={() => setView(k)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
        <button className="btn btn-outline-secondary btn-sm mt-auto" onClick={handleLogout}>
          Sign out
        </button>
      </nav>

      <main className="pm-content" style={{ padding: '1.5rem', width: '100%' }}>
        {error && <div className="alert alert-warning py-2">{error}</div>}

        {view === 'alerts' && <AlertsView alerts={alerts} error={error} />}
        {view === 'patients' && <PatientsView patients={patients} />}
        {view === 'link' && (
          <LinkView
            onLinked={() => {
              loadPatients();
              setView('patients');
            }}
          />
        )}
      </main>
    </div>
  );
}

// ── UC-08: missed-dose alerts (read only) ─────────────────────────────────────
function AlertsView({ alerts }) {
  return (
    <>
      <h5 className="mb-1">Missed Dose Alerts</h5>
      <p className="text-muted small">
        You see each patient by their code only — never a name or condition.
      </p>
      {alerts === null && <div className="text-muted">Loading…</div>}
      {alerts && alerts.length === 0 && (
        <div className="pw-card p-4 text-center text-muted">No missed-dose alerts. 🎉</div>
      )}
      {alerts &&
        alerts.map((a) => (
          <div key={a.id} className="pw-card p-3 mb-2 d-flex align-items-center gap-3">
            <span style={{ fontSize: '1.4rem' }}>⚠️</span>
            <div className="flex-grow-1">
              <div>
                <strong className="pw-code">{a.patient_code}</strong> missed{' '}
                <strong>{a.drug_name || 'a dose'}</strong>
              </div>
              <div className="small text-muted">
                {a.scheduled_time ? new Date(a.scheduled_time).toLocaleString() : ''} · flagged{' '}
                {new Date(a.created_at).toLocaleString()}
              </div>
            </div>
            <span className="pw-code text-uppercase small">{a.status}</span>
          </div>
        ))}
    </>
  );
}

// ── Link via a patient-generated readable code (single-use, 24h TTL) ──────────
function LinkView({ onLinked }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function submit() {
    setMsg('');
    setErr('');
    try {
      await api('/api/caregiver/link', { method: 'POST', body: { code: code.trim() } });
      setMsg('Linked. You can now assist this patient from “My Patients”.');
      setCode('');
      onLinked();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <>
      <h5 className="mb-1">Link a Patient</h5>
      <p className="text-muted small">
        Ask the patient to generate an invite code in their app, then enter it here. Codes are
        single-use and expire after 24 hours.
      </p>
      {msg && <div className="alert alert-success py-2">{msg}</div>}
      {err && <div className="alert alert-warning py-2">{err}</div>}
      <div className="pw-card p-3" style={{ maxWidth: 420 }}>
        <label className="form-label fw-semibold">Invite code</label>
        <input
          className="form-control mb-2 text-uppercase"
          placeholder="e.g. A1B2C3D4"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button className="pm-btn-primary" onClick={submit} disabled={code.trim().length < 4}>
          Link patient
        </button>
      </div>
    </>
  );
}

// ── UC-09: service requests on a linked patient's behalf ──────────────────────
function PatientsView({ patients }) {
  const [selected, setSelected] = useState('');

  return (
    <>
      <h5 className="mb-1">My Patients</h5>
      <p className="text-muted small">
        Request refills, deliveries, and medication inquiries on a linked patient’s behalf. Same
        rules apply as for the patient — prescription medicines need an approved prescription on
        record.
      </p>

      {patients.length === 0 ? (
        <div className="pw-card p-4 text-center text-muted">
          No linked patients yet. Use “Link a Patient”.
        </div>
      ) : (
        <>
          <label className="form-label fw-semibold">Patient</label>
          <select
            className="form-select mb-3"
            style={{ maxWidth: 320 }}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select a patient</option>
            {patients.map((p) => (
              <option key={p.patient_code} value={p.patient_code}>
                {p.patient_code}
              </option>
            ))}
          </select>
          {selected && <PatientPanel code={selected} />}
        </>
      )}
    </>
  );
}

function PatientPanel({ code }) {
  const [meds, setMeds] = useState([]);
  const [branches, setBranches] = useState([]);
  const [orders, setOrders] = useState({ refills: [], deliveries: [] });
  const [form, setForm] = useState({
    kind: 'refill',
    medication_id: '',
    branch_id: '',
    address: '',
  });
  const [inquiry, setInquiry] = useState({ subject: '', drug_name: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const [m, b, o] = await Promise.all([
        api(`/api/caregiver/patients/${code}/medications`),
        api('/api/directory/branches'),
        api(`/api/caregiver/patients/${code}/orders`),
      ]);
      setMeds(m.data);
      setBranches(b.data);
      setOrders(o.data);
    } catch (e) {
      setErr(e.message);
    }
  }, [code]);

  useEffect(() => {
    setForm({ kind: 'refill', medication_id: '', branch_id: '', address: '' });
    setInquiry({ subject: '', drug_name: '' });
    setMsg('');
    load();
  }, [code, load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submitOrder() {
    setMsg('');
    setErr('');
    if (!form.medication_id) return setErr('Choose a medicine.');
    const path =
      form.kind === 'delivery'
        ? `/api/caregiver/patients/${code}/deliveries`
        : `/api/caregiver/patients/${code}/refills`;
    try {
      await api(path, {
        method: 'POST',
        body: {
          medication_id: form.medication_id,
          branch_id: form.branch_id || null,
          address: form.kind === 'delivery' ? form.address : undefined,
        },
      });
      setMsg(`${form.kind === 'delivery' ? 'Delivery' : 'Refill'} requested for ${code}.`);
      setForm({ kind: form.kind, medication_id: '', branch_id: '', address: '' });
      load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function submitInquiry() {
    setMsg('');
    setErr('');
    if (!inquiry.subject.trim()) return setErr('Enter a question or subject.');
    try {
      await api(`/api/caregiver/patients/${code}/inquiries`, {
        method: 'POST',
        body: { subject: inquiry.subject.trim(), drug_name: inquiry.drug_name.trim() || null },
      });
      setMsg('Inquiry sent to the pharmacy.');
      setInquiry({ subject: '', drug_name: '' });
    } catch (e) {
      setErr(e.message);
    }
  }

  const pill = (s) => (
    <span className={'pm-pill ' + (STATUS_CLS[s] || 'pm-pill--pending')}>{s}</span>
  );
  const history = [
    ...orders.refills.map((o) => ({ ...o, kind: 'Refill' })),
    ...orders.deliveries.map((o) => ({ ...o, kind: 'Delivery' })),
  ].sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));

  return (
    <>
      {msg && <div className="alert alert-success py-2">{msg}</div>}
      {err && <div className="alert alert-warning py-2">{err}</div>}

      {/* Refill / delivery */}
      <div className="pw-card p-3 mb-3">
        <h6 className="fw-bold">Refill or delivery</h6>
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
          <option value="">{meds.length ? 'Select medicine' : 'No active medicines'}</option>
          {meds.map((m) => (
            <option key={m.id} value={m.id}>
              {m.drug_name_raw} {classOf(m) === 'RX' ? '(Rx)' : '(OTC)'}
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

        <button className="pm-btn-primary mt-2" onClick={submitOrder} disabled={!meds.length}>
          Request {form.kind}
        </button>
      </div>

      {/* Medication inquiry */}
      <div className="pw-card p-3 mb-3">
        <h6 className="fw-bold">Ask the pharmacist</h6>
        <label className="form-label fw-semibold">Question / subject</label>
        <input
          className="form-control mb-2"
          placeholder="e.g. Can this be taken with food?"
          value={inquiry.subject}
          onChange={(e) => setInquiry((q) => ({ ...q, subject: e.target.value }))}
        />
        <label className="form-label fw-semibold">Medicine (optional)</label>
        <input
          className="form-control mb-2"
          placeholder="e.g. amlodipine"
          value={inquiry.drug_name}
          onChange={(e) => setInquiry((q) => ({ ...q, drug_name: e.target.value }))}
        />
        <button className="pm-btn-primary mt-2" onClick={submitInquiry}>
          Send inquiry
        </button>
      </div>

      {/* Order status */}
      <h6 className="fw-bold">Request status</h6>
      {history.length === 0 ? (
        <p className="text-muted small">No requests yet.</p>
      ) : (
        history.map((o) => (
          <div
            key={o.kind + o.id}
            className="pw-card d-flex align-items-center justify-content-between p-3 mb-2"
          >
            <div>
              <div className="fw-semibold">{o.drug}</div>
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
