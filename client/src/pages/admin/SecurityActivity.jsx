import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : 'Unknown time';
}

// This view intentionally presents identifiers and operational metadata only.
// It must never turn audit activity into a second patient-record browser.
export default function SecurityActivity() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api('/api/admin/audit-events?limit=100');
      setEvents(Array.isArray(response.data) ? response.data : []);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Security activity could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="admin-dashboard-section">
      <div className="admin-workspace-actions">
        <button className="btn btn-outline-primary" disabled={loading} onClick={load} type="button">Refresh</button>
      </div>
      {error && <div className="admin-priority-error">{error}</div>}
      {loading ? <p>Loading security activity…</p> : (
        <div className="table-responsive">
          <table className="table align-middle">
            <thead><tr><th>Time</th><th>Role</th><th>Action</th><th>Record type</th><th>Patient code</th><th>Outcome details</th></tr></thead>
            <tbody>
              {events.length === 0 ? <tr><td colSpan="6">No audit activity is available yet.</td></tr> : events.map((event) => (
                <tr key={event.id}>
                  <td>{formatDate(event.created_at)}</td>
                  <td>{event.actor_role || 'system'}</td>
                  <td>{event.action}</td>
                  <td>{event.entity_type || '—'}</td>
                  <td>{event.patient_code || '—'}</td>
                  <td>{Object.entries(event.metadata || {}).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
