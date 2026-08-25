import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { speak } from '../../lib/notifications.js';
import { newLogId } from '../../lib/doseOutbox.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

function Icon({ name, size = 22 }) {
  const paths = {
    add: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m9 18 6-6-6-6" />,
    back: <path d="m15 18-6-6 6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    camera: (
      <>
        <path d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
        <circle cx="12" cy="12" r="3.5" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
    flame: (
      <path d="M13.5 3.5c.5 3-1.2 4.3-2.4 5.5-1.2-1-1.8-2.3-1.8-3.7C6.8 7.2 5 10 5 13.3A7 7 0 0 0 19 13c0-3.9-2.2-7-5.5-9.5ZM12 20c-2 0-3.5-1.5-3.5-3.5 0-1.5.8-2.7 2-3.8.1 1 .7 1.8 1.5 2.3.9-.8 1.5-1.8 1.6-3 1.2 1.2 1.9 2.6 1.9 4.2A3.5 3.5 0 0 1 12 20Z" />
    ),
    gallery: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m4 17 5-5 4 4 2-2 5 5" />
      </>
    ),
    medicine: (
      <>
        <path d="m10.5 5.5 8 8a4 4 0 0 1-5.7 5.7l-8-8a4 4 0 0 1 5.7-5.7Z" />
        <path d="m8.5 15.5 7-7" />
      </>
    ),
    scan: (
      <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
        <path d="M7 12h10" />
      </>
    ),
    rx: (
      <>
        <path d="M6 2h8l4 4v16H6Z" />
        <path d="M14 2v5h5M9 12h6M12 9v6" />
      </>
    ),
    otc: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z" />
        <path d="M12 8v7M8.5 11.5h7" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
    warning: (
      <>
        <path d="M10.3 4.4 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.4a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
      </>
    ),
    volume: (
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

const medName = (m) => m?.drug_name || m?.drug_name_raw || m?.name || 'Medicine';
const medicineKind = (m) =>
  String(m?.source || m?.medication_source || '')
    .toUpperCase()
    .includes('OTC')
    ? 'otc'
    : 'rx';
const enrichDose = (dose, medicines = []) => {
  const medicine = medicines.find((item) => item.id === dose.medication_id);
  return { ...medicine, ...dose, source: dose.source || medicine?.source };
};
const time = (v) =>
  v ? new Date(v).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '8:00 AM';
function clockMinutes(value, fallback) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  return Math.max(0, Math.min(1439, Number(match[1]) * 60 + Number(match[2])));
}
function scheduleDate(minutes, startDate) {
  const today = new Date();
  const requested = startDate ? new Date(`${startDate}T00:00:00`) : today;
  const date =
    Number.isNaN(requested.getTime()) ||
    requested < new Date(today.getFullYear(), today.getMonth(), today.getDate())
      ? today
      : requested;
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.toISOString();
}
function suggestedMinutes(preference, frequencyValue) {
  const frequency = String(preference.frequency || frequencyValue || '').toLowerCase();
  const directions = String(preference.labelDirections || '').toLowerCase();
  const wake = clockMinutes(preference.wakeTime, 7 * 60);
  const bedtime = clockMinutes(preference.bedtime, 21 * 60);
  const foodTiming = preference.foodTiming || 'no restriction';
  const morningOffset =
    foodTiming === 'before food' ? 30 : ['with food', 'after food'].includes(foodTiming) ? 60 : 0;
  const morning = Math.min(1439, wake + morningOffset);
  const evening = Math.max(
    morning + 60,
    Math.min(1439, bedtime - (foodTiming === 'before food' ? 60 : 0))
  );
  let count = 1;
  if (/three|3\s*x|tid/.test(frequency)) count = 3;
  else if (/twice|two|2\s*x|bid/.test(frequency)) count = 2;
  const everyHours = frequency.match(/every\s+(\d+)\s*hours?/);
  if (everyHours) {
    const interval = Math.max(1, Number(everyHours[1])) * 60;
    const values = [];
    for (let minute = morning; minute <= bedtime && values.length < 6; minute += interval)
      values.push(minute);
    return values;
  }
  if (count === 1) {
    if (/bedtime|at night|evening/.test(directions)) return [bedtime];
    if (/lunch|noon/.test(directions)) return [12 * 60];
    if (/dinner/.test(directions)) return [18 * 60 + 30];
    return [morning];
  }
  if (count === 2) return [morning, evening];
  return [morning, Math.round((morning + evening) / 2), evening];
}
function suggestionReason(preference, frequencyValue) {
  const frequency = preference.frequency || frequencyValue || 'the selected frequency';
  const food =
    preference.foodTiming && preference.foodTiming !== 'no restriction'
      ? `, ${preference.foodTiming}`
      : '';
  const routine =
    preference.wakeTime && preference.bedtime
      ? `, and the ${preference.wakeTime}–${preference.bedtime} daily routine`
      : '';
  const directions = preference.labelDirections
    ? ' The medicine-label directions were included for review.'
    : '';
  return `Suggested from ${frequency}${food}${routine}.${directions}`;
}
function manualEntryFromMedicine(medicine, key = `manual-entry-${Date.now()}`) {
  const dosageParts = String(medicine?.dosage_instruction || medicine?.strength || '')
    .split(',')
    .map((part) => part.trim());
  const rawFrequency = String(medicine?.frequency || 'once daily').toLowerCase();
  const frequency =
    {
      'once daily': 'Once daily',
      'twice daily': 'Twice daily',
      'three times daily': '3x daily',
      '3x daily': '3x daily',
      'every other day': 'Every other day',
      'every 6 hours': 'Every 6 hours',
      'every 8 hours': 'Every 8 hours',
      'every 12 hours': 'Every 12 hours',
    }[rawFrequency] || 'Once daily';
  return {
    key,
    medicineId: medicine?.id || '',
    medicine: medicine ? medName(medicine) : '',
    strength: dosageParts[0] || '',
    form: dosageParts[1] || medicine?.form || 'Tablet',
    frequency,
    times: ['08:00'],
  };
}
const REMINDER_WAVE = [
  5, 9, 4, 13, 7, 18, 10, 24, 8, 15, 5, 11, 20, 7, 13, 25, 9, 17, 6, 12, 21, 8, 14, 6, 18, 11, 7,
  15, 5, 9,
];
const DUE_WINDOW_MS = 30 * 60 * 1000;

function isDoseDue(dose, now = Date.now()) {
  try {
    const snoozed = JSON.parse(localStorage.getItem('pm_snoozed_doses') || '{}');
    if (Number(snoozed[dose?.schedule_id] || 0) > now) return false;
  } catch {
    /* Ignore invalid local snooze state. */
  }
  const scheduledAt = new Date(dose?.scheduled_time).getTime();
  return Number.isFinite(scheduledAt) && now >= scheduledAt && now - scheduledAt <= DUE_WINDOW_MS;
}

function localDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function recordStreak(date = new Date()) {
  try {
    const stored = JSON.parse(localStorage.getItem('pm_priority_streak') || 'null') || {};
    const today = localDayKey(date);
    if (stored.lastTaken === today) return Number(stored.days || 0);
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const days =
      stored.lastTaken === localDayKey(yesterday) ? Math.min(7, Number(stored.days || 0) + 1) : 1;
    const previousDays = Number(stored.days || 0);
    const reward =
      days === 7 && previousDays < 7 ? 2 : days % 3 === 0 && previousDays !== days ? 1 : 0;
    localStorage.setItem(
      'pm_priority_streak',
      JSON.stringify({
        days,
        lastTaken: today,
        tokens: Number(stored.tokens || 0) + reward,
      })
    );
    return days;
  } catch {
    return 1;
  }
}

function guessMedicineName(text, medicines = []) {
  const normalizedText = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
  const known = medicines.find((medicine) => {
    const name = medName(medicine)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    return name.length > 2 && normalizedText.includes(name);
  });
  if (known) return medName(known);
  const candidate = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /[a-z]{4}/i.test(line) && /\d+\s*(mg|mcg|g|ml)\b/i.test(line));
  return (candidate || '')
    .replace(/\b(tablets?|capsules?|caplets?|syrup|solution|suspension)\b.*$/i, '')
    .replace(/\b\d+(?:\.\d+)?\s*(mg|mcg|g|ml)\b.*$/i, '')
    .trim();
}

