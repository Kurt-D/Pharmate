import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useAccessibility } from '../../context/AccessibilityContext.jsx';
import { enqueue, flushOutbox, newLogId } from '../../lib/doseOutbox.js';
import { readPatientOfflineCache, writePatientOfflineCache } from '../../lib/patientOfflineCache.js';
import { scheduleDoseReminders, initReminderVoice, speak } from '../../lib/notifications.js';
import {
  captureOcrImage,
  OCR_CONFIDENCE_THRESHOLD,
  recognizeMedicineImage,
} from '../../lib/mlKitOcr.js';
import { recordOcrEvaluation } from '../../lib/ocrTelemetry.js';
import { MedicineCalendarModal } from './Medications.jsx';

function HomeIcon({ name, size = 22 }) {
  const paths = {
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    alert: (
      <>
        <path d="M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
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
    flame: <path d="M12 22c4.1 0 7-2.7 7-6.4 0-2.8-1.8-5.1-4.2-7.8.1 2.2-1 3.8-2.4 4.6.3-3.7-1.5-6.4-4.2-8.4.3 3.7-2.1 5.6-3.4 7.8C3.6 14 4.2 17.1 6 19.2 7.5 20.9 9.5 22 12 22Z" />,
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
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
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

function doseStatus(dose) {
  return String(dose?.status || '').toUpperCase();
}

function isDoseInVoiceReminder(dose, now = Date.now()) {
  if (doseStatus(dose) === 'DUE') return true;
  const scheduledAt = new Date(dose?.scheduled_at || dose?.scheduled_time).getTime();
  return Number.isFinite(scheduledAt) && now >= scheduledAt && now - scheduledAt <= 30 * 60 * 1000;
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

function doseConfirmationDateTime(timestamp, language) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const locale = language === 'fil' ? 'fil-PH' : 'en-PH';
  try {
    return date.toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return date.toLocaleString();
  }
}

const REMINDER_WAVE = [
  5, 9, 4, 13, 7, 18, 10, 24, 8, 15, 5, 11, 20, 7, 13, 25, 9, 17, 6, 12, 21, 8, 14, 6, 18, 11, 7,
  15, 5, 9,
];

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
  const { preferences } = useAccessibility();
  const tr = (english, filipino) => (language === 'fil' ? filipino : english);
  const [doses, setDoses] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scanOpen, setScanOpen] = useState(() => {
    const shouldOpen = sessionStorage.getItem('pm_open_medicine_scanner') === '1';
    sessionStorage.removeItem('pm_open_medicine_scanner');
    return shouldOpen;
  });
  const [scanPhoto, setScanPhoto] = useState(null);
  const [scanPhotoFullView, setScanPhotoFullView] = useState(false);
  const [scanName, setScanName] = useState('');
  const [scanStrength, setScanStrength] = useState('');
  const [scanFormulation, setScanFormulation] = useState('');
  const [scanOcr, setScanOcr] = useState(null);
  const [scanReviewed, setScanReviewed] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanCapturing, setScanCapturing] = useState(false);
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarFilter, setCalendarFilter] = useState('upcoming');
  const [calendarRows, setCalendarRows] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [streak, setStreak] = useState(loadDailyStreak);
  const [streakStatus, setStreakStatus] = useState(null);
  const [streakStarted, setStreakStarted] = useState(false);
  const [loggedDose, setLoggedDose] = useState(null);
  const [doseConfirmation, setDoseConfirmation] = useState(null);
  const [dismissedReminder, setDismissedReminder] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryFilter, setSummaryFilter] = useState('taken');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [caregiverVoiceAlert, setCaregiverVoiceAlert] = useState(null);
  const [tourReminderStep, setTourReminderStep] = useState(null);
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
      return response.data;
    } catch {
      /* The last synchronized streak remains visible while offline. */
    }
  }, []);

  const load = useCallback(async () => {
    const cachedDoses = readPatientOfflineCache(user?.id, 'today-doses', []);
    try {
      await flushOutbox(user?.id, api);
      const [doseResponse, preferenceResponse, medicationResponse] = await Promise.all([
        api('/api/patient/doses/today'),
        api('/api/patient/preferences'),
        api('/api/patient/medications'),
      ]);
      writePatientOfflineCache(user?.id, 'today-doses', doseResponse.data);
      writePatientOfflineCache(user?.id, 'preferences', preferenceResponse.data);
      setDoses(doseResponse.data);
      setMedicines(Array.isArray(medicationResponse.data) ? medicationResponse.data : []);
      setError('');
      scheduleDoseReminders(doseResponse.data);
      await refreshStreak();
    } catch (requestError) {
      if (cachedDoses.length) {
        setDoses(cachedDoses);
        setError('You are offline. Showing the last saved medication plan.');
      } else {
        setError(requestError.message);
      }
    }
  }, [refreshStreak, user?.id]);

  useEffect(() => {
    load();
    window.addEventListener('online', load);
    window.addEventListener('pm-realtime-dose', load);
    window.addEventListener('pm-dose-status-changed', load);
    return () => {
      window.removeEventListener('online', load);
      window.removeEventListener('pm-realtime-dose', load);
      window.removeEventListener('pm-dose-status-changed', load);
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
          scheduleId: notification.metadata?.schedule_id || null,
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

  async function log(dose, action, method = 'manual') {
    const loggedAt = new Date();
    const previousStatus = doseStatus(dose);
    const startedNewStreak = action === 'take' && Number(streak.days || 0) === 0;
    const body = {
      log_id: newLogId(),
      logged_at: loggedAt.toISOString(),
      method,
      action,
    };
    const optimistic = action === 'snooze' ? 'snoozed' : 'taken';
    setDoses((items) =>
      items.map((item) =>
        item.schedule_id === dose.schedule_id ? { ...item, status: optimistic.toUpperCase() } : item
      )
    );
    try {
      const response = await api(`/api/patient/doses/${dose.schedule_id}/log`, {
        method: 'POST',
        body,
      });
      const savedStatus = response.data.status || optimistic.toUpperCase();
      setDoses((items) => {
        const updated = items.map((item) =>
          item.schedule_id === dose.schedule_id
            ? {
                ...item,
                status: savedStatus,
                ...(response.data.scheduled_at
                  ? { scheduled_at: response.data.scheduled_at, scheduled_time: response.data.scheduled_at }
                  : {}),
              }
            : item
        );
        return updated;
      });
      setError('');
      window.dispatchEvent(
        new CustomEvent('pm-dose-status-changed', {
          detail: { scheduleId: dose.schedule_id, status: savedStatus },
        })
      );
      if (action === 'take') await dismissReminderForLoggedDose(dose);
      if (action === 'take') {
        const refreshedStreak = await refreshStreak();
        if (startedNewStreak && Number(refreshedStreak?.current_days) === 1) {
          setStreakStarted(true);
        }
      }
      setNotice(
        response.data.reflow
          ? 'Dose recorded. We suggested updated times for the rest of today.'
          : 'Dose marked as taken. Keep up the great work!'
      );
    } catch (requestError) {
      // A server response (409 safety check, duplicate log, etc.) is not an
      // offline failure.  Do not show a successful dose card or hide the
      // reminder unless the log was actually accepted.
      if (requestError?.status) {
        setDoses((items) =>
          items.map((item) =>
            item.schedule_id === dose.schedule_id ? { ...item, status: previousStatus } : item
          )
        );
        setError(requestError.message || 'This dose could not be recorded. Please try again.');
        return false;
      }
      enqueue(user?.id, { ...body, schedule_id: dose.schedule_id, method: 'local' });
      setNotice('Saved offline. It will sync when you are connected again.');
      setDoses((items) => {
        if (action === 'take') {
          setStreak((current) => {
            const updated = recordStreakDay(current, loggedAt);
        return updated;
      });
      window.dispatchEvent(
        new CustomEvent('pm-dose-status-changed', {
          detail: { scheduleId: dose.schedule_id, status: optimistic.toUpperCase() },
        })
      );
        }
        return items;
      });
    }
    if (action === 'take') {
      setDismissedReminder({
        scheduleId: String(dose.schedule_id || dose.id || ''),
        scheduledAt: String(dose.scheduled_at || dose.scheduled_time || ''),
      });
      setLoggedDose({
        drugName: dose.drug_name,
        dosage: dose.dosage_instruction || '',
        loggedAt: loggedAt.toISOString(),
      });
      const locale = language === 'fil' ? 'fil-PH' : 'en-PH';
      const loggedDate = loggedAt.toLocaleDateString(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      const loggedTime = loggedAt.toLocaleTimeString(locale, {
        hour: 'numeric',
        minute: '2-digit',
      });
      speak(
        tr(
          `Dose log done. ${dose.drug_name || 'Your medicine'}${dose.dosage_instruction ? `, ${dose.dosage_instruction}` : ''}, was recorded as taken on ${loggedDate} at ${loggedTime}.`,
          `Tapos na ang pagtatala ng dose. Ang ${dose.drug_name || 'iyong gamot'}${dose.dosage_instruction ? `, ${dose.dosage_instruction}` : ''} ay naitala bilang nainom noong ${loggedDate}, ${loggedTime}.`
        )
      );
    }
    return true;
  }

  async function chooseScanPhoto(source) {
    setScanCapturing(true);
    setScanResult(null);
    setScanReviewed(false);
    try {
      const media = await captureOcrImage(source);
      if (!media) {
        if (source === 'camera') setScanOpen(false);
        return;
      }
      const url =
        media.webPath || (media.thumbnail ? `data:image/jpeg;base64,${media.thumbnail}` : '');
      if (!url) throw new Error('The selected image could not be opened.');
      setScanPhoto({ url });
      const scan = await recognizeMedicineImage(media);
      setScanOcr(scan);
      setScanName(scan.fields.name);
      setScanStrength(scan.fields.strength);
      setScanFormulation(scan.fields.formulation);
      if (scan.outcome === 'RECAPTURE_REQUIRED') {
        await recordOcrEvaluation(scan);
      }
    } catch (error) {
      setScanOcr({
        outcome: 'UNAVAILABLE',
        message: error?.message || 'The label could not be scanned. Enter the details manually.',
      });
    } finally {
      setScanCapturing(false);
    }
  }

  function openMedicineScanner() {
    setScanOpen(true);
    // A chosen label is already ready for OCR/review. Do not stack another
    // camera-picker dialog over it when the user returns to the scanner.
    if (scanPhoto || scanCapturing) return;
    void chooseScanPhoto('camera');
  }

  async function verifyScan() {
    if (!scanName.trim() || !scanReviewed) return;
    setScanBusy(true);
    setScanResult(null);
    try {
      if (scanOcr?.id) {
        await recordOcrEvaluation(scanOcr, {
          name: scanName,
          strength: scanStrength,
          formulation: scanFormulation,
        });
      }
      const response = await api('/api/patient/label/verify', {
        method: 'POST',
        body: { scanned_name: scanName.trim() },
      });
      if (response.data.match) {
        // Fetch a fresh schedule before logging. The initial Home-tab dose list
        // can be stale after a reminder or schedule update.
        const latestDosesResponse = await api('/api/patient/doses/today');
        const latestDoses = Array.isArray(latestDosesResponse.data) ? latestDosesResponse.data : [];
        setDoses(latestDoses);
        const matchingDose = latestDoses.find(
          (dose) =>
            String(dose.medication_id) === String(response.data.medication_id) &&
            ['UPCOMING', 'DUE', 'SCHEDULED', 'SNOOZED', 'MISSED'].includes(doseStatus(dose))
        );
        if (matchingDose) {
          // Keep the scan state accurate while the log is in progress. This
          // also prevents an empty/white modal if a slow request re-renders.
          setScanResult({ ...response.data, doseReadyToLog: true });
          if (
            caregiverVoiceAlert &&
            String(caregiverAlertDose?.schedule_id) === String(matchingDose.schedule_id)
          ) {
            await closeCaregiverAlert();
          }
          const logged = await log(matchingDose, 'take', 'ocr');
          if (logged) {
            closeScan();
          } else {
            setScanResult({
              ...response.data,
              match: false,
              doseReadyToLog: false,
              message: tr(
                'The dose was not recorded. Please try confirming the label again.',
                'Hindi naitala ang dose. Pakisubukang kumpirmahin muli ang label.'
              ),
            });
          }
        } else {
          setScanResult({ ...response.data, doseReadyToLog: false });
          speak(
            tr(
              `Medicine verified. ${response.data.drug_name || scanName.trim()} has no outstanding scheduled dose to log.`,
              `Napatunayang tama ang gamot. Walang nakaabang na dose para sa ${response.data.drug_name || scanName.trim()}.`
            )
          );
        }
      } else {
        setScanResult(response.data);
        speak(
          tr(
            `Medicine does not match your scheduled medicine. The scanned label says ${scanName.trim()}. Please check the label or choose the medicine on your schedule.`,
            `Hindi tugma ang gamot sa iyong naka-iskedyul na gamot. Ang nabasang label ay ${scanName.trim()}. Suriin ang label o piliin ang gamot sa iyong iskedyul.`
          )
        );
      }
    } catch (scanError) {
      setScanResult({ match: false, message: scanError.message });
    } finally {
      setScanBusy(false);
    }
  }

  function closeScan() {
    setScanOpen(false);
    setScanPhoto(null);
    setScanName('');
    setScanStrength('');
    setScanFormulation('');
    setScanOcr(null);
    setScanReviewed(false);
    setScanResult(null);
  }

  async function confirmDoseLog() {
    const confirmation = doseConfirmation;
    if (!confirmation?.dose) return;
    const logged = await log(confirmation.dose, 'take');
    if (!logged) return;
    setDoseConfirmation(null);
    if (confirmation.closeScan) closeScan();
    if (confirmation.closeCaregiver) await closeCaregiverAlert();
  }

  const summary = useMemo(() => {
    const items = doses || [];
    return {
      taken: items.filter((dose) => ['TAKEN', 'TAKEN_LATE'].includes(doseStatus(dose))).length,
      upcoming: items.filter((dose) =>
        ['UPCOMING', 'DUE', 'SCHEDULED', 'SNOOZED'].includes(doseStatus(dose)) &&
        !isDoseInVoiceReminder(dose, clockNow)
      ).length,
      missed: items.filter((dose) => doseStatus(dose) === 'MISSED').length,
    };
  }, [clockNow, doses]);
  const summaryDoses = useMemo(
    () =>
      (doses || []).filter((dose) => {
        if (summaryFilter === 'taken') return ['TAKEN', 'TAKEN_LATE'].includes(doseStatus(dose));
        if (summaryFilter === 'upcoming')
          return (
            ['UPCOMING', 'DUE', 'SCHEDULED', 'SNOOZED'].includes(doseStatus(dose)) &&
            !isDoseInVoiceReminder(dose, clockNow)
          );
        return doseStatus(dose) === 'MISSED';
      }),
    [clockNow, doses, summaryFilter]
  );

  const isCalendarToday = localDayKey(calendarDate) === localDayKey(new Date());
  const calendarWeek = useMemo(() => {
    const start = addCalendarDays(calendarDate, -calendarDate.getDay());
    return Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index));
  }, [calendarDate]);
  const visibleCalendarDoses = useMemo(() => {
    const items = isCalendarToday ? doses || [] : calendarRows;
    if (calendarFilter === 'taken')
      return items.filter((dose) => ['TAKEN', 'TAKEN_LATE'].includes(doseStatus(dose)));
    if (calendarFilter === 'missed') return items.filter((dose) => doseStatus(dose) === 'MISSED');
    return items.filter(
      (dose) =>
        ['UPCOMING', 'DUE', 'SCHEDULED', 'SNOOZED'].includes(doseStatus(dose)) &&
        !(isCalendarToday && isDoseInVoiceReminder(dose, clockNow))
    );
  }, [calendarFilter, calendarRows, clockNow, doses, isCalendarToday]);
  const nextDose = useMemo(
    () =>
      (doses || [])
        .filter((dose) => ['UPCOMING', 'DUE', 'SCHEDULED', 'SNOOZED'].includes(doseStatus(dose)))
        .sort(
          (a, b) =>
            new Date(a.scheduled_at || a.scheduled_time) -
            new Date(b.scheduled_at || b.scheduled_time)
        )[0],
    [doses]
  );

  const dueDelay = nextDose
    ? clockNow - new Date(nextDose.scheduled_at || nextDose.scheduled_time).getTime()
    : null;
  const dueNow =
    nextDose && (doseStatus(nextDose) === 'DUE' || (dueDelay >= 0 && dueDelay <= 30 * 60 * 1000));
  const reminderText = nextDose
    ? tr(
        `It's time to take your ${String(
          nextDose.drug_name || nextDose.medication_name || nextDose.medicine_name || 'scheduled medicine'
        ).replace(/^your\s+/i, '')}.`,
        `Oras nang inumin ang ${nextDose.drug_name || nextDose.medication_name || nextDose.medicine_name || 'naka-iskedyul na gamot'}.`
      )
    : tourReminderStep
      ? tr("It's time to take your scheduled medicine.", 'Oras nang inumin ang iyong gamot.')
      : tr('You have no medicine due right now.', 'Wala kang gamot na kailangang inumin ngayon.');
  useEffect(() => {
    if (!dueNow || !nextDose) return;
    const doseKey = `${nextDose.schedule_id || nextDose.medication_id}:${nextDose.scheduled_time}`;
    if (announcedDoseKeys.current.has(doseKey)) return;
    announcedDoseKeys.current.add(doseKey);
    speak(reminderText);
  }, [dueNow, nextDose, reminderText]);

  const caregiverAlertDose = caregiverVoiceAlert
    ? (doses || []).find(
        (dose) =>
          !['TAKEN', 'TAKEN_LATE'].includes(doseStatus(dose)) &&
          (String(dose.id) === String(caregiverVoiceAlert.scheduleId) ||
            String(dose.schedule_id) === String(caregiverVoiceAlert.scheduleId) ||
            (caregiverVoiceAlert.medicine &&
              dose.drug_name?.toLowerCase().includes(caregiverVoiceAlert.medicine.toLowerCase())))
      ) || nextDose
    : null;
  const activeReminderDose = caregiverAlertDose || nextDose;
  const activeReminderText = caregiverVoiceAlert?.message || reminderText;
  const scheduledMedicine = medicines.find(
    (item) => String(item.id) === String(activeReminderDose?.medication_id)
  );
  const activeReminderMedicine = [
    scheduledMedicine?.drug_name_raw,
    scheduledMedicine?.medicine_name,
    scheduledMedicine?.generic_name,
    activeReminderDose?.medication_name,
    activeReminderDose?.drug_name,
    activeReminderDose?.medicine_name,
    activeReminderDose?.drug_name_raw,
    activeReminderDose?.generic_name,
    activeReminderDose?.name,
    caregiverVoiceAlert?.medicine,
  ]
    .map((name) => String(name || '').replace(/^your\s+/i, '').trim())
    .find((name) => name && !/^(medicine|scheduled medicine)$/i.test(name)) || 'scheduled medicine';
  const activeReminderDoseText =
    String(
      activeReminderDose?.dosage_instruction || activeReminderDose?.dose || activeReminderDose?.strength || ''
    )
      .replace(/^(take|drink|use|inom ng|inumin ang)\s+/i, '')
      .replace(/^a\s+/i, '')
      .trim();
  const hasGenericCaregiverReminder =
    !caregiverVoiceAlert?.message ||
    /\byour\s+(?:scheduled\s+)?medicine\b/i.test(caregiverVoiceAlert.message);
  const scheduledReminderHeadline = tr(
        `It’s time to take your ${activeReminderMedicine}${
          activeReminderDoseText ? ` ${activeReminderDoseText}` : ''
        }.`,
        `Oras nang inumin ang iyong ${activeReminderMedicine}${
          activeReminderDoseText ? ` ${activeReminderDoseText}` : ''
        }.`
      );
  const activeReminderHeadline =
    caregiverVoiceAlert && !hasGenericCaregiverReminder
      ? activeReminderText
      : scheduledReminderHeadline;
  const reminderWasLogged =
    activeReminderDose &&
    dismissedReminder?.scheduleId === String(activeReminderDose.schedule_id || activeReminderDose.id || '') &&
    dismissedReminder?.scheduledAt ===
      String(activeReminderDose.scheduled_at || activeReminderDose.scheduled_time || '');

  useEffect(() => {
    if (!caregiverVoiceAlert || !caregiverAlertDose) return;
    const reminderKey = `caregiver:${caregiverVoiceAlert.id || caregiverVoiceAlert.notificationId || caregiverAlertDose.schedule_id}`;
    if (announcedDoseKeys.current.has(reminderKey)) return;
    announcedDoseKeys.current.add(reminderKey);
    speak(activeReminderText);
  }, [activeReminderText, caregiverAlertDose, caregiverVoiceAlert]);

  async function dismissReminderForLoggedDose(dose) {
    if (!caregiverVoiceAlert || !dose) return;
    const sameSchedule =
      String(dose.id || dose.schedule_id) === String(caregiverVoiceAlert.scheduleId) ||
      String(dose.schedule_id) === String(caregiverVoiceAlert.scheduleId);
    const sameMedicine =
      caregiverVoiceAlert.medicine &&
      String(dose.drug_name || '')
        .toLowerCase()
        .includes(String(caregiverVoiceAlert.medicine).toLowerCase());
    if (sameSchedule || sameMedicine) await closeCaregiverAlert();
  }

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

  function requestDoseConfirmation(dose, options = {}) {
    if (!dose) return;
    // Capture the time when the person starts the confirmation.  Keeping this
    // value in state avoids evaluating locale/date APIs while the dialog is
    // rendering, which could otherwise leave the overlay visible without its
    // contents on older mobile browsers.
    setDoseConfirmation({ dose, recordedAt: new Date().toISOString(), ...options });
  }

  function markDueDoseTaken() {
    if (!activeReminderDose) return;
    requestDoseConfirmation(activeReminderDose, {
      closeCaregiver: Boolean(caregiverVoiceAlert),
    });
  }

  const streakWeekDays = useMemo(() => {
    const today = new Date();
    const weekStart = addCalendarDays(today, -((today.getDay() + 6) % 7));
    const streakStart = addCalendarDays(today, -Math.max(0, Number(streak.days || 0) - 1));
    return Array.from({ length: 7 }, (_, index) => {
      const date = addCalendarDays(weekStart, index);
      return {
        key: localDayKey(date),
        label: date.toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-PH', { weekday: 'narrow' }),
        isToday: localDayKey(date) === localDayKey(today),
        isComplete: Number(streak.days || 0) > 0 && date >= streakStart && date <= today,
      };
    });
  }, [language, streak.days]);

  async function snoozeDueDose() {
    if (!activeReminderDose) return;
    await log(activeReminderDose, 'snooze');
    if (caregiverVoiceAlert) await closeCaregiverAlert();
    setNotice(tr('Reminder snoozed for 5 minutes.', 'Na-snooze ang paalala nang 5 minuto.'));
  }

  if (calendarExpanded) {
    return (
      <main className="pm-home pm-home--calendar-expanded">
        <MedicineCalendarModal
          page
          onAdd={() => navigate('/patient/medications/add')}
          onClose={() => setCalendarExpanded(false)}
          selected={calendarDate}
          setSelected={setCalendarDate}
          tr={tr}
        />
      </main>
    );
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

      {(dueNow || caregiverAlertDose) && !reminderWasLogged && (
        <section
          className="pm-compact-reminder pm-home-reminder"
          id="patient-dose-reminder"
        >
          <header className="pm-compact-reminder__header">
            <h2>
              {preferences.ttsEnabled
                ? tr('Voice Reminder', 'Paalala sa Boses')
                : tr('Reminder', 'Paalala')}
            </h2>
            <span className="pm-active-pill">
              <HomeIcon name={new Date(activeReminderDose?.scheduled_time || Date.now()).getHours() < 18 ? 'sun' : 'clock'} size={14} />
              {new Date(activeReminderDose?.scheduled_time || Date.now()).getHours() < 12
                ? tr('Morning', 'Umaga')
                : new Date(activeReminderDose?.scheduled_time || Date.now()).getHours() < 18
                  ? tr('Afternoon', 'Hapon')
                  : tr('Night', 'Gabi')}
            </span>
          </header>
          <div className="pm-compact-reminder__message">
            <button
              type="button"
              className="pm-compact-reminder__voice"
              onClick={() => speak(activeReminderHeadline)}
              aria-label={tr('Repeat voice reminder', 'Ulitin ang paalala sa boses')}
              title={tr('Repeat voice reminder', 'Ulitin ang paalala sa boses')}
            >
              <HomeIcon name="sound" size={28} />
            </button>
            <div>
              <strong>
                <span aria-hidden="true">“</span>
                {activeReminderHeadline}
                <span aria-hidden="true">”</span>
              </strong>
              <small>
                {tr(
                  'You can scan your medicine to verify it, or mark it as taken after you take it.',
                  'Maaari mong i-scan ang gamot para ma-verify ito, o markahan itong nainom pagkatapos inumin.'
                )}
              </small>
            </div>
          </div>
          {preferences.ttsEnabled && (
            <div
              aria-label={tr('Voice reminder is speaking', 'Binabasa ang paalala sa boses')}
              className="pm-compact-reminder__wave is-speaking"
              role="img"
            >
              {REMINDER_WAVE.map((height, index) => (
                <i key={index} style={{ '--wave-index': index, '--wave-height': `${height}px`, height }} />
              ))}
            </div>
          )}
          <div className="pm-reminder-actions">
            <button
              type="button"
              className="pm-reminder-mark pm-tour-mark-taken"
              disabled={!activeReminderDose}
              onClick={markDueDoseTaken}
            >
              <HomeIcon name="check" size={18} /> {tr('Mark as Taken', 'Markahan bilang Nainom')}
            </button>
            <button
              type="button"
              className="pm-reminder-scan pm-tour-scan-medicine"
              onClick={openMedicineScanner}
            >
              <HomeIcon name="scan" size={18} /> {tr('Scan Medicine', 'I-scan ang Gamot')}
            </button>
            <button
              type="button"
              className="pm-reminder-snooze"
              disabled={!activeReminderDose}
              onClick={snoozeDueDose}
            >
              <HomeIcon name="clock" size={19} /> {tr('Snooze for 5 Minutes', 'I-snooze nang 5 Minuto')}
            </button>
          </div>
          <small className="pm-compact-reminder__hint">
            {tr(
              'Scan the medicine label for automatic verification and dose logging.',
              'I-scan ang label ng gamot para awtomatikong ma-verify at maitala ang dose.'
            )}
          </small>
        </section>
      )}

      <section
        className="pm-medication-calendar-summary pm-home-calendar"
        aria-labelledby="home-calendar-title"
      >
        <div className="pm-home-calendar__planner">
          <header>
          <div>
            <small>{tr('Medicine Calendar', 'Kalendaryo ng Gamot')}</small>
            <h2 id="home-calendar-title">
              {calendarDate.toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-PH', {
                month: 'long',
                year: 'numeric',
              })}
            </h2>
          </div>
          <button onClick={() => setCalendarExpanded(true)} type="button">
            <HomeIcon name="calendar" size={17} />
            <span>{tr('View Calendar', 'Kalendaryo')}</span>
          </button>
          </header>
          <div className="pm-medication-calendar-summary__navigation">
          <button
            aria-label={tr('Previous day', 'Nakaraang araw')}
            onClick={() => setCalendarDate((date) => addCalendarDays(date, -1))}
            type="button"
          >
            <HomeIcon name="left" size={20} />
          </button>
          <strong>
            {isCalendarToday
              ? tr('Today', 'Ngayon')
              : calendarDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </strong>
          <button
            aria-label={tr('Next day', 'Susunod na araw')}
            onClick={() => setCalendarDate((date) => addCalendarDays(date, 1))}
            type="button"
          >
            <HomeIcon name="right" size={20} />
          </button>
          </div>
          <div className="pm-medication-calendar-summary__week" aria-label={tr('Choose a day', 'Pumili ng araw')}>
          {calendarWeek.map((date) => (
            <button
              aria-pressed={localDayKey(date) === localDayKey(calendarDate)}
              className={localDayKey(date) === localDayKey(calendarDate) ? 'selected' : ''}
              key={localDayKey(date)}
              onClick={() => setCalendarDate(date)}
              type="button"
            >
              <small>
                {date.toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-PH', {
                  weekday: 'narrow',
                })}
              </small>
              <strong>{date.getDate()}</strong>
            </button>
          ))}
          </div>
          <div className="pm-medication-calendar-summary__filters">
          {[
            ['upcoming', tr('Upcoming', 'Susunod')],
            ['taken', tr('Taken', 'Nainom')],
            ['missed', tr('Missed', 'Napalampas')],
          ].map(([value, label]) => (
            <button
              aria-pressed={calendarFilter === value}
              className={calendarFilter === value ? 'active' : ''}
              key={value}
              onClick={() => setCalendarFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
          </div>
        </div>
        <strong className="pm-medication-calendar-summary__date">
          {calendarDateLabel(calendarDate, language)}
        </strong>
        <div className="pm-medication-calendar-summary__result" aria-live="polite">
          {(isCalendarToday ? doses === null : calendarLoading) ? (
            <p>{tr('Loading doses…', 'Nilo-load ang mga dose…')}</p>
          ) : calendarError ? (
            <p role="alert">{calendarError}</p>
          ) : visibleCalendarDoses.length ? (
            <div className="pm-home-calendar__doses">
              {visibleCalendarDoses.map((dose, index) => {
                const status = doseStatus(dose);
                const isTaken = ['TAKEN', 'TAKEN_LATE'].includes(status);
                const isMissed = status === 'MISSED';
                return (
                  <article key={dose.schedule_id || `${dose.medication_id}-${index}`}>
                    <span>
                      <HomeIcon name={isTaken ? 'check' : 'medicine'} size={20} />
                    </span>
                    <div>
                      <strong>{dose.drug_name || tr('Medicine', 'Gamot')}</strong>
                      <small>
                        {dose.dosage_instruction || tr('Medicine reminder', 'Paalala sa gamot')}
                      </small>
                      <time>
                        <HomeIcon name="clock" size={14} />{' '}
                        {new Date(dose.scheduled_time).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>
                    <em className={isTaken ? 'taken' : isMissed ? 'missed' : 'upcoming'}>
                      {isTaken
                        ? tr('Taken', 'Nainom')
                        : isMissed
                          ? tr('Missed', 'Hindi nainom')
                          : tr('Upcoming', 'Paparating')}
                    </em>
                  </article>
                );
              })}
            </div>
          ) : (
            <p>
              {tr(`No ${calendarFilter} doses for this date.`, 'Walang dose para sa petsang ito.')}
            </p>
          )}
        </div>
      </section>

      {streakStatus?.state === 'reward_ready' && (
        <Link className="pm-streak-alert pm-streak-alert--reward" to="/patient/streak">
          <span>
            <HomeIcon name="star" size={22} />
          </span>
          <div>
            <strong>{tr(`You earned Priority Tokens!`, 'Nakakuha ka ng Priority Tokens!')}</strong>
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

      <section className="pm-dashboard-card pm-home-streak-card" aria-labelledby="streak-title">
        <div className="pm-home-streak-card__hero">
          <div>
            <strong>{streak.days}</strong>
            <h2 id="streak-title">{tr('Days Streak!', 'Araw na Streak!')}</h2>
            <p>{tr('Every dose counts. Keep your routine going!', 'Mahalaga ang bawat dose. Ipagpatuloy ang iyong routine!')}</p>
          </div>
          <span aria-hidden="true"><HomeIcon name="flame" size={52} /></span>
        </div>
        <div className="pm-home-streak-card__week" aria-label={tr('This week’s streak', 'Streak ngayong linggo')}>
          {streakWeekDays.map((day) => (
            <div className={day.isToday ? 'is-today' : ''} key={day.key}>
              <small>{day.label}</small>
              <span className={day.isComplete ? 'is-complete' : ''}>{day.isComplete ? <HomeIcon name="flame" size={16} /> : ''}</span>
            </div>
          ))}
        </div>
        <Link className="pm-home-streak-card__link" to="/patient/streak">
          {tr('View adherence progress', 'Tingnan ang adherence progress')} <span aria-hidden="true">›</span>
        </Link>
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

      {scanOpen && scanPhoto && (
        <div
          className="pm-scan-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeScan();
          }}
        >
          <section
            className="pm-scan-sheet pm-med-scanner"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-title"
          >
            <div className="pm-scan-sheet__header">
              <div>
                <h2 id="scan-title">Scan Medicine Label</h2>
                <p>Scan the text printed on your medicine label.</p>
              </div>
              <button type="button" onClick={closeScan} aria-label="Close medicine scanner">
                ×
              </button>
            </div>

            <div className="pm-scan-review pm-med-scan-review">
                <button
                  type="button"
                  className="pm-med-scan-preview pm-med-scan-preview--button"
                  onClick={() => setScanPhotoFullView(true)}
                  aria-label="View medicine label full screen"
                >
                  <img src={scanPhoto.url} alt="Selected medicine label" />
                  <i />
                  <i />
                  <i />
                  <i />
                  {scanBusy && <span className="pm-med-scan-reading">Reading medicine label…</span>}
                </button>
                <button
                  type="button"
                  className="pm-scan-retake"
                  onClick={() => {
                    setScanPhoto(null);
                    setScanName('');
                    setScanStrength('');
                    setScanFormulation('');
                    setScanOcr(null);
                    setScanReviewed(false);
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
                    setScanReviewed(false);
                    setScanResult(null);
                  }}
                  placeholder="Example: Paracetamol"
                  autoComplete="off"
                />
                <label htmlFor="scan-medicine-strength">Strength</label>
                <input
                  id="scan-medicine-strength"
                  value={scanStrength}
                  onChange={(event) => {
                    setScanStrength(event.target.value);
                    setScanReviewed(false);
                  }}
                  placeholder="Example: 500 mg or 250 mg/5 mL"
                />
                <label htmlFor="scan-medicine-formulation">Formulation</label>
                <input
                  id="scan-medicine-formulation"
                  value={scanFormulation}
                  onChange={(event) => {
                    setScanFormulation(event.target.value);
                    setScanReviewed(false);
                  }}
                  placeholder="Example: Tablet or Oral Suspension"
                />
                <label className="pm-scan-confirmation">
                  <input
                    type="checkbox"
                    checked={scanReviewed}
                    disabled={scanOcr?.outcome === 'RECAPTURE_REQUIRED'}
                    onChange={(event) => setScanReviewed(event.target.checked)}
                  />
                  <span>
                    I checked the medicine name, strength, and formulation against the package.
                  </span>
                </label>
                <p className="pm-med-scan-privacy">
                  Review the photo carefully before confirming. Only the medicine details you
                  confirm are used to log your dose.
                </p>
                {!scanResult?.match && (
                  <button
                    type="button"
                    className="pm-action-button"
                    disabled={
                      !scanName.trim() ||
                      !scanReviewed ||
                      scanBusy ||
                      scanOcr?.outcome === 'RECAPTURE_REQUIRED'
                    }
                    onClick={verifyScan}
                  >
                    {scanBusy ? 'Checking…' : '✓ I-confirm at I-log'}
                  </button>
                )}
                {scanResult?.match && (
                  <div className="pm-scan-result pm-scan-result--success">
                    <strong>Medicine verified</strong>
                    <span>
                      {scanResult.doseReadyToLog
                        ? `${scanResult.drug_name} matches your schedule. Logging your dose now.`
                        : `${scanResult.drug_name} is active, but it has no outstanding scheduled dose to record.`}
                    </span>
                  </div>
                )}
                {scanResult && !scanResult.match && (
                  <div className="pm-scan-result pm-scan-result--warn">
                    <strong>Medicine does not match your schedule</strong>
                    <span>
                      {scanResult.message ||
                        'Check the label, then scan the medicine currently scheduled for you.'}
                    </span>
                  </div>
                )}
            </div>
          </section>
          {scanPhotoFullView && (
            <div className="pm-label-full-view" role="presentation" onClick={() => setScanPhotoFullView(false)}>
              <section className="pm-label-full-view__content" role="dialog" aria-modal="true" aria-label="Full screen medicine label" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="pm-label-full-view__close" onClick={() => setScanPhotoFullView(false)} aria-label="Close full screen photo">×</button>
                <img src={scanPhoto.url} alt="Full-size medicine label" />
              </section>
            </div>
          )}
        </div>
      )}

      {doseConfirmation && createPortal(
        <div className="pm-log-success-backdrop" role="presentation">
          <section
            aria-labelledby="dose-confirm-title"
            aria-modal="true"
            className="pm-log-success-modal pm-dose-confirm-modal"
            role="dialog"
          >
            <div className="pm-log-success-check" aria-hidden="true">?</div>
            <h2 id="dose-confirm-title">{tr('Is this medicine correct?', 'Tama ba ang gamot na ito?')}</h2>
            <p>
              {tr(
                'Please check the medicine and dose before marking it as taken.',
                'Suriin ang gamot at dose bago markahan bilang nainom.'
              )}
            </p>
            <dl className="pm-log-success-details">
              <div>
                <dt>{tr('Medicine', 'Gamot')}</dt>
                <dd>{doseConfirmation.dose.drug_name || tr('Scheduled medicine', 'Naka-iskedyul na gamot')}</dd>
              </div>
              <div>
                <dt>{tr('Dose', 'Dose')}</dt>
                <dd>{doseConfirmation.dose.dosage_instruction || tr('As scheduled', 'Ayon sa iskedyul')}</dd>
              </div>
              <div>
                <dt>{tr('Date and time', 'Petsa at oras')}</dt>
                <dd>{doseConfirmationDateTime(doseConfirmation.recordedAt, language)}</dd>
              </div>
            </dl>
            <div className="pm-dose-confirm-modal__actions">
              <button onClick={() => setDoseConfirmation(null)} type="button">
                {tr('Cancel', 'Kanselahin')}
              </button>
              <button onClick={confirmDoseLog} type="button">
                {tr('Yes, log as taken', 'Oo, itala bilang nainom')}
              </button>
            </div>
          </section>
        </div>,
        document.body
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
              onClick={() => {
                setLoggedDose(null);
                if (streakStarted) {
                  speak(
                    tr(
                      'You have started a medication streak. Keep taking your scheduled medicine each day.',
                      'Nagsimula ka na ng streak sa pag-inom ng gamot. Ipagpatuloy ang pag-inom ng naka-iskedyul na gamot araw-araw.'
                    )
                  );
                }
              }}
              type="button"
            >
              {tr('Done', 'Tapos')}
            </button>
          </section>
        </div>
      )}

      {streakStarted && !loggedDose && (
        <div className="pm-log-success-backdrop" role="presentation">
          <section
            aria-labelledby="streak-start-title"
            aria-modal="true"
            className="pm-log-success-modal pm-streak-start-modal"
            role="dialog"
          >
            <div className="pm-streak-start-modal__flame" aria-hidden="true">
              <HomeIcon name="flame" size={76} />
            </div>
            <div className="pm-streak-start-modal__week" aria-label={tr('Your first streak week', 'Unang linggo ng iyong streak')}>
              {streakWeekDays.map((day) => (
                <div className={day.isToday ? 'is-complete' : ''} key={day.key}>
                  <span>{day.isToday ? <HomeIcon name="check" size={20} /> : ''}</span>
                  <small>{day.label}</small>
                </div>
              ))}
            </div>
            <h2 id="streak-start-title">{tr("You've started a streak!", 'Nagsimula ka na ng streak!')}</h2>
            <p>
              {tr(
                'Take your scheduled medicine each day to build a healthier habit.',
                'Inumin ang naka-iskedyul mong gamot araw-araw para makabuo ng mas malusog na gawi.'
              )}
            </p>
            <button className="pm-log-success-done" onClick={() => setStreakStarted(false)} type="button">
              {tr('Continue', 'Magpatuloy')}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
