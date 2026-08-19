import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';

export default function PatientsRedesign() {
  const [patients, setPatients] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  async function load() {
    try {
      const [p, a] = await Promise.all([
        api('/api/pharmacist/patients'),
        api('/api/pharmacist/followups'),
      ]);
      setPatients(p.data);
      setAlerts(a.data);
      setSelected((current) => current || p.data[0] || null);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const shown = useMemo(
    () => patients.filter((p) => p.patient_code.toLowerCase().includes(query.toLowerCase())),
    [patients, query]
  );
  async function remind(id) {
    try {
      await api(`/api/pharmacist/followups/${id}/remind`, { method: 'POST' });
    } catch (e) {
      setError(e.message);
    }
  }
  async function resolve(id) {
    try {
      await api(`/api/pharmacist/followups/${id}/resolve`, { method: 'POST' });
      load();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <main className="px-patients">
      {error && <div className="alert alert-warning">{error}</div>}
      <div className="px-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patients by ID…"
        />
        <button>☷⌄</button>
        <button onClick={load}>↻</button>
      </div>
      <div className="px-patient-stats">
        <div>
          <i>♟</i>
          <span>
            <small>Total Patients</small>
            <strong>{patients.length}</strong>
          </span>
        </div>
        <div>
          <i>♟</i>
          <span>
            <small>Active Patients</small>
            <strong>{patients.filter((p) => p.active_meds > 0).length}</strong>
          </span>
        </div>
        <div>
          <i>♿</i>
          <span>
            <small>Priority Patients</small>
            <strong>{patients.filter((p) => p.priority).length}</strong>
          </span>
        </div>
      </div>
      <div className="px-patient-columns">
        <section className="px-panel px-patient-list">
          <h2>Patient List ({shown.length})</h2>
          {shown.map((p, i) => (
            <button
              key={p.patient_code}
              className={selected?.patient_code === p.patient_code ? 'selected' : ''}
              onClick={() => setSelected(p)}
            >
              <i className={`c${i % 4}`}>{p.patient_code.slice(-3)}</i>
              <span>
                <strong>ID: {p.patient_code}</strong>
                <small>{p.active_meds} active medicines</small>
                <small>{p.adherence_pct ?? '—'}% adherence</small>
              </span>
            </button>
          ))}
        </section>
        <section className="px-panel px-patient-detail">
          {selected ? (
            <>
              <div className="px-detail-title">
                <h2>ID: {selected.patient_code}</h2>
                {selected.priority && <em>Priority</em>}
              </div>
              <h3>♙ Patient Information</h3>
              <dl>
                <div>
                  <dt>Patient ID</dt>
                  <dd>{selected.patient_code}</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>{selected.priority ? 'Priority' : 'Standard'}</dd>
                </div>
                <div>
                  <dt>Active Medicines</dt>
                  <dd>{selected.active_meds}</dd>
                </div>
                <div>
                  <dt>Adherence</dt>
                  <dd>
                    {selected.adherence_pct == null ? 'No data' : `${selected.adherence_pct}%`}
                  </dd>
                </div>
              </dl>
              <div className="px-notes">
                <strong>▣ Notes</strong>
                <p>Clinical PII is protected. Use the patient code for operational follow-up.</p>
              </div>
              <h3>Follow-ups Due</h3>
              {alerts
                .filter((a) => a.patient_code === selected.patient_code)
                .map((a) => (
                  <div className="px-followup-row" key={a.id}>
                    <span>
                      <strong>{a.drug_name || 'Medication follow-up'}</strong>
                      <small>{new Date(a.scheduled_time || a.created_at).toLocaleString()}</small>
                    </span>
                    <button onClick={() => remind(a.id)}>Send Reminder</button>
                  </div>
                ))}
            </>
          ) : (
            <p className="px-empty">Select a patient.</p>
          )}
        </section>
        <aside className="px-panel px-alert-list">
          <h2>Alerts</h2>
          {alerts.map((a) => (
            <article key={a.id}>
              <div>
                <strong>ID: {a.patient_code}</strong>
                <time>{new Date(a.created_at).toLocaleTimeString()}</time>
              </div>
              <p>
                <b>Missed:</b> {a.drug_name || 'Medicine'}
                <br />
                <b>Scheduled:</b> {new Date(a.scheduled_time || a.created_at).toLocaleString()}
              </p>
              <div>
                <button onClick={() => remind(a.id)}>Send Reminder</button>
                <button onClick={() => resolve(a.id)}>Mark Resolved</button>
              </div>
            </article>
          ))}
        </aside>
      </div>
    </main>
  );
}
