import { BellRing, MonitorCog, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api.js';

export default function PharmacistSettings() {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preferences, setPreferences] = useState({
    urgentAlerts: true,
    dailySummary: true,
    compactQueue: false,
  });

  useEffect(() => {
    api('/api/pharmacist/preferences')
      .then((response) => setPreferences(response.data))
      .catch((requestError) => setError(requestError.message || 'Unable to load preferences.'))
      .finally(() => setLoading(false));
  }, []);

  function updatePreference(name) {
    setSaved(false);
    setPreferences((current) => ({ ...current, [name]: !current[name] }));
  }

  async function savePreferences() {
    setLoading(true);
    setError('');
    try {
      const response = await api('/api/pharmacist/preferences', { method: 'PUT', body: preferences });
      setPreferences(response.data);
      setSaved(true);
    } catch (requestError) {
      setError(requestError.message || 'Unable to save preferences.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="px-settings">
      <section className="px-settings-grid">
        {error && <div className="alert alert-warning">{error}</div>}
        <article className="px-settings-card">
          <header><span><ShieldCheck size={19} /></span><div><h3>Account</h3><p>Your signed-in pharmacist identity.</p></div></header>
          <dl>
            <div><dt>Name</dt><dd>{user?.full_name || 'Pharmacist account'}</dd></div>
            <div><dt>Email</dt><dd>{user?.email || 'Not available'}</dd></div>
            <div><dt>Role</dt><dd>Pharmacist</dd></div>
          </dl>
        </article>

        <article className="px-settings-card">
          <header><span><BellRing size={19} /></span><div><h3>Notifications</h3><p>Choose which clinical updates need your attention.</p></div></header>
          <label className="px-settings-toggle"><span><strong>Urgent medication alerts</strong><small>Missed-dose and priority patient alerts</small></span><input checked={preferences.urgentAlerts} onChange={() => updatePreference('urgentAlerts')} type="checkbox" /></label>
          <label className="px-settings-toggle"><span><strong>Daily queue summary</strong><small>A summary of pending clinical work</small></span><input checked={preferences.dailySummary} onChange={() => updatePreference('dailySummary')} type="checkbox" /></label>
        </article>

        <article className="px-settings-card">
          <header><span><MonitorCog size={19} /></span><div><h3>Workspace</h3><p>Adjust the information density in your work queues.</p></div></header>
          <label className="px-settings-toggle"><span><strong>Compact queues</strong><small>Show more requests while preserving readable labels</small></span><input checked={preferences.compactQueue} onChange={() => updatePreference('compactQueue')} type="checkbox" /></label>
        </article>
      </section>

      <footer className="px-settings-actions">
        {saved && <span>Preferences saved for this session.</span>}
        <button disabled={loading} onClick={savePreferences} type="button">{loading ? 'Saving…' : 'Save preferences'}</button>
      </footer>
    </main>
  );
}
