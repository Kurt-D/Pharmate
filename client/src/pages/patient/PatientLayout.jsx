import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import '../../styles/patient.css';
import '../../styles/patient-uniform.css';
import { api } from '../../api.js';
import { registerPush } from '../../lib/notifications.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useAccessibility } from '../../context/AccessibilityContext.jsx';
import { speak } from '../../lib/notifications.js';

function PatientIcon({ name, size = 23 }) {
  const paths = {
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v11h14V10M9 21v-7h6v7" />
      </>
    ),
    medication: (
      <>
        <rect x="4" y="5" width="16" height="16" rx="2" />
        <path d="M9 3v4M15 3v4M8 13h8M12 9v8" />
      </>
    ),
    message: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    delivery: (
      <>
        <path d="M3 6h11v11H3Z" />
        <path d="M14 10h4l3 3v4h-7Z" />
        <circle cx="7" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" />,
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    sound: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4Z" />
        <path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" />
      </>
    ),
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
      strokeWidth="2.3"
    >
      {paths[name]}
    </svg>
  );
}

const NAV = [
  { to: '/patient/today', icon: 'home', label: 'nav.home' },
  { to: '/patient/medications', icon: 'medication', label: 'nav.medications' },
  { to: '/patient/ask', icon: 'message', label: 'nav.ask' },
  { to: '/patient/shop', icon: 'delivery', label: 'nav.orders' },
  { to: '/patient/profile', icon: 'profile', label: 'nav.profile' },
];

