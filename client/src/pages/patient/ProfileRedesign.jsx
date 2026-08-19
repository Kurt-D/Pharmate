import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';

export default function ProfileRedesign() {
  const navigate = useNavigate(); const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [profile, setProfile] = useState({ full_name: '', medical_condition: '', patient_code: user?.patientCode || '—', created_at: null });
  const [draft, setDraft] = useState({ full_name: '', medical_condition: '' }); const [preferences, setPreferences] = useState(null); const [caregivers, setCaregivers] = useState([]);
  const [invite, setInvite] = useState(null); const [panel, setPanel] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function load() { try { const [p, prefs, linked] = await Promise.all([api('/api/patient/profile'), api('/api/patient/preferences'), api('/api/patient/caregivers')]); setProfile(p.data); setDraft({ full_name: p.data.full_name || '', medical_condition: p.data.medical_condition || '' }); setPreferences(prefs.data); setCaregivers(linked.data); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, []);
  async function generateCode() { setBusy(true); setError(''); try { const response = await api('/api/patient/invite', { method: 'POST' }); setInvite(response.data); setMessage('A new single-use caregiver code was generated.'); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function copyCode() { if (!invite?.code) return; await navigator.clipboard.writeText(invite.code); setMessage('Caregiver code copied.'); }
  async function shareCode() { if (!invite?.code) return; const text = `Use this one-time PharMate caregiver code: ${invite.code}`; if (navigator.share) await navigator.share({ title: 'PharMate caregiver access', text }); else { await navigator.clipboard.writeText(text); setMessage('Share message copied.'); } }
  async function saveProfile() { setBusy(true); setError(''); try { await api('/api/patient/profile', { method: 'PUT', body: draft }); setProfile((current) => ({ ...current, ...draft })); setPanel(''); setMessage('Profile updated.'); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function updatePreference(key, value) { try { const response = await api('/api/patient/preferences', { method: 'PUT', body: { [key]: value } }); setPreferences(response.data); setMessage('Preference saved.'); } catch (e) { setError(e.message); } }
  async function handleLogout() { await logout(); navigate('/login', { replace: true }); }
  const initials = (profile.full_name || 'Patient').split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const memberSince = profile.created_at ? new Date(profile.created_at).getFullYear() : '—';
  return <main className="pm-profile-page">
    <header><div><h1>{t('profile.title')}</h1><p>{t('profile.subtitle')}</p></div><span>▱⌄</span></header>
    {error && <div className="pm-banner pm-banner--warn">{error}</div>}{message && <div className="pm-banner pm-banner--success">{message}</div>}
    <section className="pm-profile-identity"><div className="pm-profile-avatar">{initials}<i /></div><div><h2>{profile.full_name || 'Patient'}</h2><small>{t('profile.personal')}</small><dl><div><dt>▣ {t('profile.member')}</dt><dd>{memberSince}</dd></div><div><dt>▤ {t('profile.patientId')}</dt><dd>{profile.patient_code}</dd></div></dl></div></section>
    <div className="pm-profile-heading"><h2>{t('profile.caregiverTitle')}</h2><p>{t('profile.caregiverSubtitle')}</p></div>
    <section className="pm-caregiver-card"><div className="pm-caregiver-intro"><i>♙</i><span><strong>{t('profile.shareTitle')}</strong><small>{t('profile.shareHelp')}</small></span><b>👩‍⚕️🔒👵</b></div><div className="pm-caregiver-code"><small>{t('profile.code')}</small>{invite ? <><strong>{invite.code}</strong><p>Single-use · expires {new Date(invite.expires_at).toLocaleString()}</p></> : <><strong>{t('profile.generate')}</strong><p>{t('profile.expiry')}</p></>}<div><button disabled={!invite} onClick={shareCode}>⌯ {t('profile.share')}</button><button disabled={!invite} onClick={copyCode}>▣ {t('profile.copy')}</button><button disabled={busy} onClick={generateCode}>↻ {t('profile.newCode')}</button></div></div>{caregivers.length > 0 && <div className="pm-linked-caregivers"><strong>{t('profile.linked')}</strong>{caregivers.map((item) => <span key={item.id}>{item.email}</span>)}</div>}</section>
    <section className="pm-profile-menu">
      <button onClick={() => setPanel(panel === 'edit' ? '' : 'edit')}><i>▣</i><span>{t('profile.edit')}</span><b>›</b></button>
      {panel === 'edit' && <div className="pm-profile-panel"><label>{t('profile.fullName')}<input value={draft.full_name} onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))} /></label><label>{t('profile.condition')}<textarea rows="2" value={draft.medical_condition} onChange={(e) => setDraft((d) => ({ ...d, medical_condition: e.target.value }))} /></label><button onClick={saveProfile} disabled={busy}>{t('profile.save')}</button></div>}
      <button onClick={() => setPanel(panel === 'language' ? '' : 'language')}><i>◉</i><span>{t('profile.language')}</span><b>›</b></button>
      {panel === 'language' && <div className="pm-profile-panel"><label>{t('profile.displayLanguage')}<select value={language} onChange={(e) => { setLanguage(e.target.value); setMessage(e.target.value === 'fil' ? 'Nakatakda na sa Filipino ang display.' : 'Display language changed to English.'); }}><option value="en">English</option><option value="fil">Filipino</option></select></label></div>}
      <button onClick={() => setPanel(panel === 'notifications' ? '' : 'notifications')}><i>♧</i><span>{t('profile.notifications')}</span><b>›</b></button>
      {panel === 'notifications' && preferences && <div className="pm-profile-panel pm-profile-toggles"><label><span>{t('profile.reminders')}</span><input type="checkbox" checked={preferences.reminders_enabled} onChange={(e) => updatePreference('reminders_enabled', e.target.checked)} /></label><label><span>{t('profile.voice')}</span><input type="checkbox" checked={preferences.voice_enabled} onChange={(e) => updatePreference('voice_enabled', e.target.checked)} /></label><label><span>{t('profile.vibration')}</span><input type="checkbox" checked={preferences.vibration_enabled} onChange={(e) => updatePreference('vibration_enabled', e.target.checked)} /></label></div>}
      <button onClick={() => setPanel(panel === 'privacy' ? '' : 'privacy')}><i>⬟</i><span>{t('profile.privacy')}</span><b>›</b></button>
      {panel === 'privacy' && <div className="pm-profile-panel"><p>{t('profile.privacyText')}</p></div>}
    </section>
    <div className="pm-profile-heading"><h2>{t('profile.others')}</h2></div><section className="pm-profile-menu"><button onClick={() => navigate('/patient/ask')}><i>▤</i><span>{t('profile.support')}</span><b>›</b></button><button className="logout" onClick={handleLogout}><i>↪</i><span>{t('profile.logout')}</span><b /></button></section>
  </main>;
}
