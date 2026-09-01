import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useAccessibility } from '../../context/AccessibilityContext.jsx';
import { enqueue, flushOutbox, newLogId } from '../../lib/doseOutbox.js';
import { scheduleDoseReminders, initReminderVoice, speak } from '../../lib/notifications.js';
import PatientVoiceAlert from './PatientVoiceAlert.jsx';

function HomeIcon({ name, size = 22 }) {
  const paths = {
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    left: <path d="m15 18-6-6 6-6" />,
    right: <path d="m9 18 6-6-6-6" />,
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
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    scan: (
      <>
        <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3" />
        <path d="M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
        <path d="M8 12h8" />
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

function localDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addCalendarDays(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

function calendarDateLabel(date, language) {
  const today = new Date();
  const tomorrow = addCalendarDays(today, 1);
  const yesterday = addCalendarDays(today, -1);
  const locale = language === 'fil' ? 'fil-PH' : 'en-PH';
  const formatted = date.toLocaleDateString(locale, { month: 'long', day: 'numeric' });
  if (localDayKey(date) === localDayKey(today))
    return language === 'fil' ? `Ngayon, ${formatted}` : `Today, ${formatted}`;
  if (localDayKey(date) === localDayKey(tomorrow))
    return language === 'fil' ? `Bukas, ${formatted}` : `Tomorrow, ${formatted}`;
  if (localDayKey(date) === localDayKey(yesterday))
    return language === 'fil' ? `Kahapon, ${formatted}` : `Yesterday, ${formatted}`;
  return date.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
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

export default function Today() {
  const navigate = useNavigate();
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
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarFilter, setCalendarFilter] = useState('upcoming');
  const [showAllCalendarDoses, setShowAllCalendarDoses] = useState(false);
  const [calendarRows, setCalendarRows] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  const [streak, setStreak] = useState(loadDailyStreak);
  const [streakStatus, setStreakStatus] = useState(null);
  const [loggedDose, setLoggedDose] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryFilter, setSummaryFilter] = useState('taken');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [caregiverVoiceAlert, setCaregiverVoiceAlert] = useState(null);
  const [tourReminderStep, setTourReminderStep] = useState(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const seenVoiceAlerts = useRef(new Set());
  const announcedDoseKeys = useRef(new Set());

  const refreshStreak = useCallback(async () => {
    try {
      const response = await api('/api/patient/streak/status');
      setStreakStatus(response.data);
      const synchronized = {
        days: response.data.current_days,
        tokens: response.data.priority_tokens,
        lastTaken: null,
      };
      setStreak(synchronized);
      localStorage.setItem('pm_priority_streak', JSON.stringify(synchronized));
      window.dispatchEvent(new CustomEvent('pm-streak-updated', { detail: response.data }));
    } catch {
      /* The last synchronized streak remains visible while offline. */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      await flushOutbox(api);
      const response = await api('/api/patient/doses/today');
      setDoses(response.data);
      setError('');
      scheduleDoseReminders(response.data);
      await refreshStreak();
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [refreshStreak]);

  useEffect(() => {
    load();
    window.addEventListener('online', load);
    window.addEventListener('pm-realtime-dose', load);
    return () => {
      window.removeEventListener('online', load);
      window.removeEventListener('pm-realtime-dose', load);
    };
  }, [load]);

  useEffect(() => {
    if (localDayKey(calendarDate) === localDayKey(new Date())) {
      setCalendarRows([]);
      setCalendarError('');
      setCalendarLoading(false);
      return undefined;
    }

    let active = true;
    setCalendarLoading(true);
    setCalendarError('');
    api(`/api/patient/doses/calendar?date=${localDayKey(calendarDate)}&status=${calendarFilter}`)
      .then((response) => {
        if (active) setCalendarRows(response.data);
      })
      .catch((requestError) => {
        if (!active) return;
        setCalendarRows([]);
        setCalendarError(
          requestError.message ||
            (language === 'fil'
              ? 'Hindi ma-load ang iskedyul para sa araw na ito.'
              : 'Unable to load the schedule for this day.')
        );
      })
      .finally(() => {
        if (active) setCalendarLoading(false);
      });

    return () => {
      active = false;
    };
  }, [calendarDate, calendarFilter, language]);

  useEffect(() => {
    setShowAllCalendarDoses(false);
  }, [calendarDate, calendarFilter]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const showTourControl = (event) => {
      const id = event.detail?.id;
      setTourReminderStep(['log-dose', 'scan-label'].includes(id) ? id : null);
    };
    window.addEventListener('pm-tour-step', showTourControl);
    return () => window.removeEventListener('pm-tour-step', showTourControl);
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
    function receiveRealtimeNotification(event) {
      if (event.detail?.reminder) receiveAlert(event.detail.reminder);
      else loadRemoteAlert();
    }
    window.addEventListener('pm-realtime-notification', receiveRealtimeNotification);
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
      window.removeEventListener('pm-realtime-notification', receiveRealtimeNotification);
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
        return updated;
      });
      if (action === 'take') await refreshStreak();
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

  const isCalendarToday = localDayKey(calendarDate) === localDayKey(new Date());
  const calendarWeek = useMemo(() => {
    const start = addCalendarDays(calendarDate, -calendarDate.getDay());
    return Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index));
  }, [calendarDate]);
  const visibleCalendarDoses = useMemo(() => {
    const items = isCalendarToday ? doses || [] : calendarRows;
    if (calendarFilter === 'taken') return items.filter((dose) => ['taken', 'taken_late'].includes(dose.status));
    if (calendarFilter === 'missed') return items.filter((dose) => dose.status === 'missed');
    return items.filter((dose) => ['scheduled', 'snoozed'].includes(dose.status));
  }, [calendarFilter, calendarRows, doses, isCalendarToday]);
  const nextDose = useMemo(
    () =>
      (doses || [])
        .filter((dose) => ['scheduled', 'snoozed'].includes(dose.status))
        .sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time))[0],
    [doses]
  );

  const dueDelay = nextDose ? clockNow - new Date(nextDose.scheduled_time).getTime() : null;
  const dueNow = nextDose && dueDelay >= 0 && dueDelay <= 30 * 60 * 1000;
  const reminderText = nextDose
    ? `It's time to take your ${nextDose.drug_name}`
    : tourReminderStep
      ? "It's time to take your scheduled medicine"
      : 'You have no medicine due right now';
  useEffect(() => {
    if (!dueNow || !nextDose || caregiverVoiceAlert) return;
    const doseKey = `${nextDose.schedule_id || nextDose.medication_id}:${nextDose.scheduled_time}`;
    if (announcedDoseKeys.current.has(doseKey)) return;
    announcedDoseKeys.current.add(doseKey);
    speak(reminderText);
  }, [caregiverVoiceAlert, dueNow, nextDose, reminderText]);

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

  async function markDueDoseTaken() {
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
    await log(nextDose, 'take');
  }

  return (
    <main className="pm-home">
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

      <PatientVoiceAlert
        alert={caregiverVoiceAlert}
        dose={caregiverAlertDose}
        onDismiss={closeCaregiverAlert}
        onScan={() => setScanOpen(true)}
        onTake={takeCaregiverAlertDose}
        onSnooze={snoozeCaregiverAlertDose}
      />

      {(dueNow || tourReminderStep) && !caregiverVoiceAlert && (
        <section className="pm-dashboard-card pm-voice-card pm-voice-card--calendar" id="patient-dose-reminder">
          <div className="pm-section-heading">
            <h2><span><HomeIcon name="sound" size={18} /></span>{' '}{tr('Medicine due now', 'Gamot na iinumin ngayon')}</h2>
            <span className="pm-active-pill"><span className="pm-active-bars" aria-hidden="true"><i /><i /><i /></span>{tr('Live', 'Live')}</span>
          </div>
          <div className="pm-reminder">
            <button type="button" className="pm-mic" onClick={() => speak(reminderText)} aria-label={tr('Repeat voice reminder', 'Ulitin ang paalala sa boses')} title={tr('Repeat voice reminder', 'Ulitin ang paalala sa boses')}><HomeIcon name="mic" size={28} /></button>
            <div className="pm-reminder__copy"><h3>{reminderText}</h3><p>{tr('This is the only reminder that needs your attention now.', 'Ito lamang ang paalala na kailangan mong tingnan ngayon.')}</p></div>
          </div>
          <div className="pm-voice-card__actions">
            <button type="button" className="pm-action-button pm-action-button--outline pm-tour-mark-taken" disabled={!nextDose} onClick={markDueDoseTaken}><HomeIcon name="check" size={18} /> {tr('Mark as Taken', 'Markahang Nainom')}</button>
            <button type="button" className="pm-action-button pm-tour-scan-medicine" onClick={() => setScanOpen(true)}><HomeIcon name="scan" size={18} /> {tr('Scan Medicine', 'I-scan ang Gamot')}</button>
          </div>
        </section>
      )}

      <section className="pm-week-calendar pm-simple-dose-calendar" aria-labelledby="home-calendar-title">
        <header className="pm-week-calendar__header">
          <div>
            <div>
              <small>{tr('Medicine Calendar', 'Kalendaryo ng Gamot')}</small>
              <h2 id="home-calendar-title">{calendarDate.toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-PH', { month: 'long', year: 'numeric' })}</h2>
            </div>
          </div>
          <button className="pm-simple-dose-calendar__jump pm-simple-dose-calendar__jump--header" onClick={() => navigate('/patient/calendar')} type="button">
            <HomeIcon name="calendar" size={17} />
            <span>{tr('View Calendar', 'Tingnan ang Kalendaryo')}</span>
          </button>
        </header>

        <div className="pm-simple-dose-calendar__controls">
          <div className="pm-simple-dose-calendar__week" aria-label={tr('Choose a day', 'Pumili ng araw')}>
            {calendarWeek.map((date) => <button aria-pressed={localDayKey(date) === localDayKey(calendarDate)} className={localDayKey(date) === localDayKey(calendarDate) ? 'selected' : ''} key={localDayKey(date)} onClick={() => { setCalendarDate(date); setShowAllCalendarDoses(false); }} type="button"><small>{date.toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-PH', { weekday: 'narrow' })}</small><strong>{date.getDate()}</strong></button>)}
          </div>
          <div aria-label={tr('Choose dose status', 'Piliin ang katayuan ng dose')} className="pm-simple-dose-calendar__filters">
            {[
              ['upcoming', tr('Upcoming', 'Paparating')],
              ['taken', tr('Taken', 'Nainom')],
              ['missed', tr('Missed', 'Hindi nainom')],
            ].map(([value, label]) => <button aria-pressed={calendarFilter === value} className={calendarFilter === value ? 'active' : ''} key={value} onClick={() => { setCalendarFilter(value); setShowAllCalendarDoses(false); }} type="button">{label}</button>)}
          </div>
          <div className="pm-simple-dose-calendar__date-row">
            <strong className="pm-simple-dose-calendar__date">{calendarDateLabel(calendarDate, language)}</strong>
            {visibleCalendarDoses.length > 1 && (
              <button
                aria-expanded={showAllCalendarDoses}
                aria-label={showAllCalendarDoses
                  ? tr('Show fewer medicines', 'Magpakita ng mas kaunting gamot')
                  : tr(`Show all ${visibleCalendarDoses.length} medicines`, `Ipakita lahat ng ${visibleCalendarDoses.length} gamot`)}
                className={`pm-simple-dose-calendar__expand${showAllCalendarDoses ? ' expanded' : ''}`}
                onClick={() => setShowAllCalendarDoses((value) => !value)}
                type="button"
              >
                <HomeIcon name="chevron" size={19} />
              </button>
            )}
          </div>
        </div>

        {!(isCalendarToday ? doses === null : calendarLoading) &&
          !calendarError &&
          visibleCalendarDoses.length > 0 && (
            <div
              className="pm-week-calendar__dose-list"
              aria-label={tr('Medicines for the selected day', 'Mga gamot para sa napiling araw')}
            >
              {(showAllCalendarDoses ? visibleCalendarDoses : visibleCalendarDoses.slice(0, 1)).map((dose, index) => {
                const isTaken = ['taken', 'taken_late'].includes(dose.status);
                const isMissed = dose.status === 'missed';
                return (
                  <article key={dose.schedule_id || `${dose.medication_id}-${index}`}>
                    <time>{new Date(dose.scheduled_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
                    <div className="pm-week-calendar__event">
                      <span className="pm-week-calendar__medicine-icon"><HomeIcon name={isTaken ? 'check' : 'medicine'} size={19} /></span>
                      <div><strong>{dose.drug_name || tr('Medicine', 'Gamot')}</strong><small>{dose.dosage_instruction || tr('Medicine reminder', 'Paalala sa gamot')}</small></div>
                      <em className={isTaken ? 'taken' : isMissed ? 'missed' : 'upcoming'}>{isTaken ? tr('Taken', 'Nainom') : isMissed ? tr('Missed', 'Hindi nainom') : tr('Upcoming', 'Paparating')}</em>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

        {((isCalendarToday ? doses === null : calendarLoading) || calendarError) && (
        <footer className="pm-week-calendar__summary" aria-live="polite">
          {(isCalendarToday ? doses === null : calendarLoading) ? (
            <div className="pm-week-calendar__loading">
              <span aria-hidden="true" />
              {tr('Loading this day’s schedule…', 'Nilo-load ang iskedyul ng araw na ito…')}
            </div>
          ) : calendarError ? (
            <p role="alert">{calendarError}</p>
          ) : null}
        </footer>
        )}
      </section>

      {streakStatus?.state === 'at_risk' && (
        <section className="pm-streak-alert pm-streak-alert--risk" role="alert">
          <span><HomeIcon name="bell" size={22} /></span>
          <div>
            <strong>
              {tr(
                `Don't lose your ${streakStatus.current_days}-day streak!`,
                `Huwag mawala ang iyong ${streakStatus.current_days}-araw na streak!`
              )}
            </strong>
            <p>
              {tr(
                `You have ${streakStatus.today.pending} dose(s) left today.`,
                `May ${streakStatus.today.pending} dose ka pang kailangang inumin ngayon.`
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => document.getElementById('patient-dose-reminder')?.scrollIntoView({ behavior: 'smooth' })}
          >
            {tr('Log Dose Now', 'Itala ang Dose')}
          </button>
        </section>
      )}
      {streakStatus?.state === 'broken' && (
        <section className="pm-streak-alert pm-streak-alert--reset" role="status">
          <span><HomeIcon name="clock" size={22} /></span>
          <div>
            <strong>{tr('Streak reset', 'Na-reset ang streak')}</strong>
            <p>
              {tr(
                "Take all of today's doses to start Day 1 and resume your reward progress.",
                'Inumin ang lahat ng dose ngayon upang magsimulang muli sa Day 1.'
              )}
            </p>
          </div>
        </section>
      )}
      {streakStatus?.state === 'reward_ready' && (
        <Link className="pm-streak-alert pm-streak-alert--reward" to="/patient/streak">
          <span><HomeIcon name="star" size={22} /></span>
          <div>
            <strong>
              {tr(
                `You earned Priority Tokens!`,
                'Nakakuha ka ng Priority Tokens!'
              )}
            </strong>
            <p>{tr('Tap to view your balance.', 'I-tap upang makita ang iyong balanse.')}</p>
          </div>
        </Link>
      )}

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