export default function Medications() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();
  const tr = (en, fil) => (language === 'fil' ? fil : en);
  const [meds, setMeds] = useState(null),
    [doses, setDoses] = useState([]);
  const [view, setView] = useState('loading'),
    [modal, setModal] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date()),
    [logged, setLogged] = useState(null);
  const [error, setError] = useState('');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [scanOpen, setScanOpen] = useState(false);
  const [scanPhoto, setScanPhoto] = useState(null);
  const [scanName, setScanName] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [doseLogBusy, setDoseLogBusy] = useState(false);
  const [doseToConfirm, setDoseToConfirm] = useState(null);
  const [medicineToManage, setMedicineToManage] = useState(null);
  const [savedSchedule, setSavedSchedule] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanConfidence, setScanConfidence] = useState(0);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [form, setForm] = useState({
    entries: [manualEntryFromMedicine(null, 'manual-entry-1')],
    start: new Date().toISOString().slice(0, 10),
    end: '',
    ongoing: true,
  });

  useEffect(() => {
    Promise.all([
      api('/api/patient/medications')
        .then((r) => r.data)
        .catch(() => []),
      api('/api/patient/doses/today')
        .then((r) => r.data)
        .catch(() => []),
    ]).then(([m, d]) => {
      let frontendMedicines = [];
      try {
        frontendMedicines =
          JSON.parse(localStorage.getItem('pm_frontend_medications') || '[]') || [];
      } catch {
        frontendMedicines = [];
      }
      const combinedMedicines = [
        ...m,
        ...frontendMedicines.filter(
          (draft) =>
            !m.some(
              (medicine) =>
                medicine.id === draft.id ||
                medName(medicine).toLowerCase() === medName(draft).toLowerCase()
            )
        ),
      ];
      let savedScheduleRows = [];
      try {
        savedScheduleRows =
          JSON.parse(localStorage.getItem('pm_saved_schedule_rows') || '[]') || [];
      } catch {
        savedScheduleRows = [];
      }
      const historyDoses = d.filter((dose) => !['scheduled', 'snoozed'].includes(dose.status));
      const activeDoses = savedScheduleRows.length
        ? savedScheduleRows.map((row) => ({ ...row, status: row.status || 'scheduled' }))
        : d.filter((dose) => ['scheduled', 'snoozed'].includes(dose.status));
      const combinedDoses = [...activeDoses, ...historyDoses];
      setMeds(combinedMedicines);
      setDoses(combinedDoses);
      if (combinedMedicines.length)
        setForm((current) =>
          current.entries.some((entry) => entry.medicineId)
            ? current
            : {
                ...current,
                entries: [manualEntryFromMedicine(combinedMedicines[0], 'manual-entry-1')],
              }
        );
      if (!combinedMedicines.length) {
        localStorage.removeItem('pm_has_medication_schedule');
        setView('empty');
        return;
      }
      const scheduleHidden = localStorage.getItem('pm_schedule_hidden') === '1';
      const hasSchedule =
        !scheduleHidden &&
        (combinedDoses.length > 0 || localStorage.getItem('pm_has_medication_schedule') === '1');
      if (combinedDoses.length > 0 && !scheduleHidden)
        localStorage.setItem('pm_has_medication_schedule', '1');
      const openEditor = sessionStorage.getItem('pm_open_schedule_editor') === '1';
      const openTaken = sessionStorage.getItem('pm_open_taken_history') === '1';
      const chooseAfterAdd = sessionStorage.getItem('pm_choose_schedule_after_add') === '1';
      const openManualAfterAdd = sessionStorage.getItem('pm_open_manual_after_add') === '1';
      const requestedSetupView = new URLSearchParams(location.search).get('setup');
      if (openManualAfterAdd) {
        try {
          const draft = JSON.parse(sessionStorage.getItem('pm_manual_schedule_draft') || 'null');
          if (draft?.entries?.length) setForm(draft);
        } catch {
          /* Start with the default manual schedule when a draft is invalid. */
        }
      }
      sessionStorage.removeItem('pm_open_schedule_editor');
      sessionStorage.removeItem('pm_open_taken_history');
      sessionStorage.removeItem('pm_choose_schedule_after_add');
      sessionStorage.removeItem('pm_open_manual_after_add');
      sessionStorage.removeItem('pm_manual_schedule_draft');
      setView(
        requestedSetupView === 'manual'
          ? 'manual'
          : requestedSetupView === 'choice'
            ? 'choice'
            : openManualAfterAdd
              ? 'manual'
              : chooseAfterAdd
                ? 'choice'
                : openEditor && hasSchedule
                  ? 'edit'
                  : hasSchedule
                    ? 'dashboard'
                    : 'medicines'
      );
      if (openTaken && hasSchedule) setModal('taken');
    });
  }, [location.search]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshDoses = () =>
      api('/api/patient/doses/today')
        .then((response) => setDoses(response.data))
        .catch(() => {});
    const timer = window.setInterval(refreshDoses, 30000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshDoses();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  useEffect(
    () => () => {
      if (scanPhoto?.url) URL.revokeObjectURL(scanPhoto.url);
    },
    [scanPhoto]
  );

  const upcoming = useMemo(
    () =>
      doses
        .filter((d) => ['scheduled', 'snoozed'].includes(d.status))
        .map((dose) => enrichDose(dose, meds || []))
        .sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time)),
    [doses, meds]
  );
  const dueDose = useMemo(() => {
    const dose = upcoming.find((item) => isDoseDue(item, clockNow));
    if (!dose) return null;
    const medication = (meds || []).find((item) => item.id === dose.medication_id);
    return {
      ...medication,
      ...dose,
      dosage_instruction: dose.dosage_instruction || medication?.dosage_instruction || '',
      strength: dose.strength || medication?.strength || '',
    };
  }, [upcoming, clockNow, meds]);
  const taken = useMemo(
    () =>
      doses
        .filter((d) => ['taken', 'taken_late'].includes(d.status))
        .map((dose) => enrichDose(dose, meds || [])),
    [doses, meds]
  );
  const missed = useMemo(
    () => doses.filter((d) => d.status === 'missed').map((dose) => enrichDose(dose, meds || [])),
    [doses, meds]
  );
  const suggestions = useMemo(
    () =>
      (meds || []).flatMap((m) => {
        const matches = doses.filter((d) => medName(d) === medName(m));
        if (matches.length) return matches;
        let preference = {};
        try {
          preference =
            JSON.parse(localStorage.getItem('pm_medicine_schedule_preferences') || '{}')?.[m.id] ||
            {};
        } catch {
          preference = {};
        }
        return suggestedMinutes(preference, m.frequency).map((minute, index) => ({
          ...m,
          scheduled_time: scheduleDate(minute, preference.startDate),
          schedule_id: `suggested-${m.id}-${index}`,
          reason: suggestionReason(preference, m.frequency),
          generated_reason: suggestionReason(preference, m.frequency),
        }));
      }),
    [meds, doses]
  );
  const manualPreviewRows = useMemo(
    () =>
      form.entries.flatMap((entry, entryIndex) =>
        entry.times.map((scheduledTime, timeIndex) => ({
          ...(meds || []).find((medicine) => String(medicine.id) === String(entry.medicineId)),
          medication_id: entry.medicineId,
          drug_name: entry.medicine,
          dosage_instruction: [entry.strength, entry.form].filter(Boolean).join(', '),
          frequency: entry.frequency,
          scheduled_time: scheduleDate(clockMinutes(scheduledTime, 8 * 60), form.start),
          schedule_id: `manual-preview-${entryIndex}-${timeIndex}`,
        }))
      ),
    [form, meds]
  );

  const addMedicine = () => navigate('/patient/medications/add');
  const addMedicineFromManual = () => {
    sessionStorage.setItem('pm_manual_schedule_draft', JSON.stringify(form));
    sessionStorage.setItem('pm_return_to_manual_after_add', '1');
    navigate('/patient/medications/add');
  };
  const scanner = () => setScanOpen(true);
  const finishSchedule = (source = 'manual') => {
    localStorage.removeItem('pm_schedule_hidden');
    localStorage.removeItem('pm_removed_schedule_rows');
    localStorage.setItem('pm_has_medication_schedule', '1');
    localStorage.setItem('pm_medication_schedule_source', source);
    if (source === 'manual')
      localStorage.setItem('pm_manual_medication_schedule', JSON.stringify(form));
    const scheduleRows = (source === 'manual' ? manualPreviewRows : suggestions).map(
      (row, index) => ({
        ...row,
        status: 'scheduled',
        schedule_id: row.schedule_id || `saved-${index}`,
      })
    );
    localStorage.setItem('pm_saved_schedule_rows', JSON.stringify(scheduleRows));
    setDoses((current) => [
      ...scheduleRows,
      ...current.filter((dose) => !['scheduled', 'snoozed'].includes(dose.status)),
    ]);
    setSavedSchedule({ source, rows: scheduleRows });
  };
  function removeFromFrontendState(medicineId) {
    let frontendMedicines = [];
    let scheduleRows = [];
    try {
      frontendMedicines = JSON.parse(localStorage.getItem('pm_frontend_medications') || '[]') || [];
    } catch {
      frontendMedicines = [];
    }
    try {
      scheduleRows = JSON.parse(localStorage.getItem('pm_saved_schedule_rows') || '[]') || [];
    } catch {
      scheduleRows = [];
    }
    localStorage.setItem(
      'pm_frontend_medications',
      JSON.stringify(frontendMedicines.filter((item) => String(item.id) !== String(medicineId)))
    );
    localStorage.setItem(
      'pm_saved_schedule_rows',
      JSON.stringify(
        scheduleRows.filter((row) => String(row.medication_id || row.id) !== String(medicineId))
      )
    );
    setMeds((items) => items.filter((item) => String(item.id) !== String(medicineId)));
    setDoses((items) =>
      items.filter((dose) => String(dose.medication_id || dose.id) !== String(medicineId))
    );
  }
  async function removeMedicine(medicine) {
    const confirmed = window.confirm(
      tr(
        `Delete ${medName(medicine)} and its upcoming reminders?`,
        `Tanggalin ang ${medName(medicine)} at ang mga paparating nitong paalala?`
      )
    );
    if (!confirmed) return;
    const medicineId = medicine.medication_id || medicine.id;
    if (String(medicineId).startsWith('frontend-')) {
      removeFromFrontendState(medicineId);
      setMedicineToManage(null);
      return;
    }
    try {
      const detail = await api(`/api/patient/medications/${medicineId}`);
      await api(`/api/patient/medications/${medicineId}/stop`, {
        method: 'POST',
        body: { expected_updated_at: detail.data.updated_at },
      });
      removeFromFrontendState(medicineId);
      setMedicineToManage(null);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }
  async function logDose(dose, method = 'manual') {
    if (!dose || doseLogBusy) return false;
    const at = new Date();
    setDoseLogBusy(true);
    try {
      const response = await api(`/api/patient/doses/${dose.schedule_id}/log`, {
        method: 'POST',
        body: { action: 'take', log_id: newLogId(), logged_at: at.toISOString(), method },
      });
      setDoses((all) =>
        all.map((item) =>
          item.schedule_id === dose.schedule_id
            ? { ...item, status: response.data.status || 'taken' }
            : item
        )
      );
      try {
        const snoozed = JSON.parse(localStorage.getItem('pm_snoozed_doses') || '{}');
        delete snoozed[dose.schedule_id];
        localStorage.setItem('pm_snoozed_doses', JSON.stringify(snoozed));
      } catch {
        /* Ignore invalid local snooze state. */
      }
      setLogged({ ...dose, loggedAt: at, streakDays: recordStreak(at) });
      setError('');
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setDoseLogBusy(false);
    }
  }

  async function markTaken() {
    const saved = await logDose(doseToConfirm || dueDose, 'manual');
    if (saved) setDoseToConfirm(null);
  }

  async function snoozeDose() {
    if (!dueDose || doseLogBusy) return;
    const snoozedUntil = new Date(Date.now() + 10 * 60 * 1000);
    setDoseLogBusy(true);
    try {
      await api(`/api/patient/doses/${dueDose.schedule_id}/log`, {
        method: 'POST',
        body: {
          action: 'snooze',
          log_id: newLogId(),
          logged_at: new Date().toISOString(),
          method: 'manual',
          notes: 'Snoozed for 10 minutes',
        },
      });
      try {
        const snoozed = JSON.parse(localStorage.getItem('pm_snoozed_doses') || '{}');
        localStorage.setItem(
          'pm_snoozed_doses',
          JSON.stringify({ ...snoozed, [dueDose.schedule_id]: snoozedUntil.getTime() })
        );
      } catch {
        localStorage.setItem(
          'pm_snoozed_doses',
          JSON.stringify({ [dueDose.schedule_id]: snoozedUntil.getTime() })
        );
      }
      setDoses((all) =>
        all.map((item) =>
          item.schedule_id === dueDose.schedule_id
            ? { ...item, status: 'snoozed', scheduled_time: snoozedUntil.toISOString() }
            : item
        )
      );
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDoseLogBusy(false);
    }
  }

  async function verifyLabelValue(value) {
    const label = value.trim();
    if (!label) {
      setScanResult({
        match: false,
        message: tr(
          'Type the medicine name so we can verify it.',
          'I-type ang pangalan ng gamot para ma-verify namin.'
        ),
      });
      return null;
    }
    const response = await api('/api/patient/label/verify', {
      method: 'POST',
      body: { scanned_name: label },
    });
    setScanResult(response.data);
    return response.data;
  }

  async function readMedicineLabel(file) {
    setScanBusy(true);
    setScanProgress(0);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, {
        logger: (message) => {
          if (message.status === 'recognizing text')
            setScanProgress(Math.round(message.progress * 100));
        },
      });
      const recognized = await worker.recognize(file, { rotateAuto: true });
      await worker.terminate();
      const confidence = Math.round(Number(recognized.data.confidence || 0));
      const guess = guessMedicineName(recognized.data.text, meds || []);
      setScanConfidence(confidence);
      setScanName(guess);
      if (guess) await verifyLabelValue(guess);
      else
        setScanResult({
          match: false,
          message: tr(
            'We could not read the medicine name. Type it below instead.',
            'Hindi mabasa ang pangalan ng gamot. I-type na lang ito sa ibaba.'
          ),
        });
    } catch {
      setScanResult({
        match: false,
        message: tr(
          'Automatic scanning could not finish. Type the medicine name below.',
          'Hindi natapos ang awtomatikong pag-scan. I-type ang pangalan ng gamot sa ibaba.'
        ),
      });
    } finally {
      setScanBusy(false);
    }
  }

  async function chooseScanPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setScanPhoto({ file, url: URL.createObjectURL(file) });
    setScanName('');
    setScanResult(null);
    setScanConfidence(0);
    await readMedicineLabel(file);
  }

  async function verifyTypedLabel(event) {
    event.preventDefault();
    setScanBusy(true);
    try {
      await verifyLabelValue(scanName);
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
    setScanResult(null);
    setScanProgress(0);
    setScanConfidence(0);
  }

  async function confirmScannedDose() {
    const matchingDose = upcoming.find(
      (dose) => dose.medication_id === scanResult?.medication_id && isDoseDue(dose)
    );
    if (!matchingDose) {
      setScanResult((current) => ({
        ...current,
        match: false,
        message: tr(
          'This medicine is not due right now. Nothing was logged.',
          'Hindi pa oras para sa gamot na ito. Walang naitala.'
        ),
      }));
      return;
    }
    setScanBusy(true);
    const saved = await logDose(matchingDose, 'ocr');
    setScanBusy(false);
    if (saved) closeScan();
  }

  return (
    <main className="pm-medications-page pm-med-flow">
      <header className="pm-medications-header">
        <div>
          <h1>{tr('Medications', 'Mga Gamot')}</h1>
          <p>{tr('Track your medications.', 'Subaybayan ang iyong mga gamot.')}</p>
        </div>
      </header>
      {['medicines', 'choice', 'suggested', 'manual', 'manual-review'].includes(view) && (
        <MedicationSetupSteps view={savedSchedule ? 'complete' : view} tr={tr} />
      )}
      {error && (
        <div className="pm-banner pm-banner--warn" role="alert">
          {error}
        </div>
      )}
      {view === 'loading' && (
        <div className="pm-med-loading">
          {tr('Loading your medicines…', 'Nilo-load ang iyong mga gamot…')}
        </div>
      )}

      {view === 'empty' && (
        <section className="pm-med-setup-empty">
          <SectionHead
            title={tr('Your Medicines', 'Iyong mga Gamot')}
            action={tr('Add Medicine', 'Magdagdag ng Gamot')}
            onAction={addMedicine}
          />
          <div className="pm-med-empty-visual">
            <span>
              <Icon name="medicine" size={44} />
            </span>
            <i>
              <Icon name="add" />
            </i>
          </div>
          <h2>{tr('No medicines added yet', 'Wala pang gamot na idinagdag')}</h2>
          <p>
            {tr(
              'Add your medicines first to get started with your schedule.',
              'Idagdag muna ang iyong gamot upang makapagsimula sa iskedyul.'
            )}
          </p>
          <Primary onClick={addMedicine}>
            <Icon name="add" /> {tr('Add Medicine', 'Magdagdag ng Gamot')}
          </Primary>
          <Info title={tr('Why add medicines first?', 'Bakit gamot muna?')}>
            {tr(
              'Adding medicines first helps create accurate schedules for the right medicines.',
              'Nakakatulong ito na gumawa ng tamang iskedyul para sa tamang gamot.'
            )}
          </Info>
        </section>
      )}

      {view === 'medicines' && (
        <section className="pm-med-library">
          <Back onClick={() => setView('empty')} tr={tr} />
          <div className="pm-success-strip">
            <Icon name="check" />
            <strong>{tr('Medicine added successfully!', 'Matagumpay naidagdag ang gamot!')}</strong>
          </div>
          <SectionHead
            title={tr('Your Medicines', 'Iyong mga Gamot')}
            action={tr('Add Medicine', 'Magdagdag')}
            onAction={addMedicine}
            description={tr(
              'Add, edit, or remove medicines anytime.',
              'Magdagdag, mag-edit, o mag-alis anumang oras.'
            )}
          />
          <MedicineList
            doses={doses}
            meds={meds}
            onEdit={(medicine) => navigate(`/patient/medications/add?edit=${medicine.id}`)}
            onRemove={removeMedicine}
            tr={tr}
          />
          <aside className="pm-schedule-ready">
            <Icon name="info" />
            <div>
              <strong>
                {tr('Ready to set up your schedule?', 'Handa nang gumawa ng iskedyul?')}
              </strong>
              <p>
                {tr(
                  'We’ll help you plan the safest times.',
                  'Tutulungan ka naming pumili ng ligtas na oras.'
                )}
              </p>
            </div>
            <Primary onClick={() => setView('choice')}>
              <Icon name="calendar" /> {tr('Create Schedule', 'Gumawa ng Iskedyul')}
            </Primary>
          </aside>
        </section>
      )}

      {view === 'choice' && (
        <section className="pm-schedule-choice">
          <Back onClick={() => setView('medicines')} tr={tr} />
          <h2>
            {tr(
              'How would you like to create your schedule?',
              'Paano mo gustong gawin ang iyong iskedyul?'
            )}
          </h2>
          <p>
            {tr('Choose the option that works best for you.', 'Piliin ang paraang angkop sa iyo.')}
          </p>
          <Choice
            icon="calendar"
            title={tr('Use Suggested Schedule', 'Gamitin ang Iminungkahing Iskedyul')}
            text={tr(
              'We’ll suggest reminder times from the medicine directions, frequency, food timing, and daily routine you entered.',
              'Magmumungkahi kami ng oras batay sa tagubilin, dalas, pagkain, at araw-araw mong gawain.'
            )}
            recommended
            onClick={() => setView('suggested')}
            tr={tr}
          />
          <Choice
            icon="edit"
            title={tr('Create Manually', 'Gumawa nang Manu-mano')}
            text={tr(
              'Choose your own times for each medicine. You’re in control.',
              'Piliin ang oras ng bawat gamot.'
            )}
            onClick={() => setView('manual')}
            tr={tr}
          />
          <Info>
            {tr(
              'You can always edit your schedule later.',
              'Maaari mong baguhin ang iskedyul anumang oras.'
            )}
          </Info>
        </section>
      )}

      {view === 'suggested' && (
        <section className="pm-suggested-schedule">
          <ViewTitle
            title={tr('Suggested Schedule', 'Iminungkahing Iskedyul')}
            onBack={() => setView('choice')}
            tr={tr}
          />
          <div className="pm-smart-heading">
            <span>
              <Icon name="calendar" size={32} />
            </span>
            <div>
              <h3>{tr('Smart Suggested Schedule', 'Matalinong Mungkahi')}</h3>
              <p>
                {tr(
                  'Created from the answers you provided when adding each medicine.',
                  'Ginawa mula sa mga sagot mo nang idagdag ang bawat gamot.'
                )}
              </p>
            </div>
          </div>
          <Safe tr={tr} />
          <h3>{tr('Your Suggested Schedule', 'Iyong Iminungkahing Iskedyul')}</h3>
          <DoseRows rows={suggestions} status="upcoming" tr={tr} />
          <Info title={tr('Why this schedule?', 'Bakit ito ang iskedyul?')}>
            {tr(
              'The proposed times follow the frequency, food timing, written directions, and daily routine you entered. Review every time against the medicine label before saving.',
              'Sinusunod ng mungkahing oras ang dalas, pagkain, tagubilin, at araw-araw mong gawain. Suriin ito ayon sa label bago i-save.'
            )}
          </Info>
          <Primary onClick={() => finishSchedule('suggested')}>
            <Icon name="check" /> {tr('Use This Schedule', 'Gamitin ang Iskedyul')}
          </Primary>
          <button className="pm-secondary-large" onClick={() => setView('manual')} type="button">
            <Icon name="edit" /> {tr('Edit Schedule', 'I-edit ang Iskedyul')}
          </button>
        </section>
      )}

      {view === 'manual' && (
        <Manual
          form={form}
          meds={meds || []}
          setForm={setForm}
          onAddNewMedicine={addMedicineFromManual}
          onBack={() => setView('choice')}
          onDone={() => setView('manual-review')}
          tr={tr}
        />
      )}
      {view === 'manual-review' && (
        <section className="pm-suggested-schedule">
          <ViewTitle
            title={tr('Review Your Schedule', 'Suriin ang Iyong Iskedyul')}
            onBack={() => setView('manual')}
            tr={tr}
          />
          <Info title={tr('Check before saving', 'Suriin bago i-save')}>
            {tr(
              'Confirm the medicine, dose, and every reminder time below. Go back to edit anything that is not correct.',
              'Kumpirmahin ang gamot, dose, at bawat oras ng paalala. Bumalik upang baguhin ang anumang hindi tama.'
            )}
          </Info>
          <h3>{tr('Your Created Schedule', 'Iyong Ginawang Iskedyul')}</h3>
          <DoseRows rows={manualPreviewRows} status="upcoming" tr={tr} />
          <Primary onClick={() => finishSchedule('manual')}>
            <Icon name="check" /> {tr('Save This Schedule', 'I-save ang Iskedyul')}
          </Primary>
          <button className="pm-secondary-large" onClick={() => setView('manual')} type="button">
            <Icon name="edit" /> {tr('Edit Schedule', 'I-edit ang Iskedyul')}
          </button>
        </section>
      )}
      {view === 'dashboard' && (
        <Dashboard
          reminderDose={dueDose}
          logBusy={doseLogBusy}
          meds={meds}
          upcoming={upcoming}
          missed={missed}
          taken={taken}
          onCalendar={() => setModal('calendar')}
          onEdit={() => navigate('/patient/schedule')}
          onHistory={setModal}
          onManageMedicine={setMedicineToManage}
          onMark={() => setDoseToConfirm(dueDose)}
          onScan={scanner}
          onSnooze={snoozeDose}
          tr={tr}
        />
      )}
      {view === 'edit' && (
        <section className="pm-edit-schedule">
          <ViewTitle
            title={tr('Edit Schedule', 'I-edit ang Iskedyul')}
            onBack={() => setView(doses.length ? 'dashboard' : 'medicines')}
            tr={tr}
          />
          <Info>
            {tr(
              'Add, delete, or update your medicines and schedules. Make changes as needed.',
              'Magdagdag, magtanggal, o mag-update ng gamot at iskedyul kung kinakailangan.'
            )}
          </Info>
          <SectionHead
            title={tr('Your Upcoming Medicines', 'Iyong mga Paparating na Gamot')}
            action={tr('Add New Medicine', 'Bagong Gamot')}
            onAction={addMedicine}
          />
          <MedicineList
            doses={doses}
            meds={meds}
            onEdit={(medicine) => navigate(`/patient/medications/add?edit=${medicine.id}`)}
            onRemove={removeMedicine}
            tr={tr}
          />
          <Safe tr={tr} />
        </section>
      )}
      {modal === 'calendar' && (
        <Calendar
          selected={selectedDate}
          setSelected={setSelectedDate}
          doses={doses}
          onClose={() => setModal(null)}
          onAdd={() => {
            setModal(null);
            navigate('/patient/schedule');
          }}
          tr={tr}
        />
      )}
      {(modal === 'taken' || modal === 'missed') && (
        <History
          doses={modal === 'taken' ? taken : missed}
          type={modal}
          onClose={() => setModal(null)}
          tr={tr}
        />
      )}
      {scanOpen && (
        <MedicineScanner
          busy={scanBusy}
          cameraInputRef={cameraInputRef}
          confidence={scanConfidence}
          galleryInputRef={galleryInputRef}
          name={scanName}
          onChangeName={setScanName}
          onChoosePhoto={chooseScanPhoto}
          onClose={closeScan}
          onConfirm={confirmScannedDose}
          onRetake={() => {
            setScanPhoto(null);
            setScanName('');
            setScanResult(null);
            setScanProgress(0);
            setScanConfidence(0);
          }}
          onVerify={verifyTypedLabel}
          photo={scanPhoto}
          progress={scanProgress}
          result={scanResult}
          tr={tr}
        />
      )}
      {doseToConfirm && (
        <ConfirmTakenDose
          busy={doseLogBusy}
          dose={doseToConfirm}
          onCancel={() => setDoseToConfirm(null)}
          onConfirm={markTaken}
          onScan={() => {
            setDoseToConfirm(null);
            scanner();
          }}
          tr={tr}
        />
      )}
      {savedSchedule && (
        <ScheduleSaved
          saved={savedSchedule}
          onDone={() => {
            setSavedSchedule(null);
            navigate('/patient/medications', { replace: true });
          }}
          onView={() => navigate('/patient/schedule')}
          tr={tr}
        />
      )}
      {medicineToManage && (
        <MedicineActions
          dose={medicineToManage}
          onClose={() => setMedicineToManage(null)}
          onDelete={() => removeMedicine(medicineToManage)}
          onEdit={() => {
            const medicineId = medicineToManage.medication_id || medicineToManage.id;
            if (medicineId && !String(medicineId).startsWith('frontend-'))
              navigate(`/patient/medications/add?edit=${medicineId}`);
            else {
              sessionStorage.setItem('pm_open_schedule_editor', '1');
              navigate('/patient/medications');
            }
          }}
          tr={tr}
        />
      )}
      {logged && <Success dose={logged} onClose={() => setLogged(null)} tr={tr} />}
    </main>
  );
}

