import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';

const date = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Recently used';

export default function SecuritySessions() {
  const [sessions, setSessions] = useState([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState('');
  const load = useCallback(async () => { setLoading(true); try { const response = await api('/api/patient/security/sessions'); setSessions(response.data.sessions || []); setError(''); } catch (err) { setError(err.message || 'We could not load your signed-in devices.'); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const revoke = async (sessionRef) => { setBusy(sessionRef); try { await api(`/api/patient/security/sessions/${sessionRef}`, { method: 'DELETE' }); await load(); } catch (err) { setError(err.message || 'We could not sign out that device.'); } finally { setBusy(''); } };
  const revokeAll = async () => { setBusy('all'); try { await api('/api/patient/security/sessions/revoke-all', { method: 'POST' }); window.location.assign('/login?reason=session-expired'); } catch (err) { setError(err.message || 'We could not sign out your devices.'); } finally { setBusy(''); } };
  return <main className="pm-security-page"><header><p>Account security</p><h1>Signed-in devices</h1><span>See where your PharMate account is signed in. You can sign out a device you do not recognize.</span></header>{error && <p className="pm-security-error" role="alert">{error}</p>}<section>{loading ? <p>Loading your devices…</p> : sessions.length === 0 ? <p>No active devices were found.</p> : sessions.map((session) => <article key={session.sessionRef}><div><strong>{session.label}</strong><small>{session.trusted ? 'Stays signed in on this device' : 'Current browser session'} · Last active {date(session.lastActiveAt)}</small></div><button disabled={busy === session.sessionRef} onClick={() => revoke(session.sessionRef)} type="button">{busy === session.sessionRef ? 'Signing out…' : 'Sign out device'}</button></article>)}</section><button className="pm-security-revoke-all" disabled={busy === 'all'} onClick={revokeAll} type="button">{busy === 'all' ? 'Signing out…' : 'Sign out all devices'}</button></main>;
}
