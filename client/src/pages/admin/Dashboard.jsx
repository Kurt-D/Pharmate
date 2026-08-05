import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Admin dashboard overview (Fig 50). Anonymized aggregates + adherence trend +
// recent alerts + recent orders. No payment amounts (D-4). No PII (TC-05).
function Stat({ label, value }) {
  return (
    <div className="col-6 col-lg">
      <div className="pw-card p-3 text-center h-100">
        <div className="fs-4 fw-bold">{value}</div>
        <div className="small text-muted">{label}</div>
      </div>
    </div>
  );
}

// Minimal inline line chart from [{date, pct}].
function TrendChart({ data }) {
  const pts = data.filter((d) => d.pct != null);
  if (pts.length < 2) return <div className="text-muted small py-4">Not enough data yet.</div>;
  const w = 480;
  const h = 120;
  const max = 100;
  const step = w / (pts.length - 1);
  const coords = pts.map((d, i) => [i * step, h - (d.pct / max) * h]);
  const path = coords
    .map((c, i) => (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ' ' + c[1].toFixed(1))
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 140 }}>
      <path d={path} fill="none" stroke="#2563eb" strokeWidth="2" />
      {coords.map((c, i) => (
        <circle key={i} cx={c[0]} cy={c[1]} r="3" fill="#2563eb" />
      ))}
    </svg>
  );
}

export default function Dashboard() {
  const [agg, setAgg] = useState(null);
  const [trend, setTrend] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api('/api/admin/aggregates'),
      api('/api/admin/adherence-trend?days=7'),
      api('/api/admin/alerts'),
      api('/api/admin/orders'),
    ])
      .then(([a, t, al, o]) => {
        setAgg(a.data);
        setTrend(t.data);
        setAlerts(al.data.slice(0, 5));
        setOrders(o.data.orders.slice(0, 6));
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-warning">{error}</div>;
  if (!agg) return <div className="text-muted">Loading…</div>;

  return (
    <>
      <div className="row g-3 mb-4">
        <Stat label="Total patients" value={agg.patients} />
        <Stat label="Active medications" value={agg.active_medications} />
        <Stat
          label="Adherence (avg)"
          value={agg.adherence.average_pct == null ? '—' : `${agg.adherence.average_pct}%`}
        />
        <Stat label="Refill queue" value={Object.values(agg.refills).reduce((a, b) => a + b, 0)} />
        <Stat label="No-caregiver flags" value={agg.no_caregiver_followups_open} />
      </div>

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="pw-card p-3 mb-3">
            <strong className="d-block mb-2">Adherence rate — last 7 days</strong>
            <TrendChart data={trend} />
          </div>
          <div className="pw-card p-3">
            <strong className="d-block mb-2">Recent orders</strong>
            {orders.length === 0 ? (
              <div className="text-muted small">No orders.</div>
            ) : (
              <table className="table table-sm mb-0">
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="pw-code">{o.patient_code}</td>
                      <td>{o.drug}</td>
                      <td className="text-capitalize small text-muted">{o.kind}</td>
                      <td className="text-end">
                        <span className="badge bg-secondary-subtle text-dark">{o.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="col-lg-5">
          <div className="pw-card p-3">
            <strong className="d-block mb-2">Recent alerts</strong>
            {alerts.length === 0 ? (
              <div className="text-muted small">No alerts. 🎉</div>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className="d-flex align-items-start gap-2 mb-2">
                  <span>⚠️</span>
                  <div className="small">
                    <span className="pw-code">{a.patient_code}</span> missed{' '}
                    <strong>{a.drug || 'a dose'}</strong>
                    <div className="text-muted">{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
