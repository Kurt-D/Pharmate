import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import '../../styles/patient.css';
import '../../styles/patient-uniform.css';
import '../../styles/elderly-tour.css';
import { api } from '../../api.js';
import { registerPush } from '../../lib/notifications.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useAccessibility } from '../../context/AccessibilityContext.jsx';
import { speak } from '../../lib/notifications.js';
import { useRealtime } from '../../hooks/useRealtime.js';
import PointerSpotlight from '../../components/PointerSpotlight.js';
import {
  PATIENT_ELDERLY_TOUR_STEPS,
  PATIENT_TUTORIAL_MODULES,
} from '../../config/elderlyTourSteps.js';

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
    flame: (
      <path d="M12.5 3s.8 3-1.7 5.7C8.4 11.2 9 14 11 15.2c-.2-2 1.2-3.2 2.4-4.2.2 2.1 2.6 3.6 2.6 6.1A4.1 4.1 0 0 1 11.9 21C8.1 21 5 18.2 5 14.6 5 9.7 9 7.7 12.5 3Z" />
    ),
    gift: (
      <>
        <path d="M4 10h16v10H4Z" />
        <path d="M12 10v10M3 7h18v3H3ZM12 7H8.8a2 2 0 1 1 2-3.2L12 7Zm0 0h3.2a2 2 0 1 0-2-3.2L12 7Z" />
      </>
    ),
    warning: (
      <>
        <path d="M12 3 2.8 20h18.4Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
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
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language } = useLanguage();
  const { preferences: accessibility, updatePreference } = useAccessibility();
  const tr = (en, fil) => (language === 'fil' ? fil : en);
  const pageContentRef = useRef(null);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [streakStatus, setStreakStatus] = useState({
    state: 'active',
    current_days: 0,
    priority_tokens: 0,
  });
  const [listenMenuOpen, setListenMenuOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(
    () => localStorage.getItem('has_seen_onboarding_tour') !== 'true'
  );
  const [tourSteps, setTourSteps] = useState(PATIENT_ELDERLY_TOUR_STEPS);

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

  async function markOneRead(id) {
    try {
      await api(`/api/patient/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((all) =>
        all.map((item) =>
          item.id === id ? { ...item, read_at: item.read_at || new Date().toISOString() } : item
        )
      );
      setUnread((count) => Math.max(0, count - 1));
    } catch {
      /* Keep the item unread when the device is offline. */
    }
  }

  async function loadStreakStatus() {
    try {
      const response = await api('/api/patient/streak/status');
      setStreakStatus(response.data);
      localStorage.setItem(
        'pm_priority_streak',
        JSON.stringify({
          days: response.data.current_days,
          tokens: response.data.priority_tokens,
          lastTaken: null,
        })
      );
    } catch {
      /* Preserve the last visible streak state while offline. */
    }
  }

  const realtimeStatus = useRealtime((event, payload) => {
    if (event === 'streak-updated') {
      setStreakStatus(payload);
      localStorage.setItem(
        'pm_priority_streak',
        JSON.stringify({
          days: payload.current_days,
          tokens: payload.priority_tokens,
          lastTaken: null,
        })
      );
      window.dispatchEvent(new CustomEvent('pm-realtime-dose', { detail: payload }));
    }
    if (event === 'notification-updated') {
      loadNotifications();
      window.dispatchEvent(new CustomEvent('pm-realtime-notification', { detail: payload }));
    }
    if (event === 'streak-updated') loadNotifications();
    if (
      [
        'DOSE_STATUS_CHANGED',
        'ADHERENCE_UPDATED',
        'MEDICATION_CREATED',
        'MEDICATION_UPDATED',
        'MEDICATION_STOPPED',
        'SCHEDULE_CONFIRMED',
        'ORDER_STATUS_CHANGED',
        'INQUIRY_UPDATED',
        'PRESCRIPTION_STATUS_CHANGED',
        'CAREGIVER_LINK_UPDATED',
      ].includes(event)
    ) {
      window.dispatchEvent(new CustomEvent('pm-domain-updated', { detail: { event, payload } }));
      loadStreakStatus();
      loadNotifications();
    }
  });

  useEffect(() => {
    registerPush(api);
    loadNotifications();
    loadStreakStatus();
    const timer = window.setInterval(() => {
      loadNotifications();
      loadStreakStatus();
    }, 15000);
    const refresh = () => {
      loadNotifications();
      loadStreakStatus();
    };
    window.addEventListener('pm-streak-updated', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pm-streak-updated', refresh);
    };
  }, []);

  useEffect(() => {
    const openHelpCenter = () => navigate('/patient/help');
    const replayHelpTour = (event) => startTutorial(event.detail || 'welcome');
    const showHelpGuide = (event) => showFaqOnScreen(event.detail);
    window.addEventListener('pm-open-help-center', openHelpCenter);
    window.addEventListener('pm-start-help-tour', replayHelpTour);
    window.addEventListener('pm-show-help-guide', showHelpGuide);
    return () => {
      window.removeEventListener('pm-open-help-center', openHelpCenter);
      window.removeEventListener('pm-start-help-tour', replayHelpTour);
      window.removeEventListener('pm-show-help-guide', showHelpGuide);
    };
  });

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

  function closeTour() {
    localStorage.setItem('has_seen_onboarding_tour', 'true');
    localStorage.setItem('pm_patient_elderly_tour', 'complete');
    setTourOpen(false);
    sessionStorage.removeItem('pm_tour_add_mode');
    window.dispatchEvent(new CustomEvent('pm-tour-step', { detail: null }));
  }

  function startTutorial(moduleKey = 'welcome') {
    setTourSteps(PATIENT_TUTORIAL_MODULES[moduleKey]?.steps || PATIENT_ELDERLY_TOUR_STEPS);
    setTourOpen(true);
  }

  function showFaqOnScreen(faq) {
    if (!faq?.tourStep) return;
    setTourSteps([faq.tourStep]);
    setTourOpen(true);
  }

  const handleTourStepChange = useCallback(
    (step) => {
      if (step.id === 'create-schedule') sessionStorage.setItem('pm_tour_add_mode', '1');
      else sessionStorage.removeItem('pm_tour_add_mode');
      if (location.pathname !== step.path) navigate(step.path);
      window.setTimeout(
        () => window.dispatchEvent(new CustomEvent('pm-tour-step', { detail: step })),
        80
      );
    },
    [location.pathname, navigate]
  );

  return (
    <div className={accessibilityClasses}>
      <div className="pm-phone__scroll" ref={pageContentRef}>
        <div
          className={`pm-realtime-indicator is-${realtimeStatus}`}
          role="status"
          title={tr('Real-time system connection', 'Real-time system connection')}
        >
          <i />
          {realtimeStatus === 'live'
            ? tr('Live', 'Live')
            : realtimeStatus === 'offline'
              ? tr('Offline', 'Offline')
              : tr('Connecting', 'Kumokonekta')}
        </div>
        {![
          '/patient/streak',
          '/patient/schedule',
          '/patient/calendar',
          '/patient/help',
          '/patient/medications/add',
          '/patient/shop',
          '/patient/orders',
          '/patient/accessibility',
        ].includes(location.pathname) && (
          <div className="pm-global-patient-actions">
            <Link
              className={`pm-header-streak-button streak-state-${streakStatus.state}`}
              to="/patient/streak"
              aria-label={tr('Open adherence streak', 'Buksan ang adherence streak')}
            >
              <PatientIcon name="flame" />
              <span className="pm-streak-status-badge" aria-hidden="true">
                <PatientIcon
                  name={
                    streakStatus.state === 'reward_ready'
                      ? 'gift'
                      : streakStatus.state === 'at_risk'
                        ? 'warning'
                        : streakStatus.state === 'safe'
                          ? 'check'
                          : 'flame'
                  }
                  size={12}
                />
              </span>
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
      <PointerSpotlight
        onClose={closeTour}
        onStepChange={handleTourStepChange}
        open={tourOpen}
        steps={tourSteps}
      />
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
                  <article
                    className={`${item.read_at ? '' : 'unread'} type-${item.type}`}
                    key={item.id}
                  >
                    <span>
                      <PatientIcon name="bell" size={18} />
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                      <time>{new Date(item.created_at).toLocaleString()}</time>
                      {!item.read_at && (
                        <button
                          className="pm-notification-item-read"
                          onClick={() => markOneRead(item.id)}
                          type="button"
                        >
                          {tr('Mark as read', 'Markahang nabasa')}
                        </button>
                      )}
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
