import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import '../../styles/profile-page.css';
import '../../styles/lively-blue.css';

function Icon({ name, size = 22 }) {
  const paths = {
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    id: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8" cy="10" r="2" />
        <path d="M6 15c.7-1.4 3.3-1.4 4 0M13 9h5M13 13h5" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    heart: (
      <>
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
        <path d="M8 12h2l1-2 2 4 1-2h2" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    caregiver: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0M17 11v6M14 14h6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.1 9a7 7 0 0 1 11.8-2L20 12M4 12l2.1 5a7 7 0 0 0 11.8-2" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </>
    ),
    language: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    type: (
      <>
        <path d="M4 7V4h16v3M9 20h6M12 4v16" />
      </>
    ),
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />,
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.35"
    >
      {paths[name]}
    </svg>
  );
}

export default function ProfileRedesign() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const tr = (en, fil) => (language === 'fil' ? fil : en);
  const [profile, setProfile] = useState({
    full_name: '',
    medical_condition: '',
    patient_code: user?.patientCode || '—',
    created_at: null,
  });
  const [draft, setDraft] = useState({ full_name: '', medical_condition: '' });
  const [preferences, setPreferences] = useState(null);
  const [caregivers, setCaregivers] = useState([]);
  const [invite, setInvite] = useState(null);
  const [inviteClock, setInviteClock] = useState(Date.now());
  const [panel, setPanel] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [p, prefs, linked] = await Promise.all([
        api('/api/patient/profile'),
        api('/api/patient/preferences'),
        api('/api/patient/caregivers'),
      ]);
      setProfile(p.data);
      setDraft({
        full_name: p.data.full_name || '',
        medical_condition: p.data.medical_condition || '',
      });
      setPreferences(prefs.data);
      setCaregivers(linked.data);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!invite) return undefined;
    setInviteClock(Date.now());
    const timer = window.setInterval(() => setInviteClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [invite]);
  async function generateCode() {
    setBusy(true);
    setError('');
    try {
      const response = await api('/api/patient/caregiver-link-code', { method: 'POST' });
      setInvite(response.data);
      setMessage('A new single-use caregiver code was generated.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function copyCode() {
    if (!invite?.code) return;
    await navigator.clipboard.writeText(invite.code);
    setMessage('Caregiver code copied.');
  }
  async function shareCode() {
    if (!invite?.code) return;
    const text = `Use this one-time PharMate caregiver code: ${invite.code}`;
    if (navigator.share) await navigator.share({ title: 'PharMate caregiver access', text });
    else {
      await navigator.clipboard.writeText(text);
      setMessage('Share message copied.');
    }
  }
  async function saveProfile() {
    setBusy(true);
    setError('');
    try {
      await api('/api/patient/profile', { method: 'PUT', body: draft });
      setProfile((current) => ({ ...current, ...draft }));
      setPanel('');
      setMessage('Profile updated.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function updatePreference(key, value) {
    try {
      const response = await api('/api/patient/preferences', {
        method: 'PUT',
        body: { [key]: value },
      });
      setPreferences(response.data);
      setMessage('Preference saved.');
    } catch (e) {
      setError(e.message);
    }
  }
  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }
  const initials = (profile.full_name || 'Patient')
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const memberSince = profile.created_at ? new Date(profile.created_at).getFullYear() : '—';
  const inviteSeconds = invite
    ? Math.max(0, Math.ceil((new Date(invite.expires_at).getTime() - inviteClock) / 1000))
    : 0;
  const inviteTime = `${Math.floor(inviteSeconds / 60)}:${String(inviteSeconds % 60).padStart(2, '0')}`;
  return (
    <main className="pm-profile-page">
      <header>
        <div>
          <h1>{t('profile.title')}</h1>
          <p>{t('profile.subtitle')}</p>
        </div>
      </header>
      {error && (
        <div className="pm-banner pm-banner--warn pm-profile-alert">
          <Icon name="shield" />
          <span>
            <strong>
              {tr('Unable to load your latest profile', 'Hindi ma-load ang pinakabagong profile')}
            </strong>
            <small>
              {tr('Please try again in a moment.', 'Pakisubukan muli pagkalipas ng ilang sandali.')}
            </small>
          </span>
        </div>
      )}
      {message && (
        <div className="pm-banner pm-banner--success pm-profile-alert">
          <Icon name="check" />
          <span>
            <strong>{message}</strong>
            <small>
              {tr(
                'Your account information is up to date.',
                'Updated na ang impormasyon ng iyong account.'
              )}
            </small>
          </span>
        </div>
      )}
      <section className="pm-profile-identity">
        <div className="pm-profile-avatar">
          {initials}
          <i />
        </div>
        <div>
          <h2>{profile.full_name || 'Patient'}</h2>
          <small>{t('profile.personal')}</small>
          <dl>
            <div>
              <dt>
                <Icon name="calendar" size={15} /> {t('profile.member')}
              </dt>
              <dd>{memberSince}</dd>
            </div>
            <div>
              <dt>
                <Icon name="id" size={15} /> {t('profile.patientId')}
              </dt>
              <dd>{profile.patient_code}</dd>
            </div>
            <div className="pm-profile-email">
              <dt>
                <Icon name="mail" size={15} /> {tr('Email address', 'Email address')}
              </dt>
              <dd>{user?.email || tr('Not available', 'Hindi available')}</dd>
            </div>
          </dl>
        </div>
        <button
          aria-expanded={showDetails}
          className="pm-profile-details-toggle"
          onClick={() => setShowDetails((value) => !value)}
          type="button"
        >
          <span>
            {showDetails
              ? tr('Hide details', 'Itago ang details')
              : tr('View more details', 'Tingnan ang iba pang details')}
          </span>
          <Icon name="chevron" size={20} />
        </button>
        {showDetails && (
          <div className="pm-profile-more-details">
            <div>
              <span>
                <Icon name="heart" size={20} />
              </span>
              <p>
                <small>{tr('Medical information', 'Medical information')}</small>
                <strong>
                  {profile.medical_condition ||
                    tr('No medical condition added', 'Walang medical condition na inilagay')}
                </strong>
              </p>
            </div>
            <div>
              <span>
                <Icon name="users" size={20} />
              </span>
              <p>
                <small>{tr('Linked caregivers', 'Naka-link na caregivers')}</small>
                <strong>
                  {caregivers.length}{' '}
                  {caregivers.length === 1
                    ? tr('caregiver', 'caregiver')
                    : tr('caregivers', 'caregivers')}
                </strong>
              </p>
            </div>
            <div>
              <span>
                <Icon name="shield" size={20} />
              </span>
              <p>
                <small>{tr('Account status', 'Account status')}</small>
                <strong className="pm-profile-active-status">
                  <Icon name="check" size={16} />{' '}
                  {tr('Active and protected', 'Aktibo at protektado')}
                </strong>
              </p>
            </div>
          </div>
        )}
      </section>
      <div className="pm-profile-heading">
        <h2>{t('profile.caregiverTitle')}</h2>
        <p>{t('profile.caregiverSubtitle')}</p>
      </div>
      <section className="pm-caregiver-card">
        <div className="pm-caregiver-intro">
          <i>
            <Icon name="caregiver" />
          </i>
          <span>
            <strong>{t('profile.shareTitle')}</strong>
            <small>{t('profile.shareHelp')}</small>
          </span>
          <b aria-label={tr('Secure caregiver access', 'Ligtas na caregiver access')}>
            <Icon name="lock" />
          </b>
        </div>
        <div className="pm-caregiver-code">
          <small>{t('profile.code')}</small>
          {invite ? (
            <>
              <strong>{invite.code}</strong>
              <p>
                {inviteSeconds > 0
                  ? `Single-use · expires in ${inviteTime}`
                  : 'This code has expired. Generate a new code.'}
              </p>
            </>
          ) : (
            <>
              <strong>{t('profile.generate')}</strong>
              <p>{t('profile.expiry')}</p>
            </>
          )}
          <div>
            <button disabled={!invite || inviteSeconds === 0} onClick={shareCode}>
              <Icon name="share" size={18} /> {t('profile.share')}
            </button>
            <button disabled={!invite || inviteSeconds === 0} onClick={copyCode}>
              <Icon name="copy" size={18} /> {t('profile.copy')}
            </button>
            <button disabled={busy} onClick={generateCode}>
              <Icon name="refresh" size={18} /> {t('profile.newCode')}
            </button>
          </div>
        </div>
        {caregivers.length > 0 && (
          <div className="pm-linked-caregivers">
            <strong>{t('profile.linked')}</strong>
            {caregivers.map((item) => (
              <span key={item.id}>
                <b>{item.email}</b>
                <small>{item.relationship || tr('Caregiver', 'Caregiver')}</small>
              </span>
            ))}
          </div>
        )}
      </section>
      <section className="pm-profile-menu">
        <button onClick={() => setPanel(panel === 'edit' ? '' : 'edit')}>
          <i>
            <Icon name="edit" />
          </i>
          <span>
            <strong>{t('profile.edit')}</strong>
            <small>
              {tr(
                'Update your personal and health details',
                'I-update ang personal at health details'
              )}
            </small>
          </span>
          <b>
            <Icon name="chevron" size={20} />
          </b>
        </button>
        {panel === 'edit' && (
          <div className="pm-profile-panel">
            <label>
              {t('profile.fullName')}
              <input
                value={draft.full_name}
                onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
              />
            </label>
            <label>
              {t('profile.condition')}
              <textarea
                rows="2"
                value={draft.medical_condition}
                onChange={(e) => setDraft((d) => ({ ...d, medical_condition: e.target.value }))}
              />
            </label>
            <button onClick={saveProfile} disabled={busy}>
              {t('profile.save')}
            </button>
          </div>
        )}
        <button onClick={() => setPanel(panel === 'language' ? '' : 'language')}>
          <i>
            <Icon name="language" />
          </i>
          <span>
            <strong>{t('profile.language')}</strong>
            <small>{tr('Choose English or Filipino', 'Pumili ng English o Filipino')}</small>
          </span>
          <b>
            <Icon name="chevron" size={20} />
          </b>
        </button>
        {panel === 'language' && (
          <div className="pm-profile-panel">
            <label>
              {t('profile.displayLanguage')}
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  setMessage(
                    e.target.value === 'fil'
                      ? 'Nakatakda na sa Filipino ang display.'
                      : 'Display language changed to English.'
                  );
                }}
              >
                <option value="en">English</option>
                <option value="fil">Filipino</option>
              </select>
            </label>
          </div>
        )}
        <button onClick={() => setPanel(panel === 'notifications' ? '' : 'notifications')}>
          <i>
            <Icon name="bell" />
          </i>
          <span>
            <strong>{t('profile.notifications')}</strong>
            <small>
              {tr(
                'Manage reminders, voice, and vibration',
                'I-manage ang reminders, voice, at vibration'
              )}
            </small>
          </span>
          <b>
            <Icon name="chevron" size={20} />
          </b>
        </button>
        {panel === 'notifications' && preferences && (
          <div className="pm-profile-panel pm-profile-toggles">
            <label>
              <span>{t('profile.reminders')}</span>
              <input
                type="checkbox"
                checked={preferences.reminders_enabled}
                onChange={(e) => updatePreference('reminders_enabled', e.target.checked)}
              />
            </label>
            <label>
              <span>{t('profile.voice')}</span>
              <input
                type="checkbox"
                checked={preferences.voice_enabled}
                onChange={(e) => updatePreference('voice_enabled', e.target.checked)}
              />
            </label>
            <label>
              <span>{t('profile.vibration')}</span>
              <input
                type="checkbox"
                checked={preferences.vibration_enabled}
                onChange={(e) => updatePreference('vibration_enabled', e.target.checked)}
              />
            </label>
          </div>
        )}
        <button onClick={() => setPanel(panel === 'privacy' ? '' : 'privacy')}>
          <i>
            <Icon name="shield" />
          </i>
          <span>
            <strong>{t('profile.privacy')}</strong>
            <small>
              {tr(
                'Review how your health information is protected',
                'Tingnan kung paano pinoprotektahan ang health information'
              )}
            </small>
          </span>
          <b>
            <Icon name="chevron" size={20} />
          </b>
        </button>
        {panel === 'privacy' && (
          <div className="pm-profile-panel">
            <p>{t('profile.privacyText')}</p>
          </div>
        )}
        <button onClick={() => navigate('/patient/accessibility')}>
          <i>
            <Icon name="type" />
          </i>
          <span>
            <strong>{tr('Senior Accessibility', 'Senior Accessibility')}</strong>
            <small>
              {tr(
                'Adjust text, contrast, listening, and touch',
                'Ayusin ang text, contrast, listening, at touch'
              )}
            </small>
          </span>
          <b>
            <Icon name="chevron" size={20} />
          </b>
        </button>
      </section>
      <div className="pm-profile-heading">
        <h2>{t('profile.others')}</h2>
      </div>
      <section className="pm-profile-menu">
        <button onClick={() => navigate('/patient/ask')}>
          <i>
            <Icon name="message" />
          </i>
          <span>
            <strong>{t('profile.support')}</strong>
            <small>
              {tr('Ask a pharmacist for assistance', 'Humingi ng tulong sa pharmacist')}
            </small>
          </span>
          <b>
            <Icon name="chevron" size={20} />
          </b>
        </button>
        <button className="logout" onClick={handleLogout}>
          <i>
            <Icon name="logout" />
          </i>
          <span>
            <strong>{t('profile.logout')}</strong>
            <small>
              {tr(
                'Securely leave your PharMate account',
                'Ligtas na umalis sa iyong PharMate account'
              )}
            </small>
          </span>
          <b />
        </button>
      </section>
    </main>
  );
}