function Primary({ children, onClick }) {
  return (
    <button className="pm-primary-large" onClick={onClick} type="button">
      {children}
    </button>
  );
}
function MedicationSetupSteps({ view, tr }) {
  const current =
    view === 'medicines'
      ? 1
      : view === 'choice' || view === 'manual'
        ? 2
        : view === 'complete'
          ? 4
          : 3;
  const steps = [
    tr('Medicine Details', 'Detalye ng Gamot'),
    tr('Create Schedule', 'Gumawa ng Iskedyul'),
    tr('Review Schedule', 'Suriin ang Iskedyul'),
    tr('Complete', 'Tapos'),
  ];
  return (
    <nav
      aria-label={tr('Medication setup progress', 'Progreso ng medication setup')}
      className="pm-medication-setup-progress"
    >
      <ol>
        {steps.map((label, index) => {
          const step = index + 1;
          return (
            <li
              aria-current={step === current ? 'step' : undefined}
              className={step < current ? 'complete' : step === current ? 'active' : ''}
              key={label}
            >
              <span>{step < current ? <Icon name="check" size={16} /> : step}</span>
              <strong>{label}</strong>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
function Back({ onClick, tr }) {
  return (
    <button className="pm-icon-text-button" onClick={onClick} type="button">
      <Icon name="back" /> {tr('Back', 'Bumalik')}
    </button>
  );
}
function ViewTitle({ title, onBack, tr }) {
  return (
    <div className="pm-view-title">
      <button onClick={onBack} aria-label={tr('Back', 'Bumalik')} type="button">
        <Icon name="back" />
      </button>
      <h2>{title}</h2>
    </div>
  );
}
function Info({ title, children }) {
  return (
    <aside className="pm-med-info">
      <Icon name="info" />
      <div>
        {title && <strong>{title}</strong>}
        <p>{children}</p>
      </div>
    </aside>
  );
}
function Safe({ tr }) {
  return (
    <div className="pm-safe-strip">
      <Icon name="shield" />
      <div>
        <strong>{tr('Safe · Balanced · Effective', 'Ligtas · Balanse · Epektibo')}</strong>
        <small>{tr('No harmful overlaps detected.', 'Walang mapanganib na pagsabay.')}</small>
      </div>
    </div>
  );
}
function SectionHead({ title, description, action, onAction }) {
  return (
    <div className="pm-med-section-head">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <button onClick={onAction} type="button">
        <Icon name="add" /> {action}
      </button>
    </div>
  );
}
function Choice({ icon, title, text, recommended, onClick, tr }) {
  return (
    <button
      className={`pm-choice-card ${recommended ? 'recommended' : ''}`}
      onClick={onClick}
      type="button"
    >
      <span>
        <Icon name={icon} size={30} />
      </span>
      <div>
        <strong>
          {title} {recommended && <small>{tr('Recommended', 'Inirerekomenda')}</small>}
        </strong>
        <p>{text}</p>
      </div>
      <Icon name="arrow" />
    </button>
  );
}
function MedicineDoseDetail({ medicine }) {
  const dosage = medicine?.dosage_instruction || medicine?.strength;
  if (dosage) return <small>{dosage}</small>;
  const kind = medicineKind(medicine);
  return (
    <small
      aria-label={kind === 'otc' ? 'Over-the-counter medicine' : 'Prescription medicine'}
      className={`pm-medicine-type-label ${kind}`}
    >
      <Icon name={kind} size={15} />
      <span>{kind.toUpperCase()}</span>
    </small>
  );
}

function MedicineList({ doses = [], meds = [], onEdit, onRemove, tr }) {
  return (
    <div className="pm-edit-medicine-list">
      {meds.map((medicine, index) => {
        const scheduledTimes = doses
          .filter(
            (dose) =>
              dose.medication_id === medicine.id && ['scheduled', 'snoozed'].includes(dose.status)
          )
          .map((dose) => time(dose.scheduled_time));
        return (
          <article key={medicine.id || `${medName(medicine)}-${index}`}>
            <span className={`pm-medicine-dot pm-medicine-kind--${medicineKind(medicine)}`}>
              <Icon name="medicine" />
            </span>
            <div>
              <h3>
                {medName(medicine)} <MedicineDoseDetail medicine={medicine} />
              </h3>
              <p>{medicine.form || '1 tablet'}</p>
              {scheduledTimes.length > 0 && (
                <div className="pm-medicine-time-pills">
                  {[...new Set(scheduledTimes)].map((scheduledTime) => (
                    <span key={scheduledTime}>
                      <Icon name="clock" size={14} /> {scheduledTime}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => onEdit(medicine)} type="button">
              <Icon name="edit" /> {tr('Edit', 'I-edit')}
            </button>
            <button className="danger" onClick={() => onRemove(medicine)} type="button">
              <Icon name="trash" /> {tr('Delete', 'Tanggalin')}
            </button>
          </article>
        );
      })}
    </div>
  );
}
function doseDayLabel(value, status, tr) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return status === 'missed' ? tr('Yesterday', 'Kahapon') : tr('Today', 'Ngayon');
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return tr('Today', 'Ngayon');
  if (date.toDateString() === yesterday.toDateString()) return tr('Yesterday', 'Kahapon');
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
function DoseRows({ rows = [], status, tr, showStatus = true, dashboard = false, onOpen }) {
  return (
    <div
      className={`pm-dose-rows ${dashboard ? 'pm-dashboard-dose-rows' : ''} ${showStatus ? '' : 'without-status'}`}
    >
      {rows.map((d, i) => {
        const hour = new Date(d.scheduled_time).getHours();
        const statusIcon =
          status === 'taken'
            ? 'check'
            : status === 'missed'
              ? 'warning'
              : hour >= 18
                ? 'moon'
                : 'sun';
        if (dashboard)
          return (
            <article
              className={`pm-dashboard-dose-row pm-dashboard-dose-row--${status}`}
              key={d.schedule_id || i}
            >
              <span className={`pm-medicine-dot pm-medicine-kind--${medicineKind(d)}`}>
                <Icon name="medicine" />
              </span>
              <div className="pm-dashboard-dose-medicine">
                <strong>{medName(d)}</strong>
                <MedicineDoseDetail medicine={d} />
              </div>
              {showStatus && (
                <em className={status}>
                  {status === 'taken'
                    ? tr('Taken', 'Nainom')
                    : status === 'missed'
                      ? tr('Missed', 'Hindi Nainom')
                      : tr('Upcoming', 'Paparating')}
                </em>
              )}
              {status !== 'missed' && (
                <button
                  aria-label={`${tr('Manage', 'Pamahalaan')} ${medName(d)}`}
                  className="pm-dashboard-dose-arrow"
                  onClick={() => onOpen?.(d)}
                  type="button"
                >
                  <Icon name="arrow" size={19} />
                </button>
              )}
              <span className="pm-dashboard-dose-time">
                <Icon name="clock" size={16} />
                <time>{time(d.scheduled_time)}</time>
                <small>{doseDayLabel(d.scheduled_time, status, tr)}</small>
              </span>
            </article>
          );
        return (
          <article key={d.schedule_id || i}>
            <span className={`pm-dose-clock ${status}`}>
              <Icon name={statusIcon} />
            </span>
            <time>{time(d.scheduled_time)}</time>
            <span className={`pm-medicine-dot pm-medicine-kind--${medicineKind(d)}`}>
              <Icon name="medicine" />
            </span>
            <div>
              <strong>{medName(d)}</strong>
              <MedicineDoseDetail medicine={d} />
            </div>
            {showStatus && (
              <em className={status}>
                {status === 'taken'
                  ? tr('Taken', 'Nainom')
                  : status === 'missed'
                    ? tr('Missed', 'Hindi Nainom')
                    : tr('Upcoming', 'Paparating')}
              </em>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Manual({ form, meds, setForm, onAddNewMedicine, onBack, onDone, tr }) {
  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const updateEntry = (index, patch) =>
    setForm((old) => ({
      ...old,
      entries: old.entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry
      ),
    }));
  const chooseMedicine = (index, medicineId) => {
    const medicine = meds.find((item) => String(item.id) === String(medicineId));
    updateEntry(index, manualEntryFromMedicine(medicine, form.entries[index].key));
  };
  const addEntry = () => {
    const used = new Set(form.entries.map((entry) => String(entry.medicineId)));
    const nextMedicine = meds.find((medicine) => !used.has(String(medicine.id)));
    if (!nextMedicine) {
      onAddNewMedicine();
      return;
    }
    setForm((old) => ({
      ...old,
      entries: [...old.entries, manualEntryFromMedicine(nextMedicine)],
    }));
  };
  const removeEntry = (index) =>
    setForm((old) => ({
      ...old,
      entries: old.entries.filter((_, entryIndex) => entryIndex !== index),
    }));
  const canReview =
    form.entries.length > 0 &&
    form.entries.every(
      (entry) =>
        entry.medicineId &&
        entry.strength &&
        entry.form &&
        entry.frequency &&
        entry.times.length &&
        entry.times.every(Boolean)
    );
  return (
    <section className="pm-manual-schedule">
      <ViewTitle
        title={tr('Create Manual Schedule', 'Gumawa ng Manu-manong Iskedyul')}
        onBack={onBack}
        tr={tr}
      />
      <Info>
        {tr(
          'Choose one or more medicines and set each reminder time. You will review the complete schedule before saving.',
          'Pumili ng isa o higit pang gamot at itakda ang bawat oras. Susuriin mo ang buong iskedyul bago i-save.'
        )}
      </Info>
      <div className="pm-manual-medicine-list">
        {form.entries.map((entry, index) => (
          <article className="pm-manual-medicine-card" key={entry.key}>
            <header>
              <span>
                <Icon name="medicine" />
              </span>
              <h3>{tr(`Medicine ${index + 1}`, `Gamot ${index + 1}`)}</h3>
              {form.entries.length > 1 && (
                <button
                  aria-label={tr(`Remove medicine ${index + 1}`, `Alisin ang gamot ${index + 1}`)}
                  onClick={() => removeEntry(index)}
                  type="button"
                >
                  <Icon name="trash" /> {tr('Remove', 'Alisin')}
                </button>
              )}
            </header>
            <label>
              {tr('Medicine Name', 'Pangalan ng Gamot')}
              <select
                onChange={(event) => chooseMedicine(index, event.target.value)}
                required
                value={entry.medicineId}
              >
                <option value="">{tr('Choose a medicine', 'Pumili ng gamot')}</option>
                {meds.map((medicine) => (
                  <option key={medicine.id} value={medicine.id}>
                    {medName(medicine)}
                  </option>
                ))}
              </select>
            </label>
            <div className="pm-manual-medicine-fields">
              <label>
                {tr('Strength (Dose)', 'Lakas (Dose)')}
                <input
                  onChange={(event) => updateEntry(index, { strength: event.target.value })}
                  placeholder="e.g., 500 mg"
                  value={entry.strength}
                />
              </label>
              <label>
                {tr('Form', 'Uri')}
                <select
                  onChange={(event) => updateEntry(index, { form: event.target.value })}
                  value={entry.form}
                >
                  <option>Tablet</option>
                  <option>Capsule</option>
                  <option>Syrup</option>
                  <option>Injection</option>
                  <option>Solution</option>
                  <option>Suspension</option>
                </select>
              </label>
            </div>
            <label>
              {tr('Frequency', 'Dalas')}
              <select
                onChange={(event) => updateEntry(index, { frequency: event.target.value })}
                value={entry.frequency}
              >
                {[
                  'Once daily',
                  'Twice daily',
                  '3x daily',
                  'Every other day',
                  'Every 6 hours',
                  'Every 8 hours',
                  'Every 12 hours',
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>{tr('Reminder time(s)', 'Mga oras ng paalala')}</legend>
              <div className="pm-time-inputs">
                {entry.times.map((selectedTime, timeIndex) => (
                  <div className="pm-manual-time-row" key={`${entry.key}-${timeIndex}`}>
                    <input
                      aria-label={`${tr('Reminder time', 'Oras ng paalala')} ${timeIndex + 1}`}
                      onChange={(event) =>
                        updateEntry(index, {
                          times: entry.times.map((value, itemIndex) =>
                            itemIndex === timeIndex ? event.target.value : value
                          ),
                        })
                      }
                      type="time"
                      value={selectedTime}
                    />
                    {entry.times.length > 1 && (
                      <button
                        aria-label={tr('Remove time', 'Alisin ang oras')}
                        onClick={() =>
                          updateEntry(index, {
                            times: entry.times.filter((_, itemIndex) => itemIndex !== timeIndex),
                          })
                        }
                        type="button"
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => updateEntry(index, { times: [...entry.times, '20:00'] })}
                  type="button"
                >
                  <Icon name="add" /> {tr('Add Another Time', 'Magdagdag ng Oras')}
                </button>
              </div>
            </fieldset>
          </article>
        ))}
      </div>
      <button className="pm-add-manual-medicine" onClick={addEntry} type="button">
        <Icon name="add" />{' '}
        {form.entries.length < meds.length
          ? tr('Add Another Medicine', 'Magdagdag ng Isa Pang Gamot')
          : tr('Add New Medicine', 'Magdagdag ng Bagong Gamot')}
      </button>
      <div className="pm-manual-date-range">
        <label>
          {tr('Start date', 'Petsa ng simula')}
          <input
            onChange={(event) => update('start', event.target.value)}
            type="date"
            value={form.start}
          />
        </label>
        <label>
          {tr('End date (optional)', 'Huling petsa (opsyonal)')}
          <input
            disabled={form.ongoing}
            min={form.start}
            onChange={(event) => update('end', event.target.value)}
            type="date"
            value={form.end}
          />
        </label>
      </div>
      <label className="pm-check-label">
        <input
          checked={form.ongoing}
          onChange={(event) => update('ongoing', event.target.checked)}
          type="checkbox"
        />{' '}
        {tr('Ongoing (no end date)', 'Tuloy-tuloy')}
      </label>
      <div className="pm-form-actions">
        <button className="pm-secondary-large" onClick={onBack} type="button">
          {tr('Cancel', 'Kanselahin')}
        </button>
        <button className="pm-primary-large" disabled={!canReview} onClick={onDone} type="button">
          <Icon name="calendar" /> {tr('Review Schedule', 'Suriin ang Iskedyul')}
        </button>
      </div>
    </section>
  );
}

function Dashboard({
  reminderDose,
  logBusy,
  meds,
  upcoming,
  missed,
  taken,
  onCalendar,
  onEdit,
  onHistory,
  onManageMedicine,
  onMark,
  onScan,
  onSnooze,
  tr,
}) {
  return (
    <section className="pm-med-dashboard-v2">
      {reminderDose && (
        <VoiceReminder
          dose={reminderDose}
          logBusy={logBusy}
          onMark={onMark}
          onScan={onScan}
          onSnooze={onSnooze}
          tr={tr}
        />
      )}

      <section className="pm-dashboard-schedule-tools">
        <button className="pm-edit-schedule-card" onClick={onEdit} type="button">
          <span>
            <Icon name="edit" size={28} />
          </span>
          <div>
            <strong>{tr('Edit Schedule', 'I-edit ang Iskedyul')}</strong>
            <small>
              {tr(
                'Add, delete, or update your medicines and schedules.',
                'Magdagdag, magtanggal, o mag-update ng iyong mga gamot at iskedyul.'
              )}
            </small>
          </div>
          <Icon name="arrow" size={26} />
        </button>
      </section>
      <DoseSection
        title={tr('Upcoming Doses', 'Paparating na Dose')}
        action={tr('View Calendar', 'Tingnan ang Kalendaryo')}
        onAction={onCalendar}
        onOpen={onManageMedicine}
        rows={upcoming.length ? upcoming : (meds || []).slice(0, 3)}
        status="upcoming"
        tr={tr}
      />
      {missed.length > 0 && (
        <DoseSection
          title={tr('Missed Doses', 'Mga Hindi Nainom')}
          action={tr('View History', 'Tingnan ang History')}
          onAction={() => onHistory('missed')}
          rows={missed}
          status="missed"
          tr={tr}
        />
      )}
      <DoseSection
        title={tr('Taken Doses', 'Mga Nainom')}
        action={tr('View History', 'Tingnan ang History')}
        onAction={() => onHistory('taken')}
        onOpen={onManageMedicine}
        rows={taken}
        status="taken"
        tr={tr}
      />
    </section>
  );
}

function VoiceReminder({ dose: next, logBusy, onMark, onScan, onSnooze, tr }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const dose = next?.dosage_instruction || next?.strength || '';
  const scheduledDate = new Date(next.scheduled_time);
  const hour = scheduledDate.getHours();
  const period =
    hour < 12 ? tr('Morning', 'Umaga') : hour < 18 ? tr('Afternoon', 'Hapon') : tr('Night', 'Gabi');
  const periodIcon = hour < 18 ? 'sun' : 'moon';
  const reminder = tr(
    `It’s time to take your ${medName(next)}${dose ? ` ${dose}` : ''}.`,
    `Oras na para inumin ang iyong ${medName(next)}${dose ? ` ${dose}` : ''}.`
  );
  const spokenReminder = `It is time to take your ${medName(next)}${dose ? ` ${dose}` : ''}.`;

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function playReminder() {
    const started = speak(spokenReminder, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
    if (started) setIsSpeaking(true);
  }

  return (
    <section className="pm-compact-reminder" aria-labelledby="voice-reminder-title">
      <header className="pm-compact-reminder__header">
        <h2 id="voice-reminder-title">{tr('Voice Reminder', 'Paalala sa Boses')}</h2>
        <span className={`pm-dose-period pm-dose-period--${periodIcon}`}>
          <Icon name={periodIcon} size={17} />
          {period}
        </span>
      </header>

      <div className="pm-compact-reminder__message">
        <button
          aria-label={tr('Play voice reminder', 'I-play ang paalala sa boses')}
          aria-pressed={isSpeaking}
          className={`pm-compact-reminder__voice ${isSpeaking ? 'is-speaking' : ''}`}
          onClick={playReminder}
          type="button"
        >
          <Icon name="volume" size={38} />
        </button>
        <div>
          <strong>
            <span aria-hidden="true">“</span>
            {reminder}
            <span aria-hidden="true">”</span>
          </strong>
          <small>
            {tr(
              'You can scan your medicine or mark it as taken.',
              'Maaari mong i-scan ang gamot o markahan itong nainom na.'
            )}
          </small>
        </div>
      </div>

      <div
        className={`pm-compact-reminder__wave ${isSpeaking ? 'is-speaking' : ''}`}
        aria-hidden="true"
      >
        {REMINDER_WAVE.map((height, index) => (
          <i key={index} style={{ '--wave-height': `${height}px`, height }} />
        ))}
      </div>

      <div className="pm-reminder-actions">
        <button className="pm-reminder-mark" disabled={logBusy} onClick={onMark} type="button">
          {logBusy ? tr('Saving…', 'Sine-save…') : tr('Mark as Taken', 'Markahan na Nainom')}
        </button>
        <button className="pm-reminder-scan" disabled={logBusy} onClick={onScan} type="button">
          <Icon name="scan" size={24} /> {tr('Scan Medicine', 'I-scan ang Gamot')}
        </button>
        <button className="pm-reminder-snooze" disabled={logBusy} onClick={onSnooze} type="button">
          <Icon name="clock" /> {tr('Snooze for 10 Minutes', 'I-snooze nang 10 Minuto')}
        </button>
      </div>
      <small className="pm-compact-reminder__hint">
        {tr('Scan the medicine for automatic log', 'I-scan ang gamot para awtomatikong maitala')}
      </small>
    </section>
  );
}

function MedicineScanner({
  busy,
  cameraInputRef,
  confidence,
  galleryInputRef,
  name,
  onChangeName,
  onChoosePhoto,
  onClose,
  onConfirm,
  onRetake,
  onVerify,
  photo,
  progress,
  result,
  tr,
}) {
  return (
    <div className="pm-scan-backdrop" role="presentation">
      <section
        aria-describedby="medicine-scan-help"
        aria-labelledby="medicine-scan-title"
        aria-modal="true"
        className="pm-scan-sheet pm-med-scanner"
        role="dialog"
      >
        <header className="pm-scan-sheet__header">
          <div>
            <h2 id="medicine-scan-title">
              {tr('Scan Medicine Label', 'I-scan ang Label ng Gamot')}
            </h2>
            <p id="medicine-scan-help">
              {tr(
                'Scan the text printed on your medicine. Keep the whole label inside the frame.',
                'I-scan ang text sa label ng iyong gamot. Ilagay ang buong label sa loob ng frame.'
              )}
            </p>
          </div>
          <button
            aria-label={tr('Close scanner', 'Isara ang scanner')}
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <input
          accept="image/*"
          capture="environment"
          hidden
          onChange={onChoosePhoto}
          ref={cameraInputRef}
          type="file"
        />
        <input accept="image/*" hidden onChange={onChoosePhoto} ref={galleryInputRef} type="file" />

        {!photo && (
          <div className="pm-scan-choices">
            <button onClick={() => cameraInputRef.current?.click()} type="button">
              <span>
                <Icon name="camera" />
              </span>
              <strong>{tr('Open Camera', 'Buksan ang Camera')}</strong>
              <small>{tr('Take a clear photo of the label', 'Kunan nang malinaw ang label')}</small>
            </button>
            <button onClick={() => galleryInputRef.current?.click()} type="button">
              <span>
                <Icon name="gallery" />
              </span>
              <strong>{tr('Choose a Photo', 'Pumili ng Larawan')}</strong>
              <small>
                {tr(
                  'Use a medicine-label photo from your device',
                  'Gumamit ng larawan mula sa device'
                )}
              </small>
            </button>
          </div>
        )}

        {photo && (
          <div className="pm-med-scan-review">
            <div className="pm-med-scan-preview">
              <img
                alt={tr(
                  'Medicine label selected for scanning',
                  'Label ng gamot na piniling i-scan'
                )}
                src={photo.url}
              />
              <i />
              <i />
              <i />
              <i />
              {busy && (
                <span className="pm-med-scan-reading">
                  {tr('Reading label', 'Binabasa ang label')}… {progress ? `${progress}%` : ''}
                </span>
              )}
            </div>

            {result?.match && (
              <div className="pm-med-scan-match" role="status">
                <span>
                  <Icon name="check" />
                </span>
                <div>
                  <small>{tr('Medicine detected:', 'Nakitang pangalan ng gamot:')}</small>
                  <strong>{result.drug_name}</strong>
                  <em>
                    <Icon name="shield" size={14} /> {tr('Correct medicine', 'Tamang gamot')}
                  </em>
                </div>
                <small>
                  {tr('Confidence', 'Kumpiyansa')}: {confidence || 99}%
                </small>
              </div>
            )}

            {result && !result.match && (
              <div className="pm-med-scan-warning" role="alert">
                <Icon name="info" />
                <span>
                  <strong>
                    {tr(
                      'We could not confirm this medicine.',
                      'Hindi namin makumpirma ang gamot na ito.'
                    )}
                  </strong>
                  <small>
                    {result.message ||
                      tr(
                        'Check the name below or take another photo.',
                        'Suriin ang pangalan sa ibaba o kumuha ulit ng larawan.'
                      )}
                  </small>
                </span>
              </div>
            )}

            {result?.match ? (
              <>
                <button
                  className="pm-med-scan-confirm"
                  disabled={busy}
                  onClick={onConfirm}
                  type="button"
                >
                  <Icon name="check" />{' '}
                  {busy
                    ? tr('Logging…', 'Itinatala…')
                    : tr('Confirm and Log', 'I-confirm at I-log')}
                </button>
                <button
                  className="pm-med-scan-cancel"
                  disabled={busy}
                  onClick={onClose}
                  type="button"
                >
                  {tr('Cancel', 'Kanselahin')}
                </button>
              </>
            ) : (
              <form className="pm-med-scan-manual" onSubmit={onVerify}>
                <div>
                  <Icon name="info" />
                  <span>
                    <strong>{tr('Can’t scan the medicine?', 'Hindi ma-scan ang gamot?')}</strong>
                    <small>
                      {tr(
                        'You can type the medicine name instead.',
                        'Maaari mong i-type ang pangalan ng gamot.'
                      )}
                    </small>
                  </span>
                </div>
                <label htmlFor="scanned-medicine-name">
                  {tr('Medicine name', 'Pangalan ng gamot')}
                </label>
                <input
                  disabled={busy}
                  id="scanned-medicine-name"
                  onChange={(event) => onChangeName(event.target.value)}
                  placeholder={tr('e.g., Paracetamol', 'hal., Paracetamol')}
                  value={name}
                />
                <button disabled={busy || !name.trim()} type="submit">
                  {busy
                    ? tr('Checking…', 'Sinusuri…')
                    : tr('Verify Medicine', 'I-verify ang Gamot')}
                </button>
              </form>
            )}

            <button className="pm-scan-retake" disabled={busy} onClick={onRetake} type="button">
              {tr('Scan another label', 'Mag-scan ng ibang label')}
            </button>
          </div>
        )}

        <p className="pm-med-scan-privacy">
          <Icon name="shield" size={16} />{' '}
          {tr('Your information is safe and private.', 'Ligtas at pribado ang iyong impormasyon.')}
        </p>
      </section>
    </div>
  );
}

function DoseSection({ title, action, onAction, onOpen, rows, status, tr }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, 2);
  return (
    <section className={`pm-dose-section ${status}`}>
      <div>
        <h2>{title}</h2>
        <button onClick={onAction} type="button">
          <Icon name={status === 'upcoming' ? 'calendar' : 'clock'} /> {action}
        </button>
      </div>
      {rows.length ? (
        <>
          <DoseRows dashboard onOpen={onOpen} rows={visibleRows} status={status} tr={tr} />
          {rows.length > 2 && (
            <button
              aria-expanded={expanded}
              className={`pm-dose-see-all ${expanded ? 'expanded' : ''}`}
              onClick={() => setExpanded((value) => !value)}
              type="button"
            >
              <span>
                {expanded
                  ? tr('Show less', 'Mas kaunti')
                  : tr(`See all ${rows.length} doses`, `Tingnan lahat ng ${rows.length} dose`)}
              </span>
              <Icon name="arrow" size={18} />
            </button>
          )}
        </>
      ) : (
        <p className="pm-dose-empty">{tr('No doses to show.', 'Walang dose na maipapakita.')}</p>
      )}
    </section>
  );
}

function ScheduleSaved({ saved, onDone, onView, tr }) {
  const rows = saved.rows || [];
  const medicineCount = new Set(rows.map((row) => row.medication_id || medName(row))).size;
  return (
    <div className="pm-schedule-saved-backdrop" role="presentation">
      <section
        aria-describedby="medication-schedule-saved-description"
        aria-labelledby="medication-schedule-saved-title"
        aria-modal="true"
        className="pm-schedule-saved-modal pm-flow-saved-modal"
        role="dialog"
      >
        <button
          aria-label={tr('Close', 'Isara')}
          className="pm-schedule-saved-close"
          onClick={onDone}
          type="button"
        >
          <Icon name="close" />
        </button>
        <div className="pm-schedule-saved-check">
          <Icon name="check" size={34} />
        </div>
        <h2 id="medication-schedule-saved-title">
          {tr('Schedule Saved!', 'Nai-save ang Iskedyul!')}
        </h2>
        <p id="medication-schedule-saved-description">
          {tr(
            'Your medicine schedule has been created successfully.',
            'Matagumpay na nagawa ang iskedyul ng iyong gamot.'
          )}
        </p>
        <dl className="pm-flow-saved-summary">
          <div>
            <Icon name={saved.source === 'manual' ? 'edit' : 'shield'} />
            <span>
              <dt>{tr('Schedule type', 'Uri ng iskedyul')}</dt>
              <dd>
                {saved.source === 'manual'
                  ? tr('Created Manually', 'Manu-manong Ginawa')
                  : tr('System Suggested', 'Mungkahi ng System')}
              </dd>
            </span>
          </div>
          <div>
            <Icon name="medicine" />
            <span>
              <dt>{tr('Medicines', 'Mga Gamot')}</dt>
              <dd>{medicineCount || 1}</dd>
            </span>
          </div>
          <div>
            <Icon name="clock" />
            <span>
              <dt>{tr('Reminder times', 'Mga oras ng paalala')}</dt>
              <dd>{rows.length || 1}</dd>
            </span>
          </div>
        </dl>
        <aside>
          <Icon name="info" />{' '}
          {tr(
            'You will receive voice reminders for your scheduled doses.',
            'Makakatanggap ka ng voice reminder para sa mga naka-iskedyul na dose.'
          )}
        </aside>
        <footer>
          <button onClick={onView} type="button">
            {tr('View Schedule', 'Tingnan ang Iskedyul')}
          </button>
          <button onClick={onDone} type="button">
            {tr('Done', 'Tapos')}
          </button>
        </footer>
      </section>
    </div>
  );
}

function MedicineActions({ dose, onClose, onDelete, onEdit, tr }) {
  return (
    <div className="pm-med-modal-backdrop" role="presentation">
      <section
        aria-labelledby="medicine-actions-title"
        aria-modal="true"
        className="pm-med-modal pm-medicine-actions-modal"
        role="dialog"
      >
        <header>
          <div>
            <small>{tr('Manage medicine', 'Pamahalaan ang gamot')}</small>
            <h2 id="medicine-actions-title">{medName(dose)}</h2>
          </div>
          <button aria-label={tr('Close', 'Isara')} onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </header>
        <dl>
          <div>
            <dt>{tr('Dose', 'Dose')}</dt>
            <dd>
              {dose.dosage_instruction ||
                dose.strength ||
                tr('Follow the medicine label', 'Sundin ang label ng gamot')}
            </dd>
          </div>
          {dose.scheduled_time && (
            <div>
              <dt>{tr('Reminder time', 'Oras ng paalala')}</dt>
              <dd>{time(dose.scheduled_time)}</dd>
            </div>
          )}
        </dl>
        <p>
          {tr(
            'Choose what you want to do with this medicine.',
            'Piliin kung ano ang gusto mong gawin sa gamot na ito.'
          )}
        </p>
        <button className="pm-medicine-action-edit" onClick={onEdit} type="button">
          <Icon name="edit" /> {tr('Edit Medicine', 'I-edit ang Gamot')}
        </button>
        <button className="pm-medicine-action-delete" onClick={onDelete} type="button">
          <Icon name="trash" /> {tr('Delete Medicine', 'Tanggalin ang Gamot')}
        </button>
        <button className="pm-medicine-action-cancel" onClick={onClose} type="button">
          {tr('Cancel', 'Kanselahin')}
        </button>
      </section>
    </div>
  );
}

function ConfirmTakenDose({ busy, dose, onCancel, onConfirm, onScan, tr }) {
  const dosage =
    dose?.dosage_instruction ||
    dose?.strength ||
    tr('Follow the prescribed dose', 'Sundin ang itinakdang dose');
  return (
    <div className="pm-med-modal-backdrop" role="presentation">
      <section
        aria-describedby="confirm-dose-description"
        aria-labelledby="confirm-dose-title"
        aria-modal="true"
        className="pm-med-modal pm-confirm-dose-modal"
        role="dialog"
      >
        <div className="pm-confirm-dose-icon">
          <Icon name="medicine" size={34} />
        </div>
        <h2 id="confirm-dose-title">
          {tr('Is this the correct medicine?', 'Ito ba ang tamang gamot?')}
        </h2>
        <p id="confirm-dose-description">
          {tr(
            'Check the medicine and dose before marking it as taken.',
            'Suriin ang gamot at dose bago ito markahan na nainom.'
          )}
        </p>
        <dl>
          <div>
            <dt>{tr('Medicine', 'Gamot')}</dt>
            <dd>{medName(dose)}</dd>
          </div>
          <div>
            <dt>{tr('Dose', 'Dose')}</dt>
            <dd>{dosage}</dd>
          </div>
          <div>
            <dt>{tr('Scheduled time', 'Oras ng iskedyul')}</dt>
            <dd>{time(dose.scheduled_time)}</dd>
          </div>
        </dl>
        <button
          className="pm-confirm-dose-primary"
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          <Icon name="check" />{' '}
          {busy ? tr('Logging…', 'Itinatala…') : tr('Yes, Mark as Taken', 'Oo, Markahan na Nainom')}
        </button>
        <button className="pm-confirm-dose-scan" disabled={busy} onClick={onScan} type="button">
          <Icon name="scan" /> {tr('Scan Medicine Instead', 'I-scan ang Gamot sa Halip')}
        </button>
        <button className="pm-confirm-dose-cancel" disabled={busy} onClick={onCancel} type="button">
          {tr('Cancel', 'Kanselahin')}
        </button>
      </section>
    </div>
  );
}

function History({ doses, type, onClose, tr }) {
  return (
    <div className="pm-med-modal-backdrop">
      <section className="pm-med-modal" role="dialog" aria-modal="true">
        <div className="pm-modal-title">
          <h2>
            {type === 'taken'
              ? tr('Taken Doses History', 'History ng Nainom')
              : tr('Missed Doses History', 'History ng Hindi Nainom')}
          </h2>
          <button onClick={onClose} aria-label={tr('Close', 'Isara')} type="button">
            <Icon name="close" />
          </button>
        </div>
        <aside className={`pm-history-message ${type}`}>
          <Icon name={type === 'taken' ? 'check' : 'info'} />
          <div>
            <strong>
              {type === 'taken'
                ? tr('Great job staying on track!', 'Mahusay ang iyong pagsunod!')
                : tr('It’s okay to miss sometimes.', 'Ayos lang kung minsan ay makaligtaan.')}
            </strong>
            <p>{tr('Here is your dose history.', 'Narito ang history ng iyong mga dose.')}</p>
          </div>
        </aside>
        <h3>{new Date().toLocaleDateString([], { month: 'long', year: 'numeric' })}</h3>
        {doses.length ? (
          <DoseRows rows={doses} status={type} tr={tr} />
        ) : (
          <p className="pm-dose-empty">{tr('No records yet.', 'Wala pang tala.')}</p>
        )}
      </section>
    </div>
  );
}
function statusForDate(doses, date) {
  const matching = doses.filter(
    (dose) =>
      dose.scheduled_time && new Date(dose.scheduled_time).toDateString() === date.toDateString()
  );
  if (!matching.length) return null;
  if (matching.some((dose) => dose.status === 'missed')) return 'missed';
  if (matching.some((dose) => ['scheduled', 'snoozed'].includes(dose.status))) return 'upcoming';
  if (matching.every((dose) => ['taken', 'taken_late'].includes(dose.status))) return 'taken';
  return null;
}

function Calendar({ selected, setSelected, doses, onClose, onAdd, tr }) {
  const start = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const pad = start.getDay();
  const total = new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate();
  const days = [...Array(pad).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const rows = doses.filter(
    (dose) =>
      dose.scheduled_time &&
      new Date(dose.scheduled_time).toDateString() === selected.toDateString()
  );
  const move = (amount) =>
    setSelected(new Date(selected.getFullYear(), selected.getMonth() + amount, 1));
  return (
    <div className="pm-med-modal-backdrop">
      <section className="pm-med-modal pm-calendar-modal" role="dialog" aria-modal="true">
        <div className="pm-modal-title">
          <h2>{tr('Calendar', 'Kalendaryo')}</h2>
          <button onClick={onClose} aria-label={tr('Close', 'Isara')} type="button">
            <Icon name="close" />
          </button>
        </div>
        <div className="pm-calendar-month">
          <button onClick={() => move(-1)} type="button">
            <Icon name="back" />
          </button>
          <h3>{selected.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h3>
          <button onClick={() => move(1)} type="button">
            <Icon name="arrow" />
          </button>
        </div>
        <div className="pm-calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <strong key={day}>{day}</strong>
          ))}
          {days.map((day, index) => {
            if (!day) return <span key={index} />;
            const date = new Date(selected.getFullYear(), selected.getMonth(), day);
            return (
              <button
                className={day === selected.getDate() ? 'selected' : ''}
                onClick={() => setSelected(date)}
                type="button"
                key={index}
              >
                <span>{day}</span>
              </button>
            );
          })}
        </div>
        <section className="pm-calendar-day-detail">
          <h3>
            {selected.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          {rows.length ? (
            <DoseRows
              rows={rows}
              showStatus={false}
              status={statusForDate(doses, selected) || 'upcoming'}
              tr={tr}
            />
          ) : (
            <>
              <p>
                {tr(
                  'No medicine is scheduled for this date.',
                  'Walang gamot na naka-iskedyul sa petsang ito.'
                )}
              </p>
              <Primary onClick={onAdd}>
                <Icon name="add" /> {tr('Add Schedule for This Date', 'Magdagdag ng Iskedyul')}
              </Primary>
            </>
          )}
        </section>
      </section>
    </div>
  );
}
function Success({ dose, onClose, tr }) {
  const dosage = dose?.dosage_instruction || dose?.strength || '';
  return (
    <div className="pm-log-success-backdrop" role="presentation">
      <section
        aria-describedby="med-log-description"
        aria-labelledby="med-log-title"
        aria-modal="true"
        className="pm-log-success-modal pm-med-log-success"
        role="dialog"
      >
        <div className="pm-log-success-confetti" aria-hidden="true">
          {[...Array(7)].map((_, index) => (
            <i key={index} />
          ))}
        </div>
        <div className="pm-log-success-check">
          <Icon name="check" size={42} />
        </div>
        <h2 id="med-log-title">{tr('Logged Successfully!', 'Matagumpay na Naitala!')}</h2>
        <p id="med-log-description">
          <strong>
            {medName(dose)}
            {dosage ? ` ${dosage}` : ''}
          </strong>{' '}
          {tr('has been marked as taken.', 'ay naitala bilang nainom na.')}
        </p>
        <dl className="pm-log-success-details">
          <div>
            <Icon name="calendar" />
            <span>
              <dt>{tr('Date', 'Petsa')}</dt>
              <dd>
                {new Date(dose.loggedAt).toLocaleDateString([], {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </dd>
            </span>
          </div>
          <div>
            <Icon name="clock" />
            <span>
              <dt>{tr('Time', 'Oras')}</dt>
              <dd>{time(dose.loggedAt)}</dd>
            </span>
          </div>
          <div>
            <Icon name="flame" />
            <span>
              <dt>{tr('Adherence Streak', 'Adherence Streak')}</dt>
              <dd>
                {dose.streakDays || 1} {tr('Days', 'Araw')}
              </dd>
            </span>
          </div>
        </dl>
        <div className="pm-log-success-encouragement">
          <span>
            <Icon name="flame" />
          </span>
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
        <button className="pm-log-success-done" onClick={onClose} type="button">
          {tr('Done', 'Tapos')}
        </button>
      </section>
    </div>
  );
}
