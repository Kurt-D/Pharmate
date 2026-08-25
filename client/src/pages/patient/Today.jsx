import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useAccessibility } from '../../context/AccessibilityContext.jsx';
import { enqueue, flushOutbox, newLogId } from '../../lib/doseOutbox.js';
import { scheduleDoseReminders, initReminderVoice, speak } from '../../lib/notifications.js';
import pharmacistWelcome from '../../assets/pharmacist-welcome.png';
import PatientVoiceAlert from './PatientVoiceAlert.jsx';

function HomeIcon({ name, size = 22 }) {
  const paths = {
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    medicine: (
      <>
        <path d="m10.5 5.5 8 8a4 4 0 0 1-5.7 5.7l-8-8a4 4 0 0 1 5.7-5.7Z" />
        <path d="m8.5 15.5 7-7" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    sound: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4Z" />
        <path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" />
      </>
    ),
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" />,
    summary: (
      <>
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
      </>
    ),
    x: <path d="m7 7 10 10M17 7 7 17" />,
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

function patientName(user) {
  const raw = user?.name || user?.full_name || user?.first_name || '';
  if (raw) return raw.trim().split(/\s+/)[0];
  return 'Patient';
}

const DAILY_TIPS = [
  {
    en: 'Take your medicines at the same time each day to make them part of your routine.',
    fil: 'Inumin ang mga gamot sa parehong oras araw-araw upang maging bahagi ito ng iyong routine.',
  },
  {
    en: 'Keep an updated medicine list and bring it whenever you visit your doctor or pharmacist.',
    fil: 'Panatilihing updated ang listahan ng gamot at dalhin ito sa doktor o parmasyutiko.',
  },
  {
    en: 'Use a full glass of water unless your medicine instructions say otherwise.',
    fil: 'Uminom ng isang buong basong tubig maliban kung iba ang tagubilin sa iyong gamot.',
  },
  {
    en: 'Never double a missed dose unless a pharmacist or doctor specifically tells you to.',
    fil: 'Huwag magdoble ng nakaligtaang dose maliban kung sinabi ng doktor o parmasyutiko.',
  },
  {
    en: 'Store medicines in a cool, dry place and keep them away from children.',
    fil: 'Itago ang mga gamot sa malamig at tuyong lugar na hindi maaabot ng mga bata.',
  },
  {
    en: 'Ask a pharmacist before mixing prescription medicines with vitamins or supplements.',
    fil: 'Magtanong sa parmasyutiko bago pagsabayin ang gamot, bitamina, o supplement.',
  },
  {
    en: 'Check your remaining tablets early so you have enough time to request a refill.',
    fil: 'Suriin nang maaga ang natitirang tableta upang may oras kang humiling ng refill.',
  },
];

function localDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadDailyStreak() {
  try {
    const stored = JSON.parse(localStorage.getItem('pm_priority_streak') || 'null');
    return stored?.lastTaken ? stored : { days: 0, lastTaken: null, tokens: 0 };
  } catch {
    return { days: 0, lastTaken: null, tokens: 0 };
  }
}

function recordStreakDay(current, date = new Date()) {
  const todayKey = localDayKey(date);
  if (current.lastTaken === todayKey) return current;
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const continued = current.lastTaken === localDayKey(yesterday);
  const days = continued ? Math.min(7, Number(current.days || 0) + 1) : 1;
  const previousDays = Number(current.days || 0);
  const reward =
    days === 7 && previousDays < 7 ? 2 : days % 3 === 0 && previousDays !== days ? 1 : 0;
  const updated = { days, lastTaken: todayKey, tokens: Number(current.tokens || 0) + reward };
  localStorage.setItem('pm_priority_streak', JSON.stringify(updated));
  return updated;
}

function dailyTipFor(date) {
  const localCalendarDay = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
  );
  return DAILY_TIPS[localCalendarDay % DAILY_TIPS.length];
}

export default function Today() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { preferences: accessibility } = useAccessibility();
  const tr = (english, filipino) => (language === 'fil' ? filipino : english);
  const [doses, setDoses] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scanOpen, setScanOpen] = useState(() => {
    const shouldOpen = sessionStorage.getItem('pm_open_medicine_scanner') === '1';
    sessionStorage.removeItem('pm_open_medicine_scanner');
    return shouldOpen;
  });
  const [scanPhoto, setScanPhoto] = useState(null);
  const [scanName, setScanName] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [streak, setStreak] = useState(loadDailyStreak);
  const [loggedDose, setLoggedDose] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryFilter, setSummaryFilter] = useState('taken');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [caregiverVoiceAlert, setCaregiverVoiceAlert] = useState(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const seenVoiceAlerts = useRef(new Set());

  const load = useCallback(async () => {
    try {
      await flushOutbox(api);
      const response = await api('/api/patient/doses/today');
      setDoses(response.data);
      setError('');
      scheduleDoseReminders(response.data);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('online', load);
    return () => window.removeEventListener('online', load);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let dispose = () => {};
    initReminderVoice().then((cleanup) => {
      dispose = cleanup;
    });
    return () => dispose();
  }, []);

  useEffect(() => {
    function receiveAlert(event) {
      const payload = event?.detail || event?.data || event;
      if (!payload?.id || seenVoiceAlerts.current.has(payload.id)) return;
      seenVoiceAlerts.current.add(payload.id);
      setCaregiverVoiceAlert(payload);
    }

    function receiveStorage(event) {
      if (event.key !== 'pm_caregiver_voice_alert' || !event.newValue) return;
      try {
        receiveAlert(JSON.parse(event.newValue));
      } catch {
        /* Ignore malformed local events. */
      }
    }

    async function loadRemoteAlert() {
      try {
        const response = await api(
          '/api/patient/notifications?type=dose_reminder&unread_only=true&limit=5'
        );
        const notification = response.data.notifications?.[0];
        if (!notification) return;
        receiveAlert({
          id: notification.id,
          notificationId: notification.id,
          message: notification.metadata?.voice_message || notification.message,
          medicine: notification.metadata?.medicine_name || '',
          caregiverName: notification.metadata?.caregiver_name || 'your caregiver',
          createdAt: notification.created_at,
        });
      } catch {
        /* The regular homepage remains available while offline. */
      }
    }

    window.addEventListener('pm-caregiver-voice-alert', receiveAlert);
    window.addEventListener('storage', receiveStorage);
    let channel;
    try {
      channel = new BroadcastChannel('pharmate-voice-alerts');
      channel.addEventListener('message', receiveAlert);
    } catch {
      channel = null;
    }
    try {
      const stored = JSON.parse(localStorage.getItem('pm_caregiver_voice_alert') || 'null');
      if (stored && Date.now() - new Date(stored.createdAt).getTime() < 30 * 60 * 1000)
        receiveAlert(stored);
    } catch {
      /* No local caregiver alert available. */
    }
    loadRemoteAlert();
    const timer = window.setInterval(loadRemoteAlert, 15000);
    return () => {
      window.removeEventListener('pm-caregiver-voice-alert', receiveAlert);
      window.removeEventListener('storage', receiveStorage);
      channel?.close();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(
    () => () => {
      if (scanPhoto?.url) URL.revokeObjectURL(scanPhoto.url);
    },
    [scanPhoto]
  );

  async function log(dose, action) {
    const loggedAt = new Date();
    const body = {
      log_id: newLogId(),
      logged_at: loggedAt.toISOString(),
      method: 'manual',
      action,
    };
    const optimistic = action === 'snooze' ? 'snoozed' : 'taken';
    setDoses((items) =>
      items.map((item) =>
        item.schedule_id === dose.schedule_id ? { ...item, status: optimistic } : item
      )
    );
    try {
      const response = await api(`/api/patient/doses/${dose.schedule_id}/log`, {
        method: 'POST',
        body,
      });
      setDoses((items) => {
        const updated = items.map((item) =>
          item.schedule_id === dose.schedule_id ? { ...item, status: response.data.status } : item
        );
        const completedAll =
          updated.length > 0 &&
          updated.every((item) => ['taken', 'taken_late'].includes(item.status));
        if (action === 'take' && completedAll) {
          setStreak((current) => recordStreakDay(current, loggedAt));
        }
        return updated;
      });
      setNotice(
        response.data.reflow
          ? 'Dose recorded. We suggested updated times for the rest of today.'
          : 'Dose marked as taken. Keep up the great work!'
      );
    } catch {
      enqueue({ ...body, schedule_id: dose.schedule_id, method: 'local' });
      setNotice('Saved offline. It will sync when you are connected again.');
      setDoses((items) => {
        const completedAll =
          items.length > 0 && items.every((item) => ['taken', 'taken_late'].includes(item.status));
        if (action === 'take' && completedAll) {
          setStreak((current) => recordStreakDay(current, loggedAt));
        }
        return items;
      });
    }
    if (action === 'take') {
      setLoggedDose({
        drugName: dose.drug_name,
        dosage: dose.dosage_instruction || '',
        loggedAt: loggedAt.toISOString(),
      });
    }
  }

  function chooseScanPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (scanPhoto?.url) URL.revokeObjectURL(scanPhoto.url);
    setScanPhoto({ file, url: URL.createObjectURL(file) });
    setScanResult(null);
  }

  async function verifyScan() {
    if (!scanName.trim()) return;
    setScanBusy(true);
    setScanResult(null);
    try {
      const response = await api('/api/patient/label/verify', {
        method: 'POST',
        body: { scanned_name: scanName.trim() },
      });
      if (response.data.match) {
        const matchingDose = (doses || []).find(
          (dose) =>
            dose.medication_id === response.data.medication_id &&
            ['scheduled', 'snoozed'].includes(dose.status)
        );
        if (matchingDose) {
          await log(matchingDose, 'take');
          setScanResult({ ...response.data, markedTaken: true });
        } else {
          setScanResult({ ...response.data, markedTaken: false });
        }
      } else {
        setScanResult(response.data);
      }
    } catch (scanError) {
      setScanResult({ match: false, message: scanError.message });
    } finally {
      setScanBusy(false);
    }
  }

  function closeScan() {
    if (scanPhoto?.url) URL.revokeObjectURL(scanPhoto.url);
    setScanOpen(false);
    setScanPhoto(null);
    setScanName('');
    setScanResult(null);
  }

  const summary = useMemo(() => {
    const items = doses || [];
    return {
      taken: items.filter((dose) => ['taken', 'taken_late'].includes(dose.status)).length,
      upcoming: items.filter((dose) => ['scheduled', 'snoozed'].includes(dose.status)).length,
      missed: items.filter((dose) => dose.status === 'missed').length,
    };
  }, [doses]);
  const summaryDoses = useMemo(
    () =>
      (doses || []).filter((dose) => {
        if (summaryFilter === 'taken') return ['taken', 'taken_late'].includes(dose.status);
        if (summaryFilter === 'upcoming') return ['scheduled', 'snoozed'].includes(dose.status);
        return dose.status === 'missed';
      }),
    [doses, summaryFilter]
  );

  const nextDose = useMemo(
    () =>
      (doses || [])
        .filter((dose) => ['scheduled', 'snoozed'].includes(dose.status))
        .sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time))[0],
    [doses]
  );

  const nextTime = nextDose
    ? new Date(nextDose.scheduled_time).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
  const dueNow =
    nextDose && Math.abs(new Date(nextDose.scheduled_time).getTime() - clockNow) <= 30 * 60 * 1000;
  const reminderText = nextDose
    ? `It is time to take your ${nextDose.drug_name}`
    : 'You have no medicine due right now';
  const dailyTip = dailyTipFor(new Date());

  const caregiverAlertDose = caregiverVoiceAlert
    ? (doses || []).find(
        (dose) =>
          !['taken', 'taken_late', 'missed'].includes(dose.status) &&
          caregiverVoiceAlert.medicine &&
          dose.drug_name?.toLowerCase().includes(caregiverVoiceAlert.medicine.toLowerCase())
      ) || nextDose
    : null;

  async function closeCaregiverAlert() {
    const notificationId = caregiverVoiceAlert?.notificationId;
    setCaregiverVoiceAlert(null);
    window.speechSynthesis?.cancel();
    if (notificationId) {
      try {
        await api(`/api/patient/notifications/${notificationId}/read`, { method: 'PATCH' });
      } catch {
        /* Best effort while offline. */
      }
    }
  }

  async function takeCaregiverAlertDose() {
    if (!caregiverAlertDose) {
      setNotice(
        tr(
          'No active dose is available to mark as taken.',
          'Walang aktibong dose na maaaring markahang nainom.'
        )
      );
      await closeCaregiverAlert();
      return;
    }
    await log(caregiverAlertDose, 'take');
    await closeCaregiverAlert();
  }

  async function snoozeCaregiverAlertDose() {
    if (caregiverAlertDose) await log(caregiverAlertDose, 'snooze');
    setNotice(tr('Reminder snoozed for 15 minutes.', 'Na-snooze ang paalala nang 15 minuto.'));
    await closeCaregiverAlert();
  }

  return (
    <main className="pm-home">
      <PatientVoiceAlert
        alert={caregiverVoiceAlert}
        dose={caregiverAlertDose}
        onDismiss={closeCaregiverAlert}
        onTake={takeCaregiverAlertDose}
        onSnooze={snoozeCaregiverAlertDose}
      />
      <header className="pm-home__header">
        <div>
          <h1>
            {tr('Welcome', 'Maligayang pagdating')}, {patientName(user)}!
          </h1>
          <p>
            {tr('Manage your health with ease.', 'Pamahalaan ang iyong kalusugan nang madali.')}
          </p>
        </div>
      </header>

      <section className="pm-welcome-card" aria-label="Health encouragement">
        <div className="pm-avatar" aria-hidden="true">
          <img src={pharmacistWelcome} alt="" />
          <b>
            <HomeIcon name="check" size={15} />
          </b>
        </div>
        <div>
          <h2>{tr('Your health matters most.', 'Pinakamahalaga ang iyong kalusugan.')}</h2>
          <p>
            {tr(
              'Take your medications on time, stay consistent, and feel your best every day.',
              'Inumin ang mga gamot sa tamang oras at panatilihin ang mabuting kalusugan araw-araw.'
            )}
          </p>
          <div className="pm-support-line">
            <span>
              <HomeIcon name="check" size={14} />
            </span>{' '}
            {tr(
              'Your pharmacist is here to support you every step of the way.',
              'Narito ang iyong parmasyutiko upang suportahan ka.'
            )}
          </div>
        </div>
      </section>

      {error && <div className="pm-banner pm-banner--warn">{error}</div>}
      {notice && <div className="pm-banner pm-banner--success">{notice}</div>}

      <section className="pm-dashboard-card pm-summary-card">
        <div className="pm-section-heading">
          <h2>
            <span>
              <HomeIcon name="summary" size={18} />
            </span>{' '}
            {tr('Today’s Summary', 'Buod Ngayon')}
          </h2>
          <button type="button" onClick={() => setSummaryOpen(true)}>
            {tr('View Details', 'Tingnan ang Detalye')} <span aria-hidden="true">›</span>
          </button>
        </div>
        <div className="pm-summary-grid" aria-live="polite">
          <button
            type="button"
            onClick={() => {
              setSummaryFilter('taken');
              setSummaryOpen(true);
            }}
          >
            <span className="pm-stat-icon pm-stat-icon--green">
              <HomeIcon name="check" size={15} />
            </span>
            <strong>{summary.taken}</strong>
            <small>{tr('Taken', 'Nainom')}</small>
          </button>
          <button
            type="button"
            onClick={() => {
              setSummaryFilter('upcoming');
              setSummaryOpen(true);
            }}
          >
            <span className="pm-stat-icon pm-stat-icon--orange">
              <HomeIcon name="clock" size={15} />
            </span>
            <strong>{summary.upcoming}</strong>
            <small>{tr('Upcoming', 'Paparating')}</small>
          </button>
          <button
            type="button"
            onClick={() => {
              setSummaryFilter('missed');
              setSummaryOpen(true);
            }}
          >
            <span className="pm-stat-icon pm-stat-icon--red">
              <HomeIcon name="x" size={15} />
            </span>
            <strong>{summary.missed}</strong>
            <small>{tr('Missed', 'Hindi nainom')}</small>
          </button>
        </div>
      </section>

      {dueNow && (
        <section className="pm-dashboard-card pm-voice-card">
          <div className="pm-section-heading">
            <h2>
              <span>
                <HomeIcon name="sound" size={18} />
              </span>{' '}
              {tr('Voice Reminder', 'Paalala sa Boses')}
            </h2>
            <span className="pm-active-pill">{tr('Due now', 'Oras na')}</span>
          </div>
          <div className="pm-reminder">
            <button
              type="button"
              className="pm-mic"
              onClick={() => speak(reminderText)}
              aria-label={tr('Listen to voice reminder', 'Pakinggan ang paalala sa boses')}
            >
              <HomeIcon name="sound" size={30} />
              <span>{tr('Listen', 'Pakinggan')}</span>
            </button>
            <div>
              <h3>“{reminderText}.”</h3>
              {nextDose && (
                <p>
                  {nextTime} · {nextDose.dosage_instruction || 'Follow your prescribed dose'}
                </p>
              )}
              <small>
                {tr(
                  'Listen to the spoken medicine name, dose, and scheduled time.',
                  'Pakinggan ang pangalan, dose, at oras ng gamot.'
                )}
              </small>
            </div>
          </div>
          <div className="pm-wave" aria-hidden="true">
            ˙│˙││˙│˙│││˙│˙││˙│││˙│˙│
          </div>
          <button
            type="button"
            className="pm-action-button pm-action-button--outline"
            disabled={!nextDose}
            onClick={() => {
              if (!nextDose) return;
              if (
                accessibility.confirmActions &&
                !window.confirm(
                  tr(
                    `Confirm that you are taking ${nextDose.drug_name || 'this medicine'} now.`,
                    `Kumpirmahin na iinumin mo ngayon ang ${nextDose.drug_name || 'gamot na ito'}.`
                  )
                )
              )
                return;
              log(nextDose, 'take');
            }}
          >
            Mark as Taken
          </button>
          <button type="button" className="pm-action-button" onClick={() => setScanOpen(true)}>
            <HomeIcon name="medicine" size={18} /> {tr('Scan Medicine', 'I-scan ang Gamot')}
          </button>
          <small className="pm-scan-hint">
            {tr(
              'Scan the medicine for automatic log',
              'I-scan ang gamot para awtomatikong maitala'
            )}
          </small>
        </section>
      )}

      {summaryOpen && (
        <div className="pm-summary-modal-backdrop" role="presentation">
          <section
            className="pm-summary-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="today-summary-title"
          >
            <header>
              <div>
                <h2 id="today-summary-title">
                  {tr('Today’s Dose Summary', 'Buod ng Dose Ngayon')}
                </h2>
                <p>
                  {new Date().toLocaleDateString([], {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSummaryOpen(false)}
                aria-label={tr('Close dose summary', 'Isara ang buod')}
              >
                <HomeIcon name="close" />
              </button>
            </header>
            <div
              className="pm-summary-modal-tabs"
              role="tablist"
              aria-label={tr('Dose status', 'Status ng dose')}
            >
              {[
                ['taken', summary.taken],
                ['upcoming', summary.upcoming],
                ['missed', summary.missed],
              ].map(([status, count]) => (
                <button
                  className={summaryFilter === status ? 'active' : ''}
                  key={status}
                  onClick={() => setSummaryFilter(status)}
                  role="tab"
                  aria-selected={summaryFilter === status}
                  type="button"
                >
                  <span>
                    {status === 'taken' ? (
                      <HomeIcon name="check" />
                    ) : status === 'upcoming' ? (
                      <HomeIcon name="clock" />
                    ) : (
                      <HomeIcon name="x" />
                    )}
                  </span>
                  <strong>{count}</strong>
                  <small>
                    {status === 'taken'
                      ? tr('Taken', 'Nainom')
                      : status === 'upcoming'
                        ? tr('Upcoming', 'Paparating')
                        : tr('Missed', 'Hindi Nainom')}
                  </small>
                </button>
              ))}
            </div>
            <div className="pm-summary-dose-list">
              {summaryDoses.length ? (
                summaryDoses.map((dose) => (
                  <article key={dose.schedule_id}>
                    <span className={`pm-summary-dose-icon ${summaryFilter}`}>
                      <HomeIcon
                        name={
                          summaryFilter === 'taken'
                            ? 'check'
                            : summaryFilter === 'upcoming'
                              ? 'clock'
                              : 'x'
                        }
                      />
                    </span>
                    <div>
                      <time>
                        {new Date(dose.scheduled_time).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </time>
                      <strong>{dose.drug_name}</strong>
                      <small>
                        {dose.dosage_instruction ||
                          tr('Follow your prescribed dose', 'Sundin ang itinakdang dose')}
                      </small>
                    </div>
                    <em className={summaryFilter}>
                      {summaryFilter === 'taken'
                        ? tr('Taken', 'Nainom')
                        : summaryFilter === 'upcoming'
                          ? tr('Upcoming', 'Paparating')
                          : tr('Missed', 'Hindi Nainom')}
                    </em>
                  </article>
                ))
              ) : (
                <div className="pm-summary-dose-empty">
                  <HomeIcon name="summary" size={32} />
                  <strong>
                    {tr(
                      `No ${summaryFilter} doses today`,
                      `Walang ${summaryFilter} na dose ngayon`
                    )}
                  </strong>
                  <p>
                    {tr(
                      'Dose information will appear here when available.',
                      'Lalabas dito ang detalye ng dose kapag mayroon na.'
                    )}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {scanOpen && (
        <div
          className="pm-scan-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeScan();
          }}
        >
          <section
            className="pm-scan-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-title"
          >
            <div className="pm-scan-sheet__header">
              <div>
                <h2 id="scan-title">Scan Medicine</h2>
                <p>Take a clear photo of the medicine label.</p>
              </div>
              <button type="button" onClick={closeScan} aria-label="Close medicine scanner">
                ×
              </button>
            </div>

            {!scanPhoto ? (
              <div className="pm-scan-choices">
                <button type="button" onClick={() => cameraInputRef.current?.click()}>
                  <span aria-hidden="true">📷</span>
                  <strong>Take a Photo</strong>
                  <small>Use your phone camera</small>
                </button>
                <button type="button" onClick={() => galleryInputRef.current?.click()}>
                  <span aria-hidden="true">▣</span>
                  <strong>Choose a Photo</strong>
                  <small>Upload from your files</small>
                </button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={chooseScanPhoto}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={chooseScanPhoto}
                />
              </div>
            ) : (
              <div className="pm-scan-review">
                <img src={scanPhoto.url} alt="Selected medicine label" />
                <button
                  type="button"
                  className="pm-scan-retake"
                  onClick={() => {
                    setScanPhoto(null);
                    setScanName('');
                    setScanResult(null);
                  }}
                >
                  Choose a different photo
                </button>
                <label htmlFor="scan-medicine-name">Medicine name shown on the label</label>
                <input
                  id="scan-medicine-name"
                  value={scanName}
                  onChange={(event) => {
                    setScanName(event.target.value);
                    setScanResult(null);
                  }}
                  placeholder="Example: Paracetamol"
                  autoComplete="off"
                />
                <p className="pm-scan-privacy">
                  The photo stays on this device. Only the medicine name is checked.
                </p>
                <button
                  type="button"
                  className="pm-action-button"
                  disabled={!scanName.trim() || scanBusy}
                  onClick={verifyScan}
                >
                  {scanBusy ? 'Checking…' : 'Check Medicine'}
                </button>
                {scanResult?.match && (
                  <div className="pm-scan-result pm-scan-result--success">
                    <strong>
                      {scanResult.markedTaken ? 'Dose marked as taken' : 'Medicine verified'}
                    </strong>
                    <span>
                      {scanResult.markedTaken
                        ? `${scanResult.drug_name} was matched to your schedule and recorded as taken.`
                        : `${scanResult.drug_name} is active, but it has no outstanding scheduled dose to record.`}
                    </span>
                    <button type="button" onClick={closeScan}>
                      Done
                    </button>
                  </div>
                )}
                {scanResult && !scanResult.match && (
                  <div className="pm-scan-result pm-scan-result--warn">
                    <strong>Medicine not matched</strong>
                    <span>
                      {scanResult.message || 'Check the label name or add this medicine first.'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {streak.days > 0 && (
        <section
          className="pm-dashboard-card pm-priority-streak-card"
          aria-labelledby="streak-title"
        >
          <div className="pm-priority-streak__top">
            <div>
              <span className="pm-priority-token-icon" aria-hidden="true">
                ★
              </span>
              <span>
                <small>{tr('Your Priority Tokens', 'Iyong Priority Tokens')}</small>
                <strong>{streak.tokens}</strong>
              </span>
            </div>
            <Link className="pm-streak-details" to="/patient/streak">
              {tr('View Details', 'Tingnan ang Detalye')} <span aria-hidden="true">›</span>
            </Link>
          </div>

          <div className="pm-priority-streak__hero">
            <div
              className="pm-streak-ring"
              style={{ '--streak-progress': `${(streak.days / 7) * 360}deg` }}
            >
              <div>
                <strong>{streak.days}</strong>
                <span>{tr('Day Streak', 'Araw na Streak')}</span>
              </div>
            </div>
            <div>
              <h2 id="streak-title">
                {streak.days === 7
                  ? tr('You earned 2 Priority Tokens!', 'Nakakuha ka ng 2 Priority Tokens!')
                  : tr('Keep your streak going!', 'Ipagpatuloy ang iyong streak!')}
              </h2>
              <p>
                {streak.days === 7
                  ? tr(
                      'Your seven-day streak is complete. You earned the 2-token final reward.',
                      'Kumpleto na ang pitong araw. Nakuha mo ang 2-token final reward.'
                    )
                  : tr(
                      'Earn 1 token on Day 3 and Day 6, then 2 tokens on Day 7.',
                      'Makakuha ng 1 token sa Day 3 at Day 6, at 2 token sa Day 7.'
                    )}
              </p>
            </div>
          </div>

          <div className="pm-streak-week" aria-label={`${streak.days} of 7 streak days completed`}>
            {Array.from({ length: 7 }, (_, index) => (
              <span className={index < streak.days ? 'complete' : ''} key={index}>
                <b>{index < streak.days ? '✓' : index + 1}</b>
                <small>{tr(`Day ${index + 1}`, `Araw ${index + 1}`)}</small>
              </span>
            ))}
          </div>

          <div className="pm-streak-reward">
            <span aria-hidden="true">★</span>
            <div>
              <strong>
                {tr(
                  'Day 3: 1 token · Day 6: 1 token · Day 7: 2 tokens',
                  'Day 3: 1 token · Day 6: 1 token · Day 7: 2 token'
                )}
              </strong>
              <small>
                {tr(
                  'Use your token when you need faster pharmacist support.',
                  'Gamitin ang token para sa mas mabilis na tulong ng parmasyutiko.'
                )}
              </small>
            </div>
          </div>

          <Link className="pm-ask-pharmacist-button" to="/patient/ask">
            {tr('Ask a Pharmacist About Your Concern', 'Magtanong sa Parmasyutiko')}
          </Link>
        </section>
      )}

      <section className="pm-tip-card">
        <span className="pm-tip-icon">♥</span>
        <div>
          <h2>{tr('Tip of the day', 'Payo ngayong araw')}</h2>
          <p>{language === 'fil' ? dailyTip.fil : dailyTip.en}</p>
        </div>
        <span className="pm-tip-art" aria-hidden="true">
          🥛🍎
        </span>
      </section>

      {loggedDose && (
        <div className="pm-log-success-backdrop" role="presentation">
          <section
            aria-describedby="dose-log-description"
            aria-labelledby="dose-log-title"
            aria-modal="true"
            className="pm-log-success-modal"
            role="dialog"
          >
            <div className="pm-log-success-check" aria-hidden="true">
              ✓
            </div>
            <h2 id="dose-log-title">{tr('Logged Successfully!', 'Matagumpay na Naitala!')}</h2>
            <p id="dose-log-description">
              <strong>{loggedDose.drugName}</strong>
              {loggedDose.dosage ? ` ${loggedDose.dosage}` : ''}{' '}
              {tr('has been marked as taken.', 'ay naitala bilang nainom na.')}
            </p>

            <dl className="pm-log-success-details">
              <div>
                <dt>{tr('Date', 'Petsa')}</dt>
                <dd>
                  {new Date(loggedDose.loggedAt).toLocaleDateString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </dd>
              </div>
              <div>
                <dt>{tr('Time', 'Oras')}</dt>
                <dd>
                  {new Date(loggedDose.loggedAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
              <div>
                <dt>{tr('Adherence Streak', 'Adherence Streak')}</dt>
                <dd>
                  {streak.days} {tr('Days', 'Araw')}
                </dd>
              </div>
            </dl>

            <div className="pm-log-success-encouragement">
              <span aria-hidden="true">▥</span>
              <div>
                <strong>{tr('Great job! Keep it up!', 'Mahusay! Ipagpatuloy mo!')}</strong>
                <small>
                  {tr(
                    'Stay consistent and build healthier habits.',
                    'Maging consistent at bumuo ng mas malusog na gawi.'
                  )}
                </small>
              </div>
            </div>

            <button
              className="pm-log-success-done"
              onClick={() => setLoggedDose(null)}
              type="button"
            >
              {tr('Done', 'Tapos')}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