export default function PatientLayout() {
  const location = useLocation();
  const { t, language } = useLanguage();
  const { preferences: accessibility, updatePreference } = useAccessibility();
  const tr = (en, fil) => (language === 'fil' ? fil : en);
  const pageContentRef = useRef(null);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [listenMenuOpen, setListenMenuOpen] = useState(false);

  async function loadNotifications() {
    try {
      const response = await api('/api/patient/notifications?limit=30');
      setNotifications(response.data.notifications);
      setUnread(response.data.unread_count);
    } catch {
      /* Keep navigation available offline. */
    }
  }

  async function markAllRead() {
    try {
      await api('/api/patient/notifications/read-all', { method: 'POST' });
    } finally {
      setUnread(0);
      setNotifications((all) =>
        all.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))
      );
    }
  }

  useEffect(() => {
    registerPush(api);
    loadNotifications();
  }, []);

  const accessibilityClasses = [
    'pm-phone',
    accessibility.highContrast && 'pm-a11y-high-contrast',
    accessibility.warmTint && 'pm-a11y-warm-tint',
    accessibility.darkMode && 'pm-a11y-dark-mode',
    accessibility.boldText && 'pm-a11y-bold-text',
    accessibility.extraSpacing && 'pm-a11y-extra-spacing',
    accessibility.reduceMotion && 'pm-a11y-reduce-motion',
    accessibility.enhancedFocus && 'pm-a11y-enhanced-focus',
    accessibility.largeTouch && 'pm-a11y-large-touch',
    !accessibility.ttsEnabled && 'pm-a11y-tts-off',
  ]
    .filter(Boolean)
    .join(' ');

  function listenToImportantInformation() {
    const selectors = [
      '.pm-compact-reminder__message',
      '.pm-voice-card .pm-reminder',
      '.pm-dashboard-dose-row',
      '.pm-dose-rows article',
      '.pm-order-tracker',
      '.pm-active-order',
      '.pm-order-card',
    ].join(',');
    const items = [...(pageContentRef.current?.querySelectorAll(selectors) || [])]
      .filter((element) => element.offsetParent !== null)
      .map((element) => element.innerText.replace(/\s+/g, ' ').trim())
      .filter((text, index, all) => text && all.indexOf(text) === index);
    const message = items.length
      ? `${tr('Important medicine information.', 'Mahalagang impormasyon sa gamot.')} ${items.join('. ')}`
      : tr(
          'There is no current medicine reminder or order update on this page.',
          'Walang kasalukuyang paalala sa gamot o update sa order sa page na ito.'
        );
    speak(message.slice(0, 3000));
    setListenMenuOpen(false);
  }

  return (
    <div className={accessibilityClasses}>
      <div className="pm-phone__scroll" ref={pageContentRef}>
        {![
          '/patient/streak',
          '/patient/schedule',
          '/patient/medications/add',
          '/patient/shop',
          '/patient/orders',
          '/patient/accessibility',
        ].includes(location.pathname) && (
          <div className="pm-global-patient-actions">
            <Link
              to="/patient/streak"
              aria-label={tr('Open adherence streak', 'Buksan ang adherence streak')}
            >
              <PatientIcon name="star" />
            </Link>
            <button
              onClick={() => {
                setNotificationsOpen(true);
                loadNotifications();
              }}
              aria-label={tr('Open notifications', 'Buksan ang mga abiso')}
              type="button"
            >
              <PatientIcon name="bell" />
              {unread > 0 && <b>{unread > 9 ? '9+' : unread}</b>}
            </button>
          </div>
        )}
        <Outlet />
      </div>
      {accessibility.ttsEnabled && (
        <>
          <button
            aria-controls="patient-listening-panel"
            aria-expanded={listenMenuOpen}
            className="pm-global-page-listen"
            onClick={() => setListenMenuOpen((open) => !open)}
            type="button"
          >
            <PatientIcon name="sound" size={20} />
            <span>{tr('Listening On', 'Listening On')}</span>
          </button>
          {listenMenuOpen && (
            <section
              aria-label={tr('Listening controls', 'Listening controls')}
              className="pm-global-listen-panel"
              id="patient-listening-panel"
            >
              <header>
                <span>
                  <PatientIcon name="sound" size={21} />
                </span>
                <div>
                  <strong>{tr('Listening is enabled', 'Naka-enable ang listening')}</strong>
                  <small>
                    {tr(
                      'Hear important medicine and order information.',
                      'Pakinggan ang mahalagang impormasyon sa gamot at order.'
                    )}
                  </small>
                </div>
                <button
                  aria-label={tr('Close listening controls', 'Isara ang listening controls')}
                  onClick={() => setListenMenuOpen(false)}
                  type="button"
                >
                  <PatientIcon name="close" size={19} />
                </button>
              </header>
              <button
                className="pm-listen-important"
                onClick={listenToImportantInformation}
                type="button"
              >
                <PatientIcon name="sound" size={20} />{' '}
                {tr('Read Important Information', 'Basahin ang Mahalagang Impormasyon')}
              </button>
              <button
                className="pm-listen-turn-off"
                onClick={() => {
                  window.speechSynthesis?.cancel();
                  updatePreference('ttsEnabled', false);
                  setListenMenuOpen(false);
                }}
                type="button"
              >
                {tr('Turn Off Listening', 'I-off ang Listening')}
              </button>
            </section>
          )}
        </>
      )}
      {notificationsOpen && (
        <div className="pm-notification-modal-backdrop" role="presentation">
          <section
            className="pm-notification-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-modal-title"
          >
            <header>
              <div>
                <h2 id="notification-modal-title">{tr('Notifications', 'Mga Abiso')}</h2>
                <p>
                  {tr(
                    'Medicine reminders and new communications.',
                    'Mga paalala sa gamot at bagong komunikasyon.'
                  )}
                </p>
              </div>
              <button
                onClick={() => setNotificationsOpen(false)}
                aria-label={tr('Close notifications', 'Isara ang mga abiso')}
                type="button"
              >
                <PatientIcon name="close" />
              </button>
            </header>
            {unread > 0 && (
              <button className="pm-notification-mark-read" onClick={markAllRead} type="button">
                {tr('Mark all as read', 'Markahang nabasa lahat')}
              </button>
            )}
            <div className="pm-notification-modal-list">
              {notifications.length ? (
                notifications.map((item) => (
                  <article className={item.read_at ? '' : 'unread'} key={item.id}>
                    <span>
                      <PatientIcon name="bell" size={18} />
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <time>{new Date(item.created_at).toLocaleString()}</time>
                    </div>
                  </article>
                ))
              ) : (
                <div className="pm-notification-modal-empty">
                  <PatientIcon name="bell" size={30} />
                  <strong>{tr('No notifications yet', 'Wala pang abiso')}</strong>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      <nav className="pm-bottomnav">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive || (item.to === '/patient/shop' && location.pathname === '/patient/orders')
                ? 'active'
                : ''
            }
          >
            <span className="pm-navicon">
              <PatientIcon name={item.icon} />
            </span>
            <span>{t(item.label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
