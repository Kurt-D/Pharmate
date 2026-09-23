import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, ClipboardList, RefreshCw, Send, TriangleAlert } from 'lucide-react';
import { api } from '../../api.js';
export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  async function load() {
    try {
      const r = await api('/api/pharmacist/followups');
      setAlerts(r.data);
      setSelected((current) => current || r.data[0] || null);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function action(type) {
    if (!selected) return;
    try {
      await api(`/api/pharmacist/followups/${selected.id}/${type}`, { method: 'POST' });
      if (type === 'resolve') {
        setSelected(null);
        load();
      }
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <main className="px-alerts">
      {error && <div className="alert alert-warning">{error}</div>}
      <header className="px-alert-page-heading">
        <div><span>CLINICAL FOLLOW-UPS</span><h2>Medication alerts</h2><p>Review missed-dose alerts and send a timely patient reminder.</p></div>
        <button onClick={load} type="button"><RefreshCw size={16} /> Refresh alerts</button>
      </header>
      <div className="px-alert-stats">
        <div>
          <TriangleAlert aria-hidden="true" />
          <span>
            <small>Total Alerts</small>
            <strong>{alerts.length}</strong>
          </span>
        </div>
        <div>
          <BellRing aria-hidden="true" />
          <span>
            <small>Unresolved</small>
            <strong>{alerts.length}</strong>
          </span>
        </div>
        <div>
          <CheckCircle2 aria-hidden="true" />
          <span>
            <small>Resolved</small>
            <strong>—</strong>
          </span>
        </div>
      </div>
      <div className="px-alert-layout">
        <section className="px-panel">
          <h2>Alerts / Inquiries List ({alerts.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Alert ID</th>
                <th>Patient ID</th>
                <th>Received</th>
                <th>Medicine</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className={selected?.id === a.id ? 'selected' : ''} onClick={() => setSelected(a)}>
                  <td>{a.id.slice(0, 8)}</td>
                  <td>{a.patient_code}</td>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td>{a.drug_name || 'Missed dose'}</td>
                  <td>
                    <em>Unresolved</em>
                  </td>
                  <td>
                    <button onClick={() => setSelected(a)} type="button">Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <aside className="px-panel px-alert-detail">
          {selected ? (
            <>
              <div>
                <em>Unresolved</em>
                <small>Alert ID: {selected.id.slice(0, 8)}</small>
              </div>
              <h2>ID: {selected.patient_code}</h2>
              <h3><ClipboardList aria-hidden="true" size={14} /> Details</h3>
              <dl>
                <dt>Reason</dt>
                <dd>Missed dose</dd>
                <dt>Received On</dt>
                <dd>{new Date(selected.created_at).toLocaleString()}</dd>
                <dt>Scheduled Time</dt>
                <dd>{new Date(selected.scheduled_time || selected.created_at).toLocaleString()}</dd>
                <dt>Status</dt>
                <dd>Unresolved</dd>
              </dl>
              <h3>Take Action</h3>
              <button className="primary" onClick={() => action('remind')} type="button">
                <Send size={16} /> Send patient reminder
              </button>
              <button className="success" onClick={() => action('resolve')} type="button">
                Mark as Resolved
              </button>
            </>
          ) : (
            <p className="px-empty">Select an alert.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
