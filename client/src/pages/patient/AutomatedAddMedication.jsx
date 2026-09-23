import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/medication-corrections.css';
import { medicineIssues } from '../../lib/medicationGuidance.js';
import { scheduleFailure } from '../../lib/scheduleFailure.js';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  Info,
  LoaderCircle,
  Mic,
  Minus,
  Package,
  Pill,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

const DRAFT_KEY = 'pm_medication_setup_wizard_v3';
const FREQUENCIES = [
  ['QD', 'Once a day', 'Isang beses sa isang araw'],
  ['BID', 'Twice a day', 'Dalawang beses sa isang araw'],
  ['TID', 'Three times a day', 'Tatlong beses sa isang araw'],
  ['QID', 'Four times a day', 'Apat na beses sa isang araw'],
  ['Q4H', 'Every 4 hours', 'Bawat 4 na oras'],
  ['Q6H', 'Every 6 hours', 'Bawat 6 na oras'],
  ['Q8H', 'Every 8 hours', 'Bawat 8 oras'],
  ['Q12H', 'Every 12 hours', 'Bawat 12 oras'],
  ['OTHER', 'Every other day', 'Tuwing makalawang araw'],
  ['OTHER', 'Specific days of the week', 'Mga piling araw ng linggo'],
  ['PRN', 'As needed only', 'Kung kinakailangan lamang'],
  ['OTHER', 'Custom instructions', 'Ibang tagubilin'],
  ['UNKNOWN', "I'm not sure", 'Hindi ako sigurado'],
];
const FORMS = [
  'Tablet',
  'Capsule',
  'Liquid or syrup',
  'Injection',
  'Eye or ear drops',
  'Inhaler or spray',
  'Cream or ointment',
  'Powder',
  'Other',
];
const FOOD = [
  ['NONE', 'No food instruction shown', 'Walang tagubilin tungkol sa pagkain'],
  ['WITH_MEAL', 'Take with food', 'Inumin kasabay ng pagkain'],
  ['BEFORE_MEAL', 'Take before food', 'Inumin bago kumain'],
  ['AFTER_MEAL', 'Take after food', 'Inumin pagkatapos kumain'],
  ['EMPTY_STOMACH', 'Take on an empty stomach', 'Inumin nang walang laman ang tiyan'],
];
const PRESET_TIMES = [
  ['08:00', 'Morning'],
  ['08:30', 'Breakfast'],
  ['12:30', 'Lunch'],
  ['18:00', 'Evening'],
  ['21:30', 'Bedtime'],
];

function readDraft() {
  try {
    return (
      JSON.parse(sessionStorage.getItem(DRAFT_KEY) || localStorage.getItem(DRAFT_KEY) || 'null') ||
      {}
    );
  } catch {
    return {};
  }
}
function frequencyDetails(code) {
  const rules = {
    QD: ['ONCE_DAILY', 1],
    BID: ['TWICE_DAILY', 2],
    TID: ['THREE_TIMES_DAILY', 3],
    QID: ['SPECIFIC_TIMES', 4],
    Q4H: ['EVERY_N_HOURS', 6, 4],
    Q6H: ['EVERY_N_HOURS', 4, 6],
    Q8H: ['EVERY_N_HOURS', 3, 8],
    Q12H: ['EVERY_N_HOURS', 2, 12],
    PRN: ['AS_NEEDED', 0],
  };
  const [frequencyType, count, intervalHours = null] = rules[code] || [null, null, null];
  return { frequencyType, count, intervalHours };
}
function reminderTimesForFrequency(code, firstTime = '08:00') {
  const { count, intervalHours } = frequencyDetails(code);
  if (!Number.isInteger(count) || count < 1) return [firstTime];

  const [hour = 8, minute = 0] = String(firstTime).split(':').map(Number);
  const firstMinute = (Number(hour) * 60 + Number(minute)) % (24 * 60);
  const spacingMinutes = (intervalHours || 24 / count) * 60;
  return Array.from({ length: count }, (_, index) => {
    const total = Math.round((firstMinute + index * spacingMinutes) % (24 * 60));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  });
}
function today(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const tz = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tz).toISOString().slice(0, 10);
}
function nextSuggestedStartDate(startDate, times = [], now = new Date()) {
  const currentDate = today();
  const requestedDate = startDate || currentDate;
  if (requestedDate > currentDate) return requestedDate;
  if (requestedDate < currentDate) return currentDate;

  const hasUpcomingTime = times.some((value) => {
    const [hours, minutes] = String(value || '').split(':').map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return false;
    const candidate = new Date(now);
    candidate.setHours(hours, minutes, 0, 0);
    return candidate.getTime() > now.getTime();
  });
  return hasUpcomingTime ? currentDate : today(1);
}
function timeLabel(value) {
  return new Date(`2000-01-01T${value}:00`).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}
function formValue(label) {
  const value = label.toLowerCase();
  if (value.startsWith('liquid')) return 'Syrup';
  if (value.startsWith('eye')) return 'Eye drops';
  if (value.startsWith('inhaler')) return 'Inhaler';
  if (value.startsWith('cream')) return 'Topical';
  return label;
}
function unitFor(form, amount = 1) {
  const value = String(form || '').toLowerCase();
  const plural = Number(amount) !== 1;
  if (value.includes('tablet')) return plural ? 'tablets' : 'tablet';
  if (value.includes('capsule')) return plural ? 'capsules' : 'capsule';
  if (/syrup|liquid|solution|suspension/.test(value)) return 'mL';
  if (value.includes('drop')) return plural ? 'drops' : 'drop';
  if (value.includes('inhal')) return plural ? 'puffs' : 'puff';
  if (/cream|ointment|topical/.test(value)) return plural ? 'applications' : 'application';
  return plural ? 'doses' : 'dose';
}
function brandsFor(medicine) {
  try {
    const brands =
      typeof medicine?.brand_names_json === 'string'
        ? JSON.parse(medicine.brand_names_json)
        : medicine?.brand_names_json;
    return Array.isArray(brands) ? brands.filter(Boolean) : [];
  } catch {
    return [];
  }
}
function usesFor(medicine) {
  return [
    ...new Set(
      String(medicine?.common_uses || '')
        .split(/[;,|]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 5)
    ),
  ];
}
function endDateFor(start, duration, selectedEnd) {
  if (duration === 'END_DATE') return selectedEnd;
  const days = Number(duration);
  if (!Number.isFinite(days)) return '';
  const date = new Date(`${start}T00:00:00`);
  date.setDate(date.getDate() + days - 1);
  const tz = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tz).toISOString().slice(0, 10);
}

// A medicine can be present both in the saved draft list and as the active
// editor value after navigating back. A valid catalog selection is enough to
// retain it here; the detail form validates its required fields before setup
// can proceed. This prevents an active medicine from being dropped solely
// because a stale draft omitted a derived field.
function normalizeDraftMedicines(medicines = []) {
  const unique = new Map();
  for (const medicine of medicines) {
    const drugId = String(medicine?.id || '').trim();
    const name = String(medicine?.generic_name || medicine?.medicine_name || '').trim();
    if (!drugId || !name) continue;
    unique.delete(drugId);
    unique.set(drugId, medicine);
  }
  return [...unique.values()];
}

export default function AutomatedAddMedication() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const tr = (en, fil) => (language === 'fil' ? fil : en);
  const initial = useMemo(readDraft, []);
  const restoredPhase = String(initial.phase || 'questions').startsWith('suggested-')
    ? 'schedule-choice'
    : ['manual-first', 'manual-instructions'].includes(initial.phase)
      ? 'manual-dates'
      : initial.phase === 'manual-dose'
      ? 'manual-times'
      : initial.phase || 'questions';
  // Only the medicine, form, and strength are needed to set a reminder.
  // Old saved drafts are returned to the final supported question.
  const [step, setStep] = useState(Math.min(initial.step || 1, 3));
  const [durationPage, setDurationPage] = useState(Boolean(initial.durationPage));
  const [phase, setPhase] = useState(restoredPhase);
  const [query, setQuery] = useState(initial.query || '');
  const [results, setResults] = useState([]);
  const [medicine, setMedicine] = useState(initial.medicine || null);
  const [medicineList, setMedicineList] = useState(initial.medicineList || []);
  const [addingAnotherMedicine, setAddingAnotherMedicine] = useState(false);
  const [detailBackup, setDetailBackup] = useState(null);
  const [searching, setSearching] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [scheduleIssue, setScheduleIssue] = useState(null);
  const [correction, setCorrection] = useState(null);
  const [showIssues, setShowIssues] = useState(false);
  const validationLock = useRef(false);
  const [schedule, setSchedule] = useState(initial.schedule || null);
  const [source, setSource] = useState(initial.source || '');
  const [manualTimes, setManualTimes] = useState(initial.manualTimes || ['08:00']);
  const [editingMedicine, setEditingMedicine] = useState(initial.editingMedicine || null);
  const [returnToReview, setReturnToReview] = useState(Boolean(initial.returnToReview));
  const [medicineDates, setMedicineDates] = useState(initial.medicineDates || {});
  const [confirmed, setConfirmed] = useState(false);
  const [referenceConfirmed, setReferenceConfirmed] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [saved, setSaved] = useState(false);
  const saveLock = useRef(false);
  const resumedSafetyCheck = useRef(false);

  useEffect(() => {
    if (saved) return;
    const serializedDraft = JSON.stringify({
      step,
      durationPage,
      phase,
      query,
      medicine,
      medicineList,
      schedule,
      source,
      manualTimes,
      editingMedicine,
      returnToReview,
      medicineDates,
    });
    sessionStorage.setItem(DRAFT_KEY, serializedDraft);
    localStorage.setItem(DRAFT_KEY, serializedDraft);
  }, [
    durationPage,
    editingMedicine,
    manualTimes,
    medicine,
    medicineDates,
    medicineList,
    phase,
    query,
    saved,
    schedule,
    source,
    returnToReview,
    step,
  ]);
  useEffect(() => {
    const warn = (event) => {
      if (!saved && (medicine || query)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [medicine, query, saved]);
  useEffect(() => {
    if (step !== 1 || phase !== 'questions' || query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await api(`/api/medications/search?q=${encodeURIComponent(query.trim())}`);
        setResults(response.data);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [phase, query, step]);
  useEffect(() => {
    if (phase !== 'success') return undefined;
    const timer = setTimeout(
      () => navigate('/patient/medications?created=1', { replace: true }),
      1800
    );
    return () => clearTimeout(timer);
  }, [navigate, phase]);
  useEffect(() => {
    if (!confirmation) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [confirmation]);

  const update = (changes) => {
    if ('start_date' in changes || 'end_date' in changes || 'duration' in changes) {
      const key = String(medicine?._draftKey || medicine?.id || '');
      setMedicineDates((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([itemKey]) => itemKey !== key && itemKey !== String(medicine?.id || '')
          )
        )
      );
    }
    setMedicine((current) => ({ ...current, ...changes }));
    setError('');
  };
  // Retained for editing a legacy draft, but never shown in the streamlined
  // setup flow.
  const brands = brandsFor(medicine);
  const uses = usesFor(medicine);
  const selectedEndDate = endDateFor(medicine?.start_date, medicine?.duration, medicine?.end_date);
  const allMedicines = useMemo(() => {
    if (!medicine) return normalizeDraftMedicines(medicineList);
    const key = String(medicine._draftKey || medicine.id);
    return normalizeDraftMedicines([
      ...medicineList.filter((item) => String(item._draftKey || item.id) !== key),
      medicine,
    ]);
  }, [medicine, medicineList]);
  const intakes = useMemo(
    () =>
      allMedicines.map((item) => ({
        drug_id: item.id,
        rx_class: item.rx_class,
        draft_key: String(item._draftKey || item.id),
        medicine_name:
          item.brand_choice && !['GENERIC', 'UNKNOWN'].includes(item.brand_choice)
            ? item.brand_choice
            : item.generic_name,
        custom_strength: `${item.strength_value || ''} ${item.strength_unit || ''}`.trim(),
        dosage_form: item.patient_form || item.dosage_form,
        dosage_instruction: `${item.dose_amount || 1} ${unitFor(item.patient_form || item.dosage_form, item.dose_amount || 1)}`,
        quantity_on_hand: item.quantity_on_hand ?? 0,
        quantity_unit: unitFor(item.patient_form || item.dosage_form, 2),
        start_date: item.start_date,
        end_date: endDateFor(item.start_date, item.duration, item.end_date),
        label_direction: item.label_direction || item.custom_frequency || '',
        label_frequency: item.frequency_code === 'UNKNOWN' ? 'OTHER' : item.frequency_code,
        label_food_instruction: item.food_instruction || 'NONE',
        purpose: item.purpose || '',
        release_type_snapshot: item.release_choice || '',
        refill_reminders_enabled: Boolean(item.refill_reminders),
        first_dose_time: item.first_dose_time || '',
        frequency_type: frequencyDetails(item.frequency_code).frequencyType,
        interval_hours: frequencyDetails(item.frequency_code).intervalHours,
        frequency_source: 'PATIENT_SELECTED',
        entry_method: 'MANUAL',
        patient_confirmed: true,
      })),
    [allMedicines]
  );
  const intake =
    intakes.find((item) => item.draft_key === String(medicine?._draftKey || medicine?.id)) ||
    intakes[0] ||
    null;
  const request = useMemo(() => ({ medications: intakes }), [intakes]);
  const needsLabelConfirmation = Boolean(
    schedule?.requires_label_match || schedule?.requires_prescription_match
  );

  function chooseMedicine(drug) {
    const strength = String(drug.default_strength || '').match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
    setMedicine({
      ...drug,
      _draftKey: `${drug.id}-${Date.now()}`,
      patient_form: drug.dosage_form || '',
      strength_value: strength?.[1] || '',
      strength_unit: strength?.[2] || 'mg',
      brand_choice: 'GENERIC',
      purpose: '',
      frequency_code: '',
      custom_frequency: '',
      start_date: today(),
      duration: 'ONGOING',
      dose_amount: 1,
      quantity_on_hand: 0,
      food_instruction: 'NONE',
      first_dose_time: '08:00',
      refill_reminders: false,
      label_direction: '',
    });
    setQuery('');
    setResults([]);
    setError('');
    // A new setup must not silently reuse medicines from an abandoned browser
    // draft. The only way to build a multi-medicine schedule is the explicit
    // “Add another medicine” action from the review page.
    if (!addingAnotherMedicine) {
      setMedicineList([]);
      setMedicineDates({});
      setSchedule(null);
      setSource('');
    }
    setAddingAnotherMedicine(false);
    setStep(2);
  }
  function speechSearch() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError(
        tr(
          'Voice input is unavailable. Type the medicine name instead.',
          'Hindi available ang voice input. I-type ang pangalan ng gamot.'
        )
      );
      return;
    }
    const recognition = new Recognition();
    recognition.lang = language === 'fil' ? 'fil-PH' : 'en-PH';
    recognition.onresult = (event) => setQuery(event.results[0][0].transcript);
    recognition.onerror = () =>
      setError(
        tr(
          'The medicine name was not heard clearly.',
          'Hindi malinaw na narinig ang pangalan ng gamot.'
        )
      );
    recognition.start();
  }
  function discardSetupAndLeave() {
    const hasUnfinishedSetup =
      Boolean(medicine || query || medicineList.length || schedule?.schedule?.length);
    if (
      hasUnfinishedSetup &&
      !window.confirm(
        tr(
          'Go back and restart this schedule? Your unfinished medicine and reminder times will be removed.',
          'Bumalik at magsimulang muli? Aalisin ang hindi pa tapos na gamot at oras ng paalala.'
        )
      )
    )
      return;
    sessionStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_KEY);
    navigate('/patient/medications');
  }
  function back() {
    setError('');
    if (phase === 'success') return;
    if (phase === 'edit-details') {
      setMedicine(detailBackup);
      setPhase('review');
      return;
    }
    if (phase === 'review') {
      if (returnToReview) {
        setPhase('manual-times');
        return;
      }
      setPhase('schedule-choice');
      return;
    }
    if (phase === 'schedule-choice') {
      // Strength is the final required medicine-detail step in the simplified
      // senior flow. Returning from the method chooser reopens that step.
      setPhase('questions');
      setStep(3);
      setDurationPage(false);
      setSource('');
      return;
    }
    const manualQuestions = ['manual-frequency', 'manual-dates'];
    if (manualQuestions.includes(phase)) {
      const index = manualQuestions.indexOf(phase);
      if (index) setPhase(manualQuestions[index - 1]);
      else {
        setPhase('schedule-choice');
      }
      return;
    }
    if (phase === 'manual-times') {
      setPhase(schedule?.schedule?.length ? 'review' : 'manual-dates');
      return;
    }
    if (durationPage) {
      setDurationPage(false);
      return;
    }
    if (step > 1) {
      setStep(step - 1);
      return;
    }
    discardSetupAndLeave();
  }
  function next() {
    setError('');
    if (step === 3 && (!medicine.strength_value || !medicine.strength_unit))
      return setError(
        tr(
          'Enter the strength and unit shown on the label.',
          'Ilagay ang lakas at unit na nasa label.'
        )
      );
    if (step === 6 && !medicine.frequency_code)
      return setError(
        tr('Choose what the medicine label says.', 'Piliin ang nakasulat sa label ng gamot.')
      );
    if (
      step === 6 &&
      ['OTHER', 'UNKNOWN', 'PRN'].includes(medicine.frequency_code) &&
      !medicine.custom_frequency
    )
      return setError(
        tr(
          'Write the label instructions or choose “I’m not sure.”',
          'Isulat ang tagubilin sa label o piliin ang “Hindi ako sigurado.”'
        )
      );
    if (step === 7 && (!Number.isFinite(Number(medicine.dose_amount)) || medicine.dose_amount <= 0))
      return setError(tr('Choose a usable dose amount.', 'Pumili ng tamang dami ng dose.'));
    if (step === 8 && !durationPage) {
      setDurationPage(true);
      return;
    }
    if (step === 8 && durationPage && medicine.duration === 'END_DATE' && !medicine.end_date)
      return setError(tr('Choose the treatment end date.', 'Piliin ang petsa ng pagtatapos.'));
    if (correction && (step !== 8 || durationPage)) {
      const remaining = medicineIssues(medicine, selectedEndDate).filter(
        (issue) => issue.step === step
      );
      if (remaining.length) {
        setError(remaining[0].message);
        return;
      }
      setConfirmed(false);
      setPhase(correction.returnPhase);
      setCorrection(null);
      return;
    }
    if (step === 8 && durationPage) {
      setMedicineList(allMedicines);
      setConfirmed(false);
      setPhase('manual-first');
      return;
    }
    setStep((current) => Math.min(8, current + 1));
  }

  async function generate() {
    if (working) return;
    setWorking(true);
    setError('');
    setSource('suggested');
    try {
      if (!intakes.length) {
        setMedicine(null);
        setQuery('');
        setStep(1);
        setDurationPage(false);
        setPhase('questions');
        setError(tr('Select a medicine before creating a schedule.', 'Pumili muna ng gamot bago gumawa ng iskedyul.'));
        return;
      }
      const adaptiveRequest = { medications: intakes };
      const response = await api('/api/medications/generate-schedule', {
        method: 'POST',
        // Use approved catalog/prescription directions when they exist. The
        // reminder-only mode requires a patient-entered frequency and caused
        // otherwise eligible medicines to stop at “Tell PharMate how often”.
        body: { ...adaptiveRequest, schedule_mode: 'SUGGESTED' },
      });
      if (response.data?.can_save === false) {
        throw Object.assign(new Error('Please review the schedule details before continuing.'), {
          status: 409,
          body: response.data,
        });
      }
      const governedDirections = new Map([
        ...(response.data.schedule || []).flatMap((slot) =>
          slot.medicines.map((item) => [String(item.drug_id), item])
        ),
        ...(response.data.prn_trackers || []).map((item) => [String(item.drug_id), item]),
      ]);
      const suggestedTimesByMedicine = new Map();
      for (const slot of response.data.schedule || []) {
        for (const scheduled of slot.medicines || []) {
          const key = String(scheduled.drug_id);
          suggestedTimesByMedicine.set(key, [
            ...(suggestedTimesByMedicine.get(key) || []),
            slot.time,
          ]);
        }
      }
      // The proposal is shown before it is saved, so make its first displayed
      // day match the next reminder the server can create. A time that has
      // already passed today starts tomorrow instead of appearing as a dose
      // that would immediately become missed.
      const generatedAt = new Date();
      const suggestedMedicines = allMedicines.map((item) => {
        const start_date = nextSuggestedStartDate(
          item.start_date || today(),
          suggestedTimesByMedicine.get(String(item.id)) || [],
          generatedAt
        );
        const requestedEndDate = endDateFor(item.start_date, item.duration, item.end_date);
        return {
          ...item,
          frequency_code: governedDirections.get(String(item.id))?.frequency || item.frequency_code,
          label_direction:
            governedDirections.get(String(item.id))?.label_direction ||
            governedDirections.get(String(item.id))?.directions ||
            item.label_direction,
          start_date,
          // A single-day treatment chosen for today still gets one usable
          // future reminder when today's proposed time is already elapsed.
          end_date:
            item.duration === 'END_DATE' && requestedEndDate && requestedEndDate < start_date
              ? start_date
              : item.end_date,
          duration: item.duration || 'ONGOING',
          dose_amount: item.dose_amount || 1,
        };
      });
      const current = suggestedMedicines.find((item) => item._draftKey === medicine._draftKey);
      const dateMap = {};
      for (const item of suggestedMedicines)
        dateMap[String(item.id)] = treatmentDates(
          item.start_date,
          endDateFor(item.start_date, item.duration, item.end_date)
        );
      setMedicine(current);
      setMedicineList(suggestedMedicines);
      setMedicineDates(dateMap);
      setSchedule(response.data);
      setSource('suggested');
      setConfirmed(false);
      setReferenceConfirmed(false);
      setPhase('review');
    } catch (requestError) {
      const failure = scheduleFailure(requestError);
      const safetyProfileRequired =
        requestError.body?.missing_safety_profile_fields?.length > 0 ||
        requestError.body?.reason_codes?.some((code) =>
          ['SAFETY_PROFILE_REQUIRED', 'SAFETY_PROFILE_INCOMPLETE'].includes(code)
        );
      // Select the actual blocked medicine so correction and counseling actions
      // refer to the same record as the server error, not the last edited one.
      const blockedMedicine = allMedicines.find(
        (item) => String(item.id) === String(failure.drugId)
      );
      if (blockedMedicine) {
        setMedicineList(allMedicines);
        setMedicine(blockedMedicine);
      }
      setError(failure.message);
      // Keep routine setup failures in the form flow. The old full-page
      // Schedule Review warning made stale or malformed client drafts look
      // like a clinical scheduling failure.
      if (/select at least one medication/i.test(failure.message)) {
        setMedicine(null);
        setQuery('');
        setStep(1);
        setDurationPage(false);
        setPhase('questions');
      } else if (safetyProfileRequired) {
        setPhase('safety-needed');
      } else {
        setPhase('schedule-choice');
      }
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    const shouldResume = new URLSearchParams(window.location.search).get('resumeSafety') === '1';
    if (!shouldResume || resumedSafetyCheck.current) return;
    resumedSafetyCheck.current = true;
    generate();
    // This runs once after returning from the separate safety-profile page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function startManualQuestions() {
    setMedicineList(allMedicines);
    setSource('manual');
    setConfirmed(false);
    setError('');
    setDurationPage(false);
    setMedicine((current) => ({
      ...current,
      dose_amount: Number(current?.dose_amount) > 0 ? current.dose_amount : 1,
      food_instruction: current?.food_instruction || 'NONE',
    }));
    setPhase('manual-frequency');
  }
  function startManualTimeQuestions() {
    const dateMap = { ...medicineDates };
    for (const item of allMedicines) {
      const key = String(item.id);
      dateMap[key] = dateMap[key]?.length
        ? dateMap[key]
        : treatmentDates(item.start_date, endDateFor(item.start_date, item.duration, item.end_date));
    }
    setMedicineList(allMedicines);
    setMedicineDates(dateMap);
    setEditingMedicine({ drug_id: intake.drug_id, name: intake.medicine_name });
    setReturnToReview(false);
    setManualTimes(reminderTimesForFrequency(medicine.frequency_code, medicine.first_dose_time));
    setSchedule((current) => current || { schedule: [] });
    setSource('manual');
    setConfirmed(false);
    setError('');
    setPhase('manual-times');
  }
  function updateManualTreatmentDates(changes) {
    const nextMedicine = { ...medicine, ...changes };
    const nextEndDate = endDateFor(
      nextMedicine.start_date,
      nextMedicine.duration,
      nextMedicine.end_date
    );
    const key = String(nextMedicine.id);
    setMedicineDates((current) => ({
      ...current,
      [key]: treatmentDates(nextMedicine.start_date, nextEndDate),
    }));
    setMedicine((current) => ({ ...current, ...changes }));
    setError('');
  }
  function manualRows() {
    return [...new Set(manualTimes)].sort().map((time, index) => ({
      time,
      minute: Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)),
      dose: index + 1,
    }));
  }
  function requestConfirmation(title, message, onContinue) {
    setConfirmation({ title, message, onContinue });
  }
  function continueConfirmedAction() {
    const action = confirmation?.onContinue;
    setConfirmation(null);
    action?.();
  }
  function editMedicineTimes(item) {
    const medicineKey = String(item?.drug_id || item?.name || '');
    const selected = allMedicines.find(
      (candidate) => String(candidate.id) === String(item?.drug_id)
    );
    const times = (schedule?.schedule || [])
      .filter((slot) =>
        slot.medicines.some(
          (scheduled) => String(scheduled.drug_id || scheduled.name || '') === medicineKey
        )
      )
      .map((slot) => slot.time);
    if (selected) setMedicine(selected);
    setEditingMedicine(item || { drug_id: intake.drug_id, name: intake.medicine_name });
    setReturnToReview(true);
    setManualTimes(
      times.length
        ? [...new Set(times)].sort()
        : [selected?.first_dose_time || medicine?.first_dose_time || '08:00']
    );
    setPhase('manual-times');
  }
  function confirmEditMedicineTimes(item) {
    requestConfirmation(
      tr('Edit reminder times?', 'Baguhin ang oras ng paalala?'),
      tr(
        'You can change, add, or remove reminder times for this medicine. Continue?',
        'Maaari mong baguhin, idagdag, o alisin ang oras ng paalala para sa gamot na ito. Magpatuloy?'
      ),
      () => editMedicineTimes(item)
    );
  }
  function confirmEditMedicineDetails(item) {
    const selected =
      allMedicines.find(
        (candidate) =>
          String(candidate._draftKey || candidate.id) === String(item._draftKey || item.id)
      ) ||
      allMedicines.find((candidate) => String(candidate.id) === String(item.drug_id || item.id));
    if (!selected) return;
    requestConfirmation(
      tr('Edit this medicine?', 'Baguhin ang gamot na ito?'),
      tr(
        'All of its details will open together on one page. Continue?',
        'Magbubukas nang sabay sa isang pahina ang lahat ng detalye nito. Magpatuloy?'
      ),
      () => {
        setDetailBackup({ ...selected });
        setMedicine({ ...selected });
        setConfirmed(false);
        setPhase('edit-details');
      }
    );
  }
  function addAnotherMedicine() {
    requestConfirmation(
      tr('Add another medicine?', 'Magdagdag ng isa pang gamot?'),
      tr(
        'Your medicines and reminder times will remain in this draft. Continue?',
        'Mananatili sa draft na ito ang iyong mga gamot at oras ng paalala. Magpatuloy?'
      ),
      () => {
        setMedicineList(allMedicines);
        setAddingAnotherMedicine(true);
        setMedicine(null);
        setQuery('');
        setResults([]);
        setStep(1);
        setDurationPage(false);
        setPhase('questions');
        setConfirmed(false);
      }
    );
  }
  function saveMedicineDetails() {
    if (
      !medicine?.strength_value ||
      !medicine?.patient_form ||
      !medicine?.frequency_code ||
      !medicine?.start_date
    ) {
      setError(
        tr(
          'Please complete the highlighted medicine details before saving.',
          'Kumpletuhin ang mga kinakailangang detalye bago i-save.'
        )
      );
      return;
    }
    if (source === 'manual') {
      requestConfirmation(
        tr('Save medicine changes?', 'I-save ang pagbabago sa gamot?'),
        tr(
          'Your selected manual reminder times will stay the same. Continue?',
          'Mananatili ang pinili mong manwal na oras ng paalala. Magpatuloy?'
        ),
        () => {
          setMedicineList(allMedicines);
          setConfirmed(false);
          setError('');
          setPhase('review');
        }
      );
      return;
    }
    requestConfirmation(
      tr('Save medicine changes?', 'I-save ang pagbabago sa gamot?'),
      tr(
        'PharMate will create the suggested times again using these updated details. Continue?',
        'Gagawin muli ng PharMate ang mungkahing oras gamit ang binagong detalye. Magpatuloy?'
      ),
      generate
    );
  }
  async function applyEditedMedicineTimes() {
    if (validationLock.current) return;
    const detailsIssues = medicineIssues(medicine, selectedEndDate);
    if (detailsIssues.length) {
      setShowIssues(true);
      return;
    }
    validationLock.current = true;
    setWorking(true);
    setScheduleIssue(null);
    setError('');
    const frequency = frequencyDetails(medicine.frequency_code);
    try {
      // A manual schedule is the patient's chosen reminder layout. Do not
      // apply suggested-schedule frequency or spacing rules while they edit it.
      if (source !== 'manual') {
        await api('/api/medications/validate-schedule', {
          method: 'POST',
          body: {
            frequencyType: frequency.frequencyType,
            scheduleMode: 'SUGGESTED',
            frequencyCode: medicine.frequency_code,
            intervalHours: frequency.intervalHours,
            scheduleTimes: manualRows().map((row) => row.time),
            startDate: medicine.start_date,
            endDate: selectedEndDate || null,
          },
        });
      }
    } catch (requestError) {
      setScheduleIssue(requestError.body?.code || null);
      setError(requestError.body?.message || requestError.body?.error || requestError.message);
      return;
    } finally {
      validationLock.current = false;
      setWorking(false);
    }
    const medicineKey = String(editingMedicine?.drug_id || editingMedicine?.name || intake.drug_id);
    const groups = (schedule?.schedule || [])
      .map((slot) => ({
        ...slot,
        medicines: slot.medicines.filter(
          (item) => String(item.drug_id || item.name || '') !== medicineKey
        ),
      }))
      .filter((slot) => slot.medicines.length);
    const edited = {
      ...intake,
      ...editingMedicine,
      name: editingMedicine?.name || intake.medicine_name,
      strength: intake.custom_strength,
      form: intake.dosage_form,
      rationale: null,
    };
    for (const row of manualRows()) {
      const existing = groups.find((slot) => slot.time === row.time);
      if (existing) existing.medicines.push(edited);
      else groups.push({ time: row.time, medicines: [edited] });
    }
    groups.sort((left, right) => left.time.localeCompare(right.time));
    setSchedule((current) => ({ ...current, schedule: groups }));
    setSource('manual');
    setConfirmed(false);
    setError('');
    setPhase('review');
  }

  function askPharmacist() {
    const times = (schedule?.schedule || []).map((slot) => slot.time);
    const context = {
      topic: 'Medication Schedule Verification',
      draftKey: String(medicine?._draftKey || ''),
      medicationId: medicine?.id || null,
      question: `I am adding ${intake?.medicine_name || 'a medicine'} to my medication schedule.\n\nMy instructions are:\n${intake?.dosage_instruction || ''}${intake?.label_direction ? `; ${intake.label_direction}` : ''}\nFrequency: ${medicine?.frequency_code || 'not specified'}\n\nThe suggested schedule is:\n${times.length ? times.join('\n') : 'No exact reminder times have been confirmed yet.'}\n\nIs this schedule correct based on my medication instructions, or should the times be adjusted?`,
    };
    sessionStorage.setItem('pm_schedule_inquiry_draft', JSON.stringify(context));
    navigate('/patient/ask', { state: { medicationScheduleInquiry: context } });
  }
  function deleteScheduledMedicines(keys) {
    if (!keys.length) return;
    requestConfirmation(
      tr('Delete selected medicine?', 'Burahin ang napiling gamot?'),
      tr(
        'This removes the medicine and its reminder times from this draft schedule. Continue?',
        'Aalisin nito ang gamot at mga oras ng paalala mula sa draft na iskedyul. Magpatuloy?'
      ),
      () => {
        const removedKeys = new Set(keys.map(String));
        const removedIds = new Set(
          allMedicines
            .filter((item) => removedKeys.has(String(item._draftKey || item.id)))
            .map((item) => String(item.id))
        );
        const remaining = allMedicines.filter(
          (item) => !removedKeys.has(String(item._draftKey || item.id))
        );
        setMedicineList(remaining);
        setMedicine(remaining.at(-1) || null);
        setSchedule((current) => ({
          ...current,
          schedule: current.schedule
            .map((slot) => ({
              ...slot,
              medicines: slot.medicines.filter((item) => !removedIds.has(String(item.drug_id))),
            }))
            .filter((slot) => slot.medicines.length),
        }));
        setMedicineDates((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => !removedIds.has(key)))
        );
        setConfirmed(false);
      }
    );
  }
  async function saveSchedule() {
    if (!confirmed || working || saveLock.current) return;
    if (medicineIssues(medicine, selectedEndDate).length) {
      setShowIssues(true);
      return;
    }
    saveLock.current = true;
    setWorking(true);
    setError('');
    try {
      if (source === 'suggested') {
        await api('/api/medications/save-reminders', {
          method: 'POST',
          body: {
            ...request,
            schedule_mode: 'SUGGESTED',
            review_confirmed: true,
            reference_review_confirmed: needsLabelConfirmation ? referenceConfirmed : undefined,
            prescription_match_confirmed: needsLabelConfirmation ? referenceConfirmed : undefined,
          },
        });
      } else {
        const savedIntake = await api('/api/medications/save-intake', {
          method: 'POST',
          // A manual schedule is a patient-controlled reminder plan. Mark it
          // explicitly so the server does not apply suggested-schedule or
          // prescription-direction rules to the patient's chosen times.
          body: { ...request, schedule_mode: 'MANUAL' },
        });
        const medicationIds = savedIntake.data.medication_ids;
        const medicationIdByDrug = new Map(
          intakes.map((item, index) => [String(item.drug_id), medicationIds[index]])
        );
        const slots = [];
        for (const group of schedule?.schedule || []) {
          for (const scheduled of group.medicines) {
            const model = allMedicines.find(
              (item) => String(item.id) === String(scheduled.drug_id)
            );
            const medicationId = medicationIdByDrug.get(String(scheduled.drug_id));
            if (!model || !medicationId) continue;
            slots.push({
              medication_id: medicationId,
              minute: Number(group.time.slice(0, 2)) * 60 + Number(group.time.slice(3, 5)),
              dates:
                medicineDates[String(model.id)] ||
                treatmentDates(
                  model.start_date,
                  endDateFor(model.start_date, model.duration, model.end_date)
                ),
              generated_reason: 'Reminder time edited by patient',
            });
          }
        }
        await api('/api/patient/schedule/confirm', {
          method: 'POST',
          body: { source: 'manual', slots, medication_ids: medicationIds, review_confirmed: true },
        });
      }
      // The server save succeeded. Device preference failures must not invite
      // the patient to repeat a successfully completed server save.
      try {
        localStorage.removeItem('pm_schedule_hidden');
        localStorage.setItem('pm_has_medication_schedule', '1');
        localStorage.setItem('pm_medication_schedule_source', source);
        sessionStorage.setItem('pm_medicine_added_success', '1');
        sessionStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* A blocked device store does not undo the confirmed save. */
      }
      setSaved(true);
      setPhase('success');
    } catch (requestError) {
      setError(requestError.body?.error || requestError.message);
      saveLock.current = false;
    } finally {
      setWorking(false);
    }
  }
  function confirmAndSave() {
    if (!confirmed || working || saveLock.current) return;
    requestConfirmation(
      tr('Save this schedule?', 'I-save ang iskedyul na ito?'),
      tr(
        'Your medication reminders will begin on the selected start date. Continue?',
        'Magsisimula ang mga paalala ng gamot sa napiling petsa. Magpatuloy?'
      ),
      saveSchedule
    );
  }

  function reviewField(issue) {
    setCorrection({ ...issue, returnPhase: phase === 'manual-times' ? 'manual-times' : 'review' });
    setPhase('questions');
    setStep(issue.step);
    setDurationPage(false);
    setError('');
  }
  useEffect(() => {
    if (!correction || phase !== 'questions') return;
    const timer = window.setTimeout(() => {
      const target =
        document.querySelector(
          '.pm-wizard__question-card input, .pm-wizard__question-card select, .pm-wizard__question-card textarea'
        ) || document.getElementById('pm-guidance-correction');
      target?.scrollIntoView({ block: 'center', behavior: 'auto' });
      target?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [correction, phase, step]);
  const currentIssues = showIssues ? medicineIssues(medicine, selectedEndDate) : [];
  const questionTitle = [
    tr('What is the name of your medicine?', 'Ano ang pangalan ng iyong gamot?'),
    tr('What form is your medicine?', 'Anong uri ang iyong gamot?'),
    tr('What strength is shown on the label?', 'Anong lakas ang nakasulat sa label?'),
  ][step - 1];

  return (
    <main className="pm-auto-medication-page pm-wizard">
      <header
        className={`pm-auto-medication-header pm-wizard__header${
          phase === 'schedule-choice' ? ' pm-wizard__header--schedule-choice' : ''
        }`}
      >
        <button
          aria-label={tr('Back', 'Bumalik')}
          onClick={back}
          type="button"
        >
          <ArrowLeft />
        </button>
        <div>
          <h1>
            {phase === 'schedule-choice'
              ? tr('Medication Schedule', 'Iskedyul ng Gamot')
              : tr('Medication Setup', 'Pag-set Up ng Gamot')}
          </h1>
          {phase !== 'questions' && (
            <p>
              {phase === 'schedule-choice'
                ? tr('Choose how you’d like to set your reminder times.', 'Piliin kung paano mo itatakda ang oras ng paalala.')
                : source === 'manual'
                  ? tr('Manual schedule', 'Manwal na iskedyul')
                  : tr('PharMate suggested schedule', 'Mungkahing iskedyul ng PharMate')}
            </p>
          )}
        </div>
      </header>
      {correction && phase === 'questions' && (
        <aside id="pm-guidance-correction" className="pm-guidance-note" tabIndex={-1}>
          <strong>{correction.label}</strong>
          <p>{correction.message}</p>
          <p>Your other answers and reminder times are kept.</p>
          <button type="button" onClick={next}>
            Continue to review
          </button>
        </aside>
      )}
      {currentIssues.length > 0 && !['questions', 'schedule-choice'].includes(phase) && (
        <aside className="pm-guidance-note" role="alert">
          <strong>Please review these details</strong>
          {currentIssues.map((issue) => (
            <div key={issue.code}>
              <p>{issue.message}</p>
              <button type="button" onClick={() => reviewField(issue)}>
                {issue.label}
              </button>
            </div>
          ))}
        </aside>
      )}
      {phase === 'questions' && (
        <div
          aria-label={tr('Medication setup progress', 'Progreso ng pag-set up ng gamot')}
          aria-valuemax="3"
          aria-valuemin="1"
          aria-valuenow={step}
          className="pm-wizard__progress"
          role="progressbar"
        >
          <span style={{ width: `${step * (100 / 3)}%` }} />
        </div>
      )}

      {phase === 'questions' && (
        <section className="pm-wizard__card" aria-labelledby="wizard-title">
          <h2 id="wizard-title">{questionTitle}</h2>
          {step === 1 && (
            <>
              <p>
                {tr(
                  'Type the name shown on the medicine label.',
                  'I-type ang pangalang nasa label ng gamot.'
                )}
              </p>
              <div className={`pm-wizard__search${query ? ' has-query' : ''}`}>
                <Search />
                <input
                  autoFocus
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={tr('Medicine name', 'Pangalan ng gamot')}
                  value={query}
                />
                {query && (
                  <button
                    aria-label={tr('Clear medicine name', 'Burahin ang pangalan')}
                    onClick={() => setQuery('')}
                    type="button"
                  >
                    <X />
                  </button>
                )}
                <button
                  aria-label={tr('Use voice input', 'Gamitin ang boses')}
                  onClick={speechSearch}
                  type="button"
                >
                  <Mic />
                </button>
              </div>
              {searching && (
                <p className="pm-wizard__loading">
                  <LoaderCircle className="spin" />
                  {tr('Searching medicines…', 'Naghahanap ng gamot…')}
                </p>
              )}
              {results.length > 0 && (
                <div className="pm-wizard__choices">
                  {results.map((drug) => (
                    <button key={drug.id} onClick={() => chooseMedicine(drug)} type="button">
                      <strong>{drug.generic_name}</strong>
                      <ChevronRight />
                    </button>
                  ))}
                </div>
              )}
              <button
                className="pm-wizard__cannot-find"
                onClick={() =>
                  setError(
                    tr(
                      'This medicine must match PharMate’s pharmacy list. Check the spelling or ask a pharmacist.',
                      'Dapat tumugma ang gamot sa listahan ng PharMate. Suriin ang spelling o magtanong sa parmasyutiko.'
                    )
                  )
                }
                type="button"
              >
                {tr('I cannot find my medicine', 'Hindi ko makita ang aking gamot')}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <p>
                {tr('Choose what is written on the package.', 'Piliin ang nakasulat sa pakete.')}
              </p>
              <div className="pm-wizard__choices">
                {FORMS.map((form) => (
                  <button
                    className={medicine?.patient_form === formValue(form) ? 'selected' : ''}
                    key={form}
                    onClick={() => {
                      update({ patient_form: formValue(form) });
                      setStep(3);
                    }}
                    type="button"
                  >
                    <Package />
                    <strong>{form}</strong>
                    <ChevronRight />
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <p>
                {tr(
                  'Look for a number such as 500 mg, 10 mL, or 100 mcg.',
                  'Hanapin ang numerong gaya ng 500 mg, 10 mL, o 100 mcg.'
                )}
              </p>
              {medicine?.default_strength && (
                <button
                  className="pm-wizard__suggestion"
                  onClick={() => {
                    const match = String(medicine.default_strength).match(
                      /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/
                    );
                    update({ strength_value: match?.[1] || '', strength_unit: match?.[2] || 'mg' });
                  }}
                  type="button"
                >
                  {tr('Use listed strength:', 'Gamitin ang nakalistang lakas:')}{' '}
                  <strong>{medicine.default_strength}</strong>
                </button>
              )}
              <div className="pm-wizard__strength">
                <input
                  inputMode="decimal"
                  onChange={(event) => update({ strength_value: event.target.value })}
                  placeholder="500"
                  value={medicine?.strength_value || ''}
                />
                <select
                  onChange={(event) => update({ strength_unit: event.target.value })}
                  value={medicine?.strength_unit || 'mg'}
                >
                  <option>mg</option>
                  <option>mcg</option>
                  <option>g</option>
                  <option>mL</option>
                  <option>unit</option>
                  <option>IU</option>
                </select>
              </div>
              <button
                className="pm-wizard__unsure"
                onClick={() =>
                  setError(
                    tr(
                      'Check the medicine label or ask your pharmacist before continuing.',
                      'Suriin ang label o magtanong sa parmasyutiko bago magpatuloy.'
                    )
                  )
                }
                type="button"
              >
                {tr("I'm not sure", 'Hindi ako sigurado')}
              </button>
              <button
                className="pm-wizard__primary"
                onClick={() => {
                  if (!medicine?.strength_value) return next();
                  // Keep the intake short for seniors: the automatic engine
                  // derives a reviewable suggestion from the medicine and its
                  // saved routine, while manual setup asks for chosen times.
                  setError('');
                  setShowIssues(false);
                  setMedicineList(allMedicines);
                  setConfirmed(false);
                  setDurationPage(false);
                  setPhase('schedule-choice');
                }}
                type="button"
              >
                {tr('Next', 'Susunod')} <ChevronRight />
              </button>
            </>
          )}
          {step === 4 && (
            <>
              <p>
                {tr(
                  'This is optional. Choose only what appears on the label.',
                  'Opsyonal ito. Piliin lamang ang nasa label.'
                )}
              </p>
              <div className="pm-wizard__choices">
                <button
                  onClick={() => {
                    update({ brand_choice: 'GENERIC' });
                    setStep(5);
                  }}
                  type="button"
                >
                  <strong>
                    {tr('Keep the generic name', 'Panatilihin ang generic na pangalan')}
                  </strong>
                  <ChevronRight />
                </button>
                {brands.map((brand) => (
                  <button
                    key={brand}
                    onClick={() => {
                      update({ brand_choice: brand });
                      setStep(5);
                    }}
                    type="button"
                  >
                    <strong>{brand}</strong>
                    <ChevronRight />
                  </button>
                ))}
                {medicine?.release_type && (
                  <button
                    onClick={() => {
                      update({ release_choice: medicine.release_type });
                      setStep(5);
                    }}
                    type="button"
                  >
                    <strong>{medicine.release_type}</strong>
                    <ChevronRight />
                  </button>
                )}
                <button
                  onClick={() => {
                    update({ brand_choice: 'UNKNOWN' });
                    setStep(5);
                  }}
                  type="button"
                >
                  <strong>{tr("I'm not sure", 'Hindi ako sigurado')}</strong>
                  <ChevronRight />
                </button>
              </div>
              <button className="pm-wizard__skip" onClick={() => setStep(5)} type="button">
                {tr('Skip', 'Laktawan')}
              </button>
            </>
          )}
          {step === 5 && (
            <>
              <p>{tr('This question is optional.', 'Opsyonal ang tanong na ito.')}</p>
              <div className="pm-wizard__choices">
                {uses.map((use) => (
                  <button
                    key={use}
                    onClick={() => {
                      update({ purpose: use });
                      setStep(6);
                    }}
                    type="button"
                  >
                    <strong>{use}</strong>
                    <ChevronRight />
                  </button>
                ))}
                {[
                  tr('Other', 'Iba pa'),
                  tr("I don't know", 'Hindi ko alam'),
                  tr('Prefer not to say', 'Ayaw kong sabihin'),
                ].map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      update({ purpose: item });
                      setStep(6);
                    }}
                    type="button"
                  >
                    <strong>{item}</strong>
                    <ChevronRight />
                  </button>
                ))}
              </div>
              <button className="pm-wizard__skip" onClick={() => setStep(6)} type="button">
                {tr('Skip', 'Laktawan')}
              </button>
            </>
          )}
          {step === 6 && (
            <>
              <p>
                {tr(
                  'For example: once a day or twice a day. Choose what your label says.',
                  'Halimbawa: isang beses o dalawang beses sa isang araw. Piliin ang nasa label.'
                )}
              </p>
              <div className="pm-wizard__choices">
                {FREQUENCIES.map(([code, en, fil], index) => (
                  <button
                    className={medicine?.frequency_choice === index ? 'selected' : ''}
                    key={`${code}-${en}`}
                    onClick={() =>
                      update({
                        frequency_code: code,
                        frequency_choice: index,
                        custom_frequency: ['OTHER', 'UNKNOWN'].includes(code)
                          ? language === 'fil'
                            ? fil
                            : en
                          : '',
                      })
                    }
                    type="button"
                  >
                    <Clock3 />
                    <span>
                      <strong>{language === 'fil' ? fil : en}</strong>
                      {code.startsWith('Q') && code.endsWith('H') && (
                        <small>
                          {tr(
                            'Choose this only if it appears on your label.',
                            'Piliin lamang kung nasa label ito.'
                          )}
                        </small>
                      )}
                    </span>
                    {medicine?.frequency_choice === index && <Check />}
                  </button>
                ))}
              </div>
              {['OTHER', 'UNKNOWN', 'PRN'].includes(medicine?.frequency_code) && (
                <textarea
                  className="pm-wizard__textarea"
                  onChange={(event) => update({ custom_frequency: event.target.value })}
                  placeholder={
                    medicine?.frequency_code === 'PRN'
                      ? tr(
                          'Exact as-needed directions, including dose limits',
                          'Eksaktong tagubilin kapag kailangan, kasama ang limitasyon sa dose'
                        )
                      : tr('Write the label instructions', 'Isulat ang tagubilin sa label')
                  }
                  rows="3"
                  value={medicine?.custom_frequency || ''}
                />
              )}
              <button className="pm-wizard__primary" onClick={next} type="button">
                {tr('Next', 'Susunod')} <ChevronRight />
              </button>
            </>
          )}
          {step === 7 && (
            <>
              <div className="pm-wizard__counter">
                <button
                  aria-label={tr('Decrease amount', 'Bawasan')}
                  onClick={() =>
                    update({ dose_amount: Math.max(0.5, Number(medicine.dose_amount || 1) - 0.5) })
                  }
                  type="button"
                >
                  <Minus />
                </button>
                <strong>
                  {Number(medicine.dose_amount || 1)}{' '}
                  {unitFor(
                    medicine.patient_form || medicine.dosage_form,
                    Number(medicine.dose_amount || 1)
                  )}
                </strong>
                <button
                  aria-label={tr('Increase amount', 'Dagdagan')}
                  onClick={() => update({ dose_amount: Number(medicine.dose_amount || 1) + 0.5 })}
                  type="button"
                >
                  <Plus />
                </button>
              </div>
              <p>
                {tr(
                  'Check your medicine label and choose the amount shown.',
                  'Tingnan ang label ng gamot at piliin ang nakasulat na dami.'
                )}
              </p>
              <button className="pm-wizard__primary" onClick={next} type="button">
                {tr('Next', 'Susunod')} <ChevronRight />
              </button>
            </>
          )}
          {step === 8 && !durationPage && (
            <>
              <p>
                {tr(
                  'Choose when your reminders should begin.',
                  'Piliin kung kailan magsisimula ang mga paalala.'
                )}
              </p>
              <div className="pm-wizard__date-buttons">
                <button
                  className={medicine?.start_date === today() ? 'selected' : ''}
                  onClick={() => update({ start_date: today() })}
                  type="button"
                >
                  {tr('Today', 'Ngayon')}
                </button>
                <button
                  className={medicine?.start_date === today(1) ? 'selected' : ''}
                  onClick={() => update({ start_date: today(1) })}
                  type="button"
                >
                  {tr('Tomorrow', 'Bukas')}
                </button>
              </div>
              <input
                className="pm-wizard__date"
                min={today()}
                onChange={(event) => update({ start_date: event.target.value })}
                type="date"
                value={medicine?.start_date || today()}
              />
              <button className="pm-wizard__primary" onClick={next} type="button">
                {tr('Next', 'Susunod')} <ChevronRight />
              </button>
            </>
          )}
          {step === 8 && durationPage && (
            <>
              <p>
                {tr(
                  'Choose what matches the prescription or label.',
                  'Piliin ang naaayon sa reseta o label.'
                )}
              </p>
              <div className="pm-wizard__choices">
                {[
                  ['ONGOING', tr('Ongoing', 'Tuloy-tuloy')],
                  ['7', '7 days'],
                  ['14', '14 days'],
                  ['30', '30 days'],
                  ['END_DATE', tr('Choose an end date', 'Pumili ng petsa ng pagtatapos')],
                  ['UNKNOWN', tr("I'm not sure", 'Hindi ako sigurado')],
                ].map(([value, label]) => (
                  <button
                    className={medicine?.duration === value ? 'selected' : ''}
                    key={value}
                    onClick={() => update({ duration: value })}
                    type="button"
                  >
                    <strong>{label}</strong>
                    {medicine?.duration === value && <Check />}
                  </button>
                ))}
              </div>
              {medicine?.duration === 'END_DATE' && (
                <TreatmentEndDateCalendar
                  endDate={medicine?.end_date || ''}
                  onChange={(end_date) => update({ end_date })}
                  startDate={medicine.start_date}
                  tr={tr}
                />
              )}
              <button className="pm-wizard__primary" onClick={next} type="button">
                {tr('Next', 'Susunod')} <ChevronRight />
              </button>
            </>
          )}
          {error && (
            <div className="pm-wizard__error" role="alert">
              <Info />
              {error}
              <button onClick={() => setError('')} type="button">
                {tr('Try Again', 'Subukan Muli')}
              </button>
            </div>
          )}
        </section>
      )}

      {phase === 'schedule-choice' && (
        <WizardPage
          className="pm-wizard__schedule-choice pm-wizard__schedule-choice--redesign"
          title={null}
        >
          <article className="pm-wizard__method suggested">
            <span className="pm-wizard__method-icon" aria-hidden="true"><CalendarClock /></span>
            <div>
              <h3>
                {tr(
                  <>Use Suggested<br />Schedule</>,
                  <>Gamitin ang<br />Mungkahing Iskedyul</>
                )}
              </h3>
              <p>
                {tr(
                  'PharMate suggests reminder times based on your medication.',
                  'Magmumungkahi ang PharMate ng oras batay sa iyong gamot.'
                )}
              </p>
            </div>
            <button disabled={working} onClick={() => generate()} type="button">
              {working ? <LoaderCircle className="spin" /> : null}
              {tr('Review Suggested Times', 'Suriin ang Mungkahing Oras')} <ArrowRight />
            </button>
          </article>
          <article className="pm-wizard__method manual">
            <span className="pm-wizard__method-icon" aria-hidden="true"><Clock3 /></span>
            <div>
              <h3>
                {tr(
                  <>Create My Own<br />Schedule</>,
                  <>Gumawa ng Sarili<br />Kong Iskedyul</>
                )}
              </h3>
              <p>
                {tr(
                  'Choose the days and times that work for you.',
                  'Piliin ang mga araw at oras na angkop sa iyo.'
                )}
              </p>
            </div>
            <button disabled={working} onClick={startManualQuestions} type="button">
              {tr('Set Schedule', 'Itakda ang Iskedyul')} <ArrowRight />
            </button>
          </article>
          {error && (
            <div className="pm-wizard__error" role="alert">
              <Info />
              {error}
            </div>
          )}
        </WizardPage>
      )}

      {phase === 'safety-needed' && (
        <WizardPage
          className="pm-wizard__suggested-unavailable"
          title={tr('Complete your safety profile', 'Kumpletuhin ang safety profile')}
        >
          <div className="pm-wizard__generation-error" role="status">
            <Info />
            <div>
              <h3>{tr('One-time health questions', 'Isang beses na health questions')}</h3>
              <p>{error}</p>
              <button
                onClick={() => navigate('/patient/onboarding?return=medication-setup')}
                type="button"
              >
                {tr('Complete Safety Profile', 'Kumpletuhin ang Safety Profile')}
              </button>
              <button onClick={() => setPhase('schedule-choice')} type="button">
                {tr('Go Back', 'Bumalik')}
              </button>
            </div>
          </div>
        </WizardPage>
      )}

      {phase === 'manual-first' && (
        <WizardPage
          title={tr(
            'When would you like to take your first dose?',
            'Kailan mo gustong inumin ang unang dose?'
          )}
        >
          <p>
            {tr(
              'This will be your first reminder time. You can add more times before saving.',
              'Ito ang magiging unang oras ng paalala. Maaari kang magdagdag pa bago i-save.'
            )}
          </p>
          <div className="pm-wizard__presets">
            {PRESET_TIMES.map(([value, label]) => (
              <button
                className={medicine.first_dose_time === value ? 'selected' : ''}
                key={label}
                onClick={() => update({ first_dose_time: value })}
                type="button"
              >
                <strong>{label}</strong>
                <small>{timeLabel(value)}</small>
              </button>
            ))}
          </div>
          <div className="pm-wizard__first-dose-picker">
            <span>{tr('Exact time', 'Eksaktong oras')}</span>
            <FriendlyTimePicker
              onChange={(value) => update({ first_dose_time: value })}
              tr={tr}
              value={medicine.first_dose_time}
            />
          </div>
          <BottomNext onClick={() => setPhase('manual-instructions')} tr={tr} />
        </WizardPage>
      )}
      {phase === 'manual-frequency' && (
        <WizardPage title={tr('How often do you take this medicine?', 'Gaano kadalas mo iniinom ang gamot na ito?')}>
          <p>{tr('Choose the hours or frequency written on your medicine label.', 'Piliin ang oras o dalas na nakasulat sa label ng gamot.')}</p>
          <div className="pm-wizard__choices">
            {FREQUENCIES.map(([code, en, fil], index) => (
              <button
                className={medicine?.frequency_choice === index ? 'selected' : ''}
                key={`${code}-${en}`}
                onClick={() => update({ frequency_code: code, frequency_choice: index, custom_frequency: ['OTHER', 'UNKNOWN'].includes(code) ? (language === 'fil' ? fil : en) : '' })}
                type="button"
              >
                <Clock3 />
                <strong>{language === 'fil' ? fil : en}</strong>
                {medicine?.frequency_choice === index && <Check />}
              </button>
            ))}
          </div>
          <BottomNext
            onClick={() => {
              if (!medicine?.frequency_code) {
                setError(tr('Choose how often you take this medicine.', 'Piliin kung gaano kadalas iniinom ang gamot.'));
                return;
              }
              const key = String(medicine.id);
              setMedicineDates((current) => ({
                ...current,
                [key]: treatmentDates(medicine.start_date, selectedEndDate),
              }));
              setPhase('manual-dates');
            }}
            tr={tr}
          />
        </WizardPage>
      )}
      {phase === 'manual-dates' && (
        <WizardPage title={tr('Which dates should have reminders?', 'Aling mga petsa ang may paalala?')}>
          <p>{tr('Your reminder dates are generated from this start and end date. You can still select specific days below.', 'Awtomatikong ginagawa ang mga petsa ng paalala mula sa simula at huling petsa. Maaari ka pa ring pumili ng partikular na araw sa ibaba.')}</p>
          <div className="pm-wizard__manual-date-range">
            <label>
              <span>{tr('Start date', 'Petsa ng simula')}</span>
              <input
                min={today()}
                onChange={(event) =>
                  updateManualTreatmentDates({ start_date: event.target.value })
                }
                type="date"
                value={medicine?.start_date || today()}
              />
            </label>
            <label>
              <span>{tr('End date', 'Petsa ng pagtatapos')}</span>
              <select
                onChange={(event) => {
                  const duration = event.target.value;
                  updateManualTreatmentDates({
                    duration,
                    end_date:
                      duration === 'END_DATE'
                        ? medicine?.end_date || medicine?.start_date || today()
                        : '',
                  });
                }}
                value={medicine?.duration || 'ONGOING'}
              >
                <option value="ONGOING">{tr('Ongoing (no end date)', 'Tuloy-tuloy (walang huling petsa)')}</option>
                <option value="7">{tr('After 7 days', 'Pagkatapos ng 7 araw')}</option>
                <option value="14">{tr('After 14 days', 'Pagkatapos ng 14 araw')}</option>
                <option value="30">{tr('After 30 days', 'Pagkatapos ng 30 araw')}</option>
                <option value="END_DATE">{tr('Choose a date', 'Pumili ng petsa')}</option>
              </select>
              {medicine?.duration === 'END_DATE' && (
                <input
                  min={medicine?.start_date || today()}
                  onChange={(event) => updateManualTreatmentDates({ end_date: event.target.value })}
                  type="date"
                  value={medicine?.end_date || medicine?.start_date || today()}
                />
              )}
            </label>
          </div>
          <MedicineDayEditor
            allowAnyDate={!selectedEndDate}
            allDates={treatmentDates(medicine.start_date, selectedEndDate)}
            onChange={(dates) => setMedicineDates((current) => ({ ...current, [String(medicine.id)]: dates }))}
            selectedDates={medicineDates[String(medicine.id)] || [medicine.start_date]}
            tr={tr}
          />
          <BottomNext onClick={startManualTimeQuestions} tr={tr} />
        </WizardPage>
      )}
      {phase === 'manual-instructions' && (
        <WizardPage
          title={tr(
            'Are there other instructions on the label?',
            'May iba pa bang tagubilin sa label?'
          )}
        >
          <textarea
            className="pm-wizard__textarea"
            onChange={(event) => update({ label_direction: event.target.value })}
            placeholder={tr('Optional label instructions', 'Opsyonal na tagubilin sa label')}
            rows="5"
            value={medicine.label_direction}
          />
          <button
            className="pm-wizard__skip"
            disabled={working}
            onClick={startManualTimeQuestions}
            type="button"
          >
            {tr('Skip', 'Laktawan')}
          </button>
          <button
            className="pm-wizard__primary"
            disabled={working}
            onClick={startManualTimeQuestions}
            type="button"
          >
            <Clock3 />
            {tr('Choose Reminder Times', 'Pumili ng Oras ng Paalala')}
          </button>
          {error && (
            <GenerationError
              error={error}
              onCheck={() => {
                setPhase('questions');
                setStep(6);
              }}
              onEdit={() =>
                confirmEditMedicineTimes({ drug_id: intake.drug_id, name: intake.medicine_name })
              }
              onAsk={askPharmacist}
              tr={tr}
            />
          )}
        </WizardPage>
      )}
      {phase === 'edit-details' && (
        <MedicineDetailsPanel
          error={error}
          medicine={medicine}
          onCancel={() =>
            requestConfirmation(
              tr('Cancel editing?', 'Kanselahin ang pag-edit?'),
              tr(
                'Your changes will not be saved. Continue?',
                'Hindi mase-save ang iyong mga pagbabago. Magpatuloy?'
              ),
              () => {
                setMedicine(detailBackup);
                setError('');
                setPhase('review');
              }
            )
          }
          onChange={update}
          onSave={saveMedicineDetails}
          tr={tr}
        />
      )}
      {phase === 'manual-times' && <MedicineEditSummary medicine={medicine} tr={tr} />}
      {phase === 'manual-times' && (
        <WizardPage
          className="pm-wizard__time-editor"
          title={tr(
            `Edit ${editingMedicine?.name || intake.medicine_name} times`,
            `Baguhin ang oras ng ${editingMedicine?.name || intake.medicine_name}`
          )}
        >
          <p className="pm-wizard__time-help">
            {tr(
              'Choose the dates and reminder times below.',
              'Piliin ang mga petsa at oras ng paalala sa ibaba.'
            )}
          </p>
          <MedicineDayEditor
            allowAnyDate={!selectedEndDate}
            allDates={treatmentDates(medicine.start_date, selectedEndDate)}
            onChange={(dates) =>
              setMedicineDates((current) => ({ ...current, [String(medicine.id)]: dates }))
            }
            selectedDates={medicineDates[String(medicine.id)] || [medicine.start_date]}
            tr={tr}
          />
          <section
            id="pm-edit-times"
            tabIndex={-1}
            aria-invalid={[
              'FREQUENCY_TIME_COUNT_MISMATCH',
              'INVALID_OR_DUPLICATE_TIME',
              'AS_NEEDED_HAS_FIXED_TIMES',
            ].includes(scheduleIssue)}
            aria-describedby={scheduleIssue ? 'pm-schedule-error' : undefined}
            className="pm-wizard__time-list pm-correction-target"
          >
            <header>
              <h3>{tr('Choose reminder times', 'Piliin ang mga oras')}</h3>
              <span>{manualTimes.length}</span>
            </header>
            {manualTimes.map((time, index) => (
              <div className="pm-wizard__time-row" key={`${time}-${index}`}>
                <FriendlyTimePicker
                  onChange={(value) =>
                    setManualTimes((times) =>
                      times.map((item, itemIndex) => (itemIndex === index ? value : item))
                    )
                  }
                  tr={tr}
                  value={time}
                />
                <button
                  aria-label={tr('Delete this reminder time', 'Burahin ang oras na ito')}
                  disabled={manualTimes.length === 1}
                  onClick={() =>
                    requestConfirmation(
                      tr('Delete this reminder time?', 'Burahin ang oras ng paalala?'),
                      tr(
                        'This reminder time will be removed from the medicine. Continue?',
                        'Aalisin ang oras ng paalala sa gamot. Magpatuloy?'
                      ),
                      () =>
                        setManualTimes((times) =>
                          times.filter((_, itemIndex) => itemIndex !== index)
                        )
                    )
                  }
                  type="button"
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </section>
          <button
            className="pm-wizard__add-time"
            onClick={() => {
              const maximum = frequencyDetails(medicine.frequency_code).count;
              if (
                source !== 'manual' &&
                Number.isInteger(maximum) &&
                manualTimes.length >= maximum
              ) {
                setError(
                  maximum === 1
                    ? tr(
                        'This medication is set to once daily. Only one scheduled time can be added.',
                        'Isang beses lang kada araw ang gamot na ito.'
                      )
                    : tr(
                        `This frequency allows ${maximum} scheduled times per day.`,
                        `Hanggang ${maximum} oras lamang kada araw.`
                      )
                );
                return;
              }
              setManualTimes((times) => [...times, '12:00']);
            }}
            type="button"
          >
            <Plus />
            {tr('Add another time', 'Magdagdag ng oras')}
          </button>
          {error && (
            <div id="pm-schedule-error" className="pm-wizard__error" role="alert">
              <Info />
              {scheduleIssue === 'FREQUENCY_TIME_COUNT_MISMATCH' ? (
                <div>
                  <strong>
                    {tr(
                      'Your reminder times do not match the saved directions',
                      'Hindi tugma ang oras sa naka-save na tagubilin'
                    )}
                  </strong>
                  <p>
                    {tr(
                      'Review the label and your reminder times. Do not add doses just to clear this message. If the label says “as needed” or “while awake,” ask your pharmacist to review it.',
                      'Suriin ang label at oras. Huwag magdagdag ng dose para lang mawala ang mensahe. Ipasuri sa parmasyutiko kung hindi malinaw.'
                    )}
                  </p>
                  <button type="button" onClick={askPharmacist}>
                    {tr(
                      'Review directions with pharmacist',
                      'Ipasuri ang tagubilin sa parmasyutiko'
                    )}
                  </button>
                </div>
              ) : (
                error
              )}
              {scheduleIssue && (
                <button
                  type="button"
                  onClick={() => {
                    if (scheduleIssue === 'INVALID_DATE_RANGE') {
                      reviewField({
                        step: 8,
                        label: 'Choose dates',
                        message: 'Review the treatment start and end dates.',
                      });
                      return;
                    }
                    if (['UNSUPPORTED_FREQUENCY', 'INVALID_INTERVAL'].includes(scheduleIssue)) {
                      askPharmacist();
                      return;
                    }
                    const target = document.getElementById(
                      scheduleIssue === 'INVALID_DATE_RANGE' ? 'pm-edit-dates' : 'pm-edit-times'
                    );
                    target?.scrollIntoView({
                      block: 'center',
                      behavior:
                        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
                        document.body.classList.contains('pm-a11y-reduce-motion')
                          ? 'auto'
                          : 'smooth',
                    });
                    target?.focus({ preventScroll: true });
                  }}
                >
                  {scheduleIssue === 'INVALID_DATE_RANGE'
                    ? tr('Choose dates', 'Piliin ang mga petsa')
                    : ['UNSUPPORTED_FREQUENCY', 'INVALID_INTERVAL'].includes(scheduleIssue)
                      ? tr(
                          'Ask pharmacist to review directions',
                          'Ipasuri ang tagubilin sa parmasyutiko'
                        )
                      : tr('Review reminder times', 'Suriin ang mga oras ng paalala')}
                </button>
              )}
            </div>
          )}
          <div className="pm-wizard__edit-actions">
            <button
              className="cancel"
              onClick={() =>
                requestConfirmation(
                  tr('Cancel editing?', 'Kanselahin ang pag-edit?'),
                  tr(
                    'The changes on this page will not be applied. Continue?',
                    'Hindi ilalapat ang mga pagbabago sa pahinang ito. Magpatuloy?'
                  ),
                  () => setPhase(schedule?.schedule?.length ? 'review' : 'manual-instructions')
                )
              }
              type="button"
            >
              {tr('Cancel', 'Kanselahin')}
            </button>
            <button
              className="apply"
              disabled={working}
              onClick={() =>
                requestConfirmation(
                  tr('Apply these changes?', 'Ilapat ang mga pagbabagong ito?'),
                  tr(
                    'The edited times and days will replace this medicine’s current reminders. Continue?',
                    'Papalitan ng binagong oras at araw ang kasalukuyang mga paalala ng gamot. Magpatuloy?'
                  ),
                  applyEditedMedicineTimes
                )
              }
              type="button"
            >
              {working ? <LoaderCircle className="spin" /> : <Check />}
              {tr('Apply Changes', 'Ilapat')}
            </button>
          </div>
        </WizardPage>
      )}

      {phase === 'review' && (
        <WizardPage
          className="pm-wizard__review-page"
          title={
            source === 'suggested'
              ? tr('Your Suggested Schedule', 'Iyong Mungkahing Iskedyul')
              : tr('Review your schedule', 'Suriin ang iyong iskedyul')
          }
        >
          {source === 'suggested' && (
            <aside
              className={
                needsLabelConfirmation
                  ? 'pm-wizard__warning pm-wizard__reference-warning'
                  : 'pm-wizard__checked'
              }
            >
              {needsLabelConfirmation ? <Info /> : <ShieldCheck />}
              <div>
                <strong>
                  {needsLabelConfirmation
                    ? tr('Reference Schedule — Review Required', 'Batayang Iskedyul — Suriin Muna')
                    : tr('Suggested by PharMate', 'Mungkahi ng PharMate')}
                </strong>
                <span>
                  {needsLabelConfirmation
                    ? tr(
                        'Not pharmacist verified. It must match the exact medicine label.',
                        'Hindi ito beripikado ng parmasyutiko. Dapat tugma ito sa eksaktong label ng gamot.'
                      )
                    : tr('Check the times before saving.', 'Suriin ang mga oras bago i-save.')}
                </span>
                {needsLabelConfirmation && schedule?.rule_provenance?.[0]?.evidence_source_url && (
                  <a
                    href={schedule.rule_provenance[0].evidence_source_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {tr('View official reference', 'Tingnan ang opisyal na sanggunian')}
                  </a>
                )}
              </div>
            </aside>
          )}
          {schedule?.prn_trackers?.length > 0 && (
            <aside className="pm-wizard__warning pm-wizard__prn-guide">
              <Info />
              <div>
                <strong>
                  {tr(
                    'Take only when needed',
                    'Inumin lamang kapag kailangan'
                  )}
                </strong>
                {schedule.prn_trackers.map((tracker) => (
                  <div className="pm-wizard__prn-item" key={tracker.drug_id}>
                    <b>{tracker.name}</b>
                    <span>
                      {tracker.directions ||
                        tr('Use as directed on the label.', 'Gamitin ayon sa label.')}
                    </span>
                    <span>
                      {tracker.min_interval_hours
                        ? tr(
                            `Wait at least ${tracker.min_interval_hours} hours before another dose.`,
                            `Maghintay nang hindi bababa sa ${tracker.min_interval_hours} oras bago ang susunod na dose.`
                          )
                        : tr(
                            'Follow the time instructions on the label.',
                            'Sundin ang oras na nakasaad sa label.'
                          )}
                    </span>
                  </div>
                ))}
                <small>
                  {tr(
                    'No daily alarm will be set for this medicine.',
                    'Walang araw-araw na alarm para sa gamot na ito.'
                  )}
                </small>
              </div>
            </aside>
          )}
          <MedicineScheduleEditors
            intakes={intakes}
            language={language}
            medicineDates={medicineDates}
            medicines={allMedicines}
            onDelete={deleteScheduledMedicines}
            onEditDetails={confirmEditMedicineDetails}
            onEditTimes={confirmEditMedicineTimes}
            schedule={schedule?.schedule || []}
            source={source}
            tr={tr}
          />
          {(schedule?.schedule?.length > 0 || schedule?.prn_trackers?.length > 0) && (
            <>
              {needsLabelConfirmation && (
                <label className="pm-wizard__confirm pm-wizard__reference-confirm">
                  <input
                    checked={referenceConfirmed}
                    onChange={(event) => setReferenceConfirmed(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    {tr(
                      'This matches the exact medicine label.',
                      'Tugma ito sa eksaktong label ng gamot.'
                    )}
                  </span>
                </label>
              )}
              <label className="pm-wizard__confirm">
                <input
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  {tr('The medicine and times are correct.', 'Tama ang gamot at mga oras.')}
                </span>
              </label>
              {error && (
                <div className="pm-wizard__error" role="alert">
                  <Info />
                  {error}
                  <button onClick={confirmAndSave} type="button">
                    {tr('Try Again', 'Subukan Muli')}
                  </button>
                </div>
              )}
              <button
                className="pm-wizard__primary"
                disabled={!confirmed || working || (needsLabelConfirmation && !referenceConfirmed)}
                onClick={confirmAndSave}
                type="button"
              >
                {working ? <LoaderCircle className="spin" /> : <CheckCircle2 />}
                {working
                  ? tr('Saving…', 'Nagse-save…')
                  : schedule?.schedule?.length
                    ? tr('Confirm & Save Schedule', 'Kumpirmahin at I-save ang Iskedyul')
                    : tr(
                        'Confirm & Save As-Needed Medicine',
                        'Kumpirmahin at I-save ang Gamot Kapag Kailangan'
                      )}
              </button>
            </>
          )}
          <details className="pm-wizard__review-more">
            <summary>{tr('Need help or changes?', 'Kailangan ng tulong o pagbabago?')}</summary>
            <div>
              <button onClick={askPharmacist} type="button">
                <ShieldCheck />
                {tr('Ask a Pharmacist', 'Magtanong sa Parmasyutiko')}
              </button>
              <button onClick={addAnotherMedicine} type="button">
                <Plus />
                {tr('Add another medicine', 'Magdagdag ng isa pang gamot')}
              </button>
              <button
                onClick={() => {
                  setConfirmed(false);
                  setError('');
                  setPhase('schedule-choice');
                }}
                type="button"
              >
                <CalendarClock />
                {tr('Change scheduling method', 'Palitan ang paraan ng pag-iskedyul')}
              </button>
              <button onClick={discardSetupAndLeave} type="button">
                {tr('Go back', 'Bumalik')}
              </button>
            </div>
          </details>
        </WizardPage>
      )}
      {phase === 'success' && (
        <WizardPage
          title={
            schedule?.schedule?.length
              ? tr('Medicine and reminders saved', 'Nai-save ang gamot at mga paalala')
              : tr('As-needed medicine saved', 'Nai-save ang gamot kapag kailangan')
          }
        >
          <div className="pm-wizard__success">
            <CheckCircle2 />
            <p>
              {tr(
                'Your medicine and reminder times are now available on your medication dashboard.',
                'Makikita na ang iyong gamot at mga oras ng paalala sa medication dashboard.'
              )}
            </p>
          </div>
          <button
            className="pm-wizard__primary"
            onClick={() => navigate('/patient/medications?created=1', { replace: true })}
            type="button"
          >
            {tr('Go to Medication Dashboard', 'Pumunta sa Medication Dashboard')} <ChevronRight />
          </button>
        </WizardPage>
      )}
      {confirmation && createPortal(
        <div className="pm-confirm-backdrop" role="presentation">
          <section
            aria-labelledby="pm-confirm-title"
            aria-modal="true"
            className={`pm-confirm-dialog${/delete|burahin/i.test(confirmation.title) ? ' pm-confirm-dialog--delete' : ''}`}
            role="alertdialog"
          >
            <span className="pm-confirm-dialog__icon">
              {/delete|burahin/i.test(confirmation.title) ? <Trash2 /> : <Info />}
            </span>
            <h2 id="pm-confirm-title">{confirmation.title}</h2>
            <p>{confirmation.message}</p>
            <div>
              <button className="cancel" onClick={() => setConfirmation(null)} type="button">
                {tr('Cancel', 'Kanselahin')}
              </button>
              <button className="continue" onClick={continueConfirmedAction} type="button">
                {tr('Continue', 'Magpatuloy')}
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </main>
  );
}

function WizardPage({ title, children, className = '' }) {
  return (
    <section className={`pm-wizard__card ${className}`.trim()}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
function GenerationError({ error, onCheck, tr }) {
  return (
    <div className="pm-wizard__error" role="alert">
      <Info />
      <span>{error}</span>
      <button onClick={onCheck} type="button">
        {tr('Check medicine details', 'Suriin ang detalye ng gamot')}
      </button>
    </div>
  );
}
function BottomNext({ onClick, tr }) {
  return (
    <button className="pm-wizard__primary" onClick={onClick} type="button">
      {tr('Next', 'Susunod')} <ChevronRight />
    </button>
  );
}
function treatmentDates(startDate, endDate) {
  if (!startDate) return [];
  if (!endDate) return [startDate];
  const dates = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (current <= end && dates.length < 366) {
    const timezoneOffset = current.getTimezoneOffset() * 60_000;
    dates.push(new Date(current.getTime() - timezoneOffset).toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
export function FriendlyTimePicker({ onChange, tr, value }) {
  const [hourText = '08', minute = '00'] = String(value || '08:00').split(':');
  const hour24 = Number(hourText);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  const pickerId = useId();
  const [typedHour, setTypedHour] = useState(String(hour12).padStart(2, '0'));
  const [typedMinute, setTypedMinute] = useState(String(minute).padStart(2, '0'));
  useEffect(() => {
    setTypedHour(String(hour12).padStart(2, '0'));
    setTypedMinute(String(minute).padStart(2, '0'));
  }, [hour12, minute]);
  const minuteOptions = [
    ...new Set([
      ...Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0')),
      minute,
    ]),
  ].sort();
  function updateTime(nextHour = hour12, nextMinute = minute, nextPeriod = period) {
    const safeHour = Math.min(12, Math.max(1, Number(nextHour) || hour12));
    const safeMinute = Math.min(59, Math.max(0, Number(nextMinute) || 0));
    let next24 = safeHour % 12;
    if (nextPeriod === 'PM') next24 += 12;
    onChange(`${String(next24).padStart(2, '0')}:${String(safeMinute).padStart(2, '0')}`);
  }
  return (
    <div className="pm-friendly-time-picker" aria-label={tr('Reminder time', 'Oras ng paalala')}>
      <span>
        <Clock3 />
      </span>
      <input
        aria-label={tr('Hour', 'Oras')}
        inputMode="numeric"
        list={`${pickerId}-hours`}
        max="12"
        min="1"
        onBlur={() => updateTime(typedHour, typedMinute)}
        onChange={(event) => setTypedHour(event.target.value.replace(/\D/g, '').slice(0, 2))}
        type="text"
        value={typedHour}
      />
      <datalist id={`${pickerId}-hours`}>
        {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
          <option key={hour} value={hour}>
            {String(hour).padStart(2, '0')}
          </option>
        ))}
      </datalist>
      <b>:</b>
      <input
        aria-label={tr('Minute', 'Minuto')}
        inputMode="numeric"
        list={`${pickerId}-minutes`}
        max="59"
        min="0"
        onBlur={() => updateTime(typedHour, typedMinute)}
        onChange={(event) => setTypedMinute(event.target.value.replace(/\D/g, '').slice(0, 2))}
        type="text"
        value={typedMinute}
      />
      <datalist id={`${pickerId}-minutes`}>
        {minuteOptions.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </datalist>
      <select
        aria-label={tr('AM or PM', 'AM o PM')}
        className="period"
        onChange={(event) => updateTime(typedHour, typedMinute, event.target.value)}
        value={period}
      >
        <option>AM</option>
        <option>PM</option>
      </select>
    </div>
  );
}
function MedicineDayEditor({ allowAnyDate = false, allDates, onChange, selectedDates, tr }) {
  const selected = new Set(selectedDates);
  const todayKey = today();
  const configuredFirstDate = allDates[0] || todayKey;
  const firstAllowedDate = configuredFirstDate < todayKey ? todayKey : configuredFirstDate;
  const firstDate = new Date(`${firstAllowedDate}T00:00:00`);
  const configuredLastDate = allDates.length ? new Date(`${allDates.at(-1)}T00:00:00`) : firstDate;
  const lastDate = allowAnyDate
    ? new Date(Math.max(configuredLastDate.getTime(), firstDate.getTime() + 365 * 24 * 60 * 60 * 1000))
    : configuredLastDate;
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)
  );
  useEffect(() => {
    setVisibleMonth(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1));
  }, [allDates[0]]);
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const blanks = Array.from({ length: monthStart.getDay() }, (_, index) => index);
  const canMoveBack =
    monthStart.getFullYear() > firstDate.getFullYear() ||
    (monthStart.getFullYear() === firstDate.getFullYear() && monthStart.getMonth() > firstDate.getMonth());
  const canMoveForward =
    monthStart.getFullYear() < lastDate.getFullYear() ||
    (monthStart.getFullYear() === lastDate.getFullYear() && monthStart.getMonth() < lastDate.getMonth());
  const monthOptions = [];
  for (
    let cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    cursor <= lastDate;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    monthOptions.push(new Date(cursor));
  }
  const dateKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return (
    <section className="pm-wizard__day-editor pm-wizard__date-picker">
      <header>
        <div>
          <h3>{tr('Choose dates', 'Pumili ng mga petsa')}</h3>
          <div className="pm-date-picker__month-control">
            <button
              aria-label={tr('Previous month', 'Nakaraang buwan')}
              disabled={!canMoveBack}
              onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              type="button"
            >
              ‹
            </button>
            <select
              aria-label={tr('Choose month', 'Pumili ng buwan')}
              onChange={(event) => {
                const [year, month] = event.target.value.split('-').map(Number);
                setVisibleMonth(new Date(year, month - 1, 1));
              }}
              value={`${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, '0')}`}
            >
              {monthOptions.map((month) => (
                <option key={month.toISOString()} value={`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`}>
                  {month.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                </option>
              ))}
            </select>
            <button
              aria-label={tr('Next month', 'Susunod na buwan')}
              disabled={!canMoveForward}
              onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              type="button"
            >
              ›
            </button>
          </div>
        </div>
        <small>
          {tr(`${selectedDates.length} selected`, `${selectedDates.length} ang napili`)}
        </small>
      </header>
      <div className="pm-date-picker__weekdays">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="pm-date-picker__days">
        {blanks.map((blank) => (
          <i aria-hidden="true" key={`blank-${blank}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
          const parsed = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
          const date = dateKey(parsed);
          const available =
            date >= todayKey &&
            (allowAnyDate || (date >= firstAllowedDate && date <= allDates.at(-1)));
          return (
            <button
              aria-label={`${parsed.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}${selected.has(date) ? `, ${tr('selected', 'napili')}` : ''}`}
              aria-pressed={selected.has(date)}
              className={`${selected.has(date) ? 'selected' : ''} ${available ? '' : 'unavailable'}`.trim()}
              disabled={!available}
              key={date}
              onClick={() => {
                  const next = selected.has(date)
                    ? selectedDates.filter((item) => item !== date)
                    : [...selectedDates, date].sort();
                  if (next.length) onChange(next);
              }}
              type="button"
            >
              <strong>{day}</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}
function TreatmentEndDateCalendar({ endDate, onChange, startDate, tr }) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const source = endDate || startDate || today();
    const parsed = new Date(`${source}T00:00:00`);
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  });
  const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const lastDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const monthLabel = first.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const keyFor = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const canGoBack =
    first.getFullYear() > new Date(`${startDate}T00:00:00`).getFullYear() ||
    (first.getFullYear() === new Date(`${startDate}T00:00:00`).getFullYear() &&
      first.getMonth() > new Date(`${startDate}T00:00:00`).getMonth());
  const selectedCount = endDate ? treatmentDates(startDate, endDate).length : 0;
  return (
    <section className="pm-wizard__date-picker pm-treatment-calendar">
      <header>
        <div>
          <h3>{tr('Choose end date', 'Piliin ang huling petsa')}</h3>
          <strong>{monthLabel}</strong>
        </div>
        <small>
          {selectedCount
            ? tr(`${selectedCount} days`, `${selectedCount} araw`)
            : tr('Select a day', 'Pumili ng araw')}
        </small>
      </header>
      <div className="pm-treatment-calendar__nav">
        <button
          aria-label={tr('Previous month', 'Nakaraang buwan')}
          disabled={!canGoBack}
          onClick={() => setVisibleMonth(new Date(first.getFullYear(), first.getMonth() - 1, 1))}
          type="button"
        >
          <ChevronLeft />
        </button>
        <span>{tr('Tap the last day', 'Pindutin ang huling araw')}</span>
        <button
          aria-label={tr('Next month', 'Susunod na buwan')}
          onClick={() => setVisibleMonth(new Date(first.getFullYear(), first.getMonth() + 1, 1))}
          type="button"
        >
          <ChevronRight />
        </button>
      </div>
      <div className="pm-date-picker__weekdays">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="pm-date-picker__days">
        {Array.from({ length: first.getDay() }, (_, index) => (
          <i aria-hidden="true" key={`blank-${index}`} />
        ))}
        {Array.from({ length: lastDay }, (_, index) => {
          const date = new Date(first.getFullYear(), first.getMonth(), index + 1);
          const value = keyFor(date);
          const disabled = value < startDate;
          return (
            <button
              aria-pressed={value === endDate}
              className={value === endDate ? 'selected' : ''}
              disabled={disabled}
              key={value}
              onClick={() => onChange(value)}
              type="button"
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    </section>
  );
}
function MedicineEditSummary({ medicine, tr }) {
  const frequency = FREQUENCIES.find(([code]) => code === medicine?.frequency_code);
  const food = FOOD.find(([code]) => code === medicine?.food_instruction);
  const endDate = endDateFor(medicine?.start_date, medicine?.duration, medicine?.end_date);
  return (
    <section className="pm-edit-medicine-summary">
      <header>
        <span>
          <Pill />
        </span>
        <div>
          <small>{tr('Medicine details', 'Detalye ng gamot')}</small>
          <h2>{medicine?.generic_name}</h2>
          <p>
            {medicine?.strength_value} {medicine?.strength_unit} · {medicine?.patient_form}
          </p>
        </div>
      </header>
      <dl>
        <div>
          <dt>{tr('Dose', 'Dami')}</dt>
          <dd>
            {medicine?.dose_amount} {unitFor(medicine?.patient_form, medicine?.dose_amount)}
          </dd>
        </div>
        <div>
          <dt>{tr('How often', 'Gaano kadalas')}</dt>
          <dd>{frequency ? tr(frequency[1], frequency[2]) : medicine?.frequency_code}</dd>
        </div>
        <div>
          <dt>{tr('Start date', 'Petsa ng simula')}</dt>
          <dd>{medicine?.start_date}</dd>
        </div>
        <div>
          <dt>{tr('End date', 'Petsa ng pagtatapos')}</dt>
          <dd>{endDate || tr('Ongoing', 'Tuloy-tuloy')}</dd>
        </div>
        <div>
          <dt>{tr('Reason', 'Dahilan')}</dt>
          <dd>{medicine?.purpose || tr('Not entered', 'Walang inilagay')}</dd>
        </div>
        <div>
          <dt>{tr('Food', 'Pagkain')}</dt>
          <dd>{food ? tr(food[1], food[2]) : tr('No instruction', 'Walang tagubilin')}</dd>
        </div>
        <div>
          <dt>{tr('Medicine on hand', 'Gamot na mayroon')}</dt>
          <dd>
            {medicine?.quantity_on_hand || 0} {unitFor(medicine?.patient_form, 2)}
          </dd>
        </div>
        <div>
          <dt>{tr('Other instructions', 'Ibang tagubilin')}</dt>
          <dd>{medicine?.label_direction || tr('None', 'Wala')}</dd>
        </div>
      </dl>
    </section>
  );
}
function MedicineDetailsPanel({ error, medicine, onCancel, onChange, onSave, tr }) {
  const frequencyOptions = FREQUENCIES.filter(
    ([code], index, list) => list.findIndex(([candidate]) => candidate === code) === index
  );
  return (
    <WizardPage
      className="pm-wizard__details-panel"
      title={tr(
        `Edit ${medicine?.generic_name || 'medicine'}`,
        `Baguhin ang ${medicine?.generic_name || 'gamot'}`
      )}
    >
      <p>
        {tr(
          'All the details you entered are together here. Save to generate the schedule again.',
          'Magkakasama rito ang lahat ng inilagay mong detalye. I-save upang gawin muli ang iskedyul.'
        )}
      </p>
      <div className="pm-wizard__details-grid">
        <label className="wide">
          <span>{tr('Medicine name', 'Pangalan ng gamot')}</span>
          <input disabled value={medicine?.generic_name || ''} />
        </label>
        <label>
          <span>{tr('Strength', 'Lakas')}</span>
          <input
            inputMode="decimal"
            onChange={(event) => onChange({ strength_value: event.target.value })}
            value={medicine?.strength_value || ''}
          />
        </label>
        <label>
          <span>{tr('Unit', 'Unit')}</span>
          <select
            onChange={(event) => onChange({ strength_unit: event.target.value })}
            value={medicine?.strength_unit || 'mg'}
          >
            {['mg', 'mcg', 'g', 'mL', 'unit', 'IU'].map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </label>
        <label className="wide">
          <span>{tr('Medicine form', 'Uri ng gamot')}</span>
          <select
            onChange={(event) => onChange({ patient_form: event.target.value })}
            value={medicine?.patient_form || ''}
          >
            {FORMS.map((form) => (
              <option key={form} value={formValue(form)}>
                {form}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{tr('Amount each time', 'Dami sa bawat inom')}</span>
          <input
            min="0.5"
            onChange={(event) => onChange({ dose_amount: Number(event.target.value) })}
            step="0.5"
            type="number"
            value={medicine?.dose_amount || 1}
          />
        </label>
        <label>
          <span>{tr('How often', 'Gaano kadalas')}</span>
          <select
            onChange={(event) => onChange({ frequency_code: event.target.value })}
            value={medicine?.frequency_code || ''}
          >
            <option value="">{tr('Choose', 'Pumili')}</option>
            {frequencyOptions.map(([code, en, fil]) => (
              <option key={code} value={code}>
                {tr(en, fil)}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          <span>{tr('Reason (optional)', 'Dahilan (opsyonal)')}</span>
          <input
            onChange={(event) => onChange({ purpose: event.target.value })}
            value={medicine?.purpose || ''}
          />
        </label>
        <label>
          <span>{tr('Start date', 'Petsa ng simula')}</span>
          <input
            onChange={(event) => onChange({ start_date: event.target.value })}
            type="date"
            value={medicine?.start_date || ''}
          />
        </label>
        <label>
          <span>{tr('Treatment length', 'Tagal ng pag-inom')}</span>
          <select
            onChange={(event) => onChange({ duration: event.target.value })}
            value={medicine?.duration || 'ONGOING'}
          >
            <option value="ONGOING">{tr('Ongoing', 'Tuloy-tuloy')}</option>
            <option value="7">7 {tr('days', 'araw')}</option>
            <option value="14">14 {tr('days', 'araw')}</option>
            <option value="30">30 {tr('days', 'araw')}</option>
            <option value="END_DATE">{tr('Choose end date', 'Pumili ng huling petsa')}</option>
          </select>
        </label>
        {medicine?.duration === 'END_DATE' && (
          <label className="wide">
            <span>{tr('End date', 'Huling petsa')}</span>
            <input
              min={medicine.start_date}
              onChange={(event) => onChange({ end_date: event.target.value })}
              type="date"
              value={medicine?.end_date || ''}
            />
          </label>
        )}
        <label>
          <span>{tr('Food instruction', 'Tagubilin sa pagkain')}</span>
          <select
            onChange={(event) => onChange({ food_instruction: event.target.value })}
            value={medicine?.food_instruction || 'NONE'}
          >
            {FOOD.map(([value, en, fil]) => (
              <option key={value} value={value}>
                {tr(en, fil)}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          <span>{tr('First dose time', 'Oras ng unang inom')}</span>
          <FriendlyTimePicker
            onChange={(value) => onChange({ first_dose_time: value })}
            tr={tr}
            value={medicine?.first_dose_time || '08:00'}
          />
        </label>
        <label>
          <span>{tr('Medicine on hand', 'Gamot na mayroon')}</span>
          <input
            min="0"
            onChange={(event) => onChange({ quantity_on_hand: event.target.value })}
            type="number"
            value={medicine?.quantity_on_hand ?? 0}
          />
        </label>
        <label className="pm-wizard__details-check">
          <input
            checked={Boolean(medicine?.refill_reminders)}
            onChange={(event) => onChange({ refill_reminders: event.target.checked })}
            type="checkbox"
          />
          <span>{tr('Refill reminders', 'Paalala sa refill')}</span>
        </label>
        <label className="wide">
          <span>
            {tr('Other label instructions (optional)', 'Ibang tagubilin sa label (opsyonal)')}
          </span>
          <textarea
            onChange={(event) => onChange({ label_direction: event.target.value })}
            rows="3"
            value={medicine?.label_direction || ''}
          />
        </label>
      </div>
      {error && (
        <div className="pm-wizard__error" role="alert">
          <Info />
          {error}
        </div>
      )}
      <div className="pm-wizard__edit-actions">
        <button className="cancel" onClick={onCancel} type="button">
          {tr('Cancel', 'Kanselahin')}
        </button>
        <button className="apply" onClick={onSave} type="button">
          {tr('Save and Generate Again', 'I-save at Gawin Muli')} <ChevronRight />
        </button>
      </div>
    </WizardPage>
  );
}
function MedicineScheduleEditors({
  intakes,
  language,
  medicineDates,
  medicines,
  onDelete,
  onEditDetails,
  onEditTimes,
  schedule,
  source,
  tr,
}) {
  const [selectedKeys, setSelectedKeys] = useState([]);
  const allKeys = medicines.map((item) => String(item._draftKey || item.id));
  const allKeySignature = allKeys.join('\u0000');
  useEffect(() => {
    const availableKeys = allKeySignature ? allKeySignature.split('\u0000') : [];
    setSelectedKeys((current) => current.filter((key) => availableKeys.includes(key)));
  }, [allKeySignature]);
  const allSelected = allKeys.length > 0 && selectedKeys.length === allKeys.length;
  return (
    <section
      className="pm-wizard__medicine-panels"
      aria-label={tr('Medicines and their schedules', 'Mga gamot at kanilang iskedyul')}
    >
      <div className="pm-wizard__medicine-editors-head">
        <h3>{tr('Medicines and schedules', 'Mga gamot at iskedyul')}</h3>
        {medicines.length > 1 && (
          <button onClick={() => setSelectedKeys(allSelected ? [] : allKeys)} type="button">
            {allSelected ? tr('Clear all', 'Alisin lahat') : tr('Select all', 'Piliin lahat')}
          </button>
        )}
      </div>
      {medicines.map((item) => {
        const key = String(item._draftKey || item.id);
        const itemIntake =
          intakes.find((candidate) => candidate.draft_key === key) ||
          intakes.find((candidate) => String(candidate.drug_id) === String(item.id));
        const itemSchedule = schedule
          .map((slot) => ({
            ...slot,
            medicines: slot.medicines.filter(
              (candidate) => String(candidate.drug_id) === String(item.id)
            ),
          }))
          .filter((slot) => slot.medicines.length);
        const frequency = FREQUENCIES.find(([code]) => code === item.frequency_code);
        return (
          <article className="pm-wizard__medicine-panel" key={key}>
            <header>
              <label>
                <input
                  aria-label={tr(`Select ${item.generic_name}`, `Piliin ang ${item.generic_name}`)}
                  checked={selectedKeys.includes(key)}
                  onChange={(event) =>
                    setSelectedKeys((current) =>
                      event.target.checked
                        ? [...current, key]
                        : current.filter((candidate) => candidate !== key)
                    )
                  }
                  type="checkbox"
                />
                <span>
                  <Pill />
                </span>
                <div>
                  <strong>{item.generic_name}</strong>
                  <small>
                    {item.strength_value} {item.strength_unit} · {item.patient_form}
                  </small>
                </div>
              </label>
            </header>
            <dl>
              <div>
                <dt>{tr('Dose', 'Dami')}</dt>
                <dd>
                  {item.dose_amount} {unitFor(item.patient_form, item.dose_amount)}
                </dd>
              </div>
              <div>
                <dt>{tr('How often', 'Gaano kadalas')}</dt>
                <dd>{frequency ? tr(frequency[1], frequency[2]) : item.frequency_code}</dd>
              </div>
              <div>
                <dt>{tr('Starts', 'Simula')}</dt>
                <dd>
                  {new Date(`${item.start_date}T00:00:00`).toLocaleDateString(
                    language === 'fil' ? 'fil-PH' : 'en-PH',
                    { month: 'short', day: 'numeric', year: 'numeric' }
                  )}
                </dd>
              </div>
              <div>
                <dt>{tr('Length', 'Tagal')}</dt>
                <dd>
                  {item.duration === 'ONGOING'
                    ? tr('Ongoing', 'Tuloy-tuloy')
                    : item.duration === 'END_DATE'
                      ? tr('Until end date', 'Hanggang huling petsa')
                      : `${item.duration} ${tr('days', 'araw')}`}
                </dd>
              </div>
            </dl>
            <div className="pm-wizard__medicine-actions">
              <button onClick={() => onEditDetails(item)} type="button">
                <Edit3 />
                {tr('Edit details', 'Baguhin ang detalye')}
              </button>
              <button
                onClick={() => onEditTimes({ drug_id: item.id, name: item.generic_name })}
                type="button"
              >
                <Clock3 />
                {tr('Edit times', 'Baguhin ang oras')}
              </button>
            </div>
            <ScheduleTimeline
              endDate={endDateFor(item.start_date, item.duration, item.end_date)}
              intake={itemIntake}
              language={language}
              medicineDates={medicineDates}
              schedule={itemSchedule}
              source={source}
              startDate={item.start_date}
              tr={tr}
            />
          </article>
        );
      })}
      {selectedKeys.length > 0 && (
        <button
          className="pm-wizard__delete-selected"
          onClick={() => onDelete(selectedKeys)}
          type="button"
        >
          <Trash2 />
          {tr(
            `Delete selected (${selectedKeys.length})`,
            `Burahin ang napili (${selectedKeys.length})`
          )}
        </button>
      )}
    </section>
  );
}
function ScheduleTimeline({
  endDate,
  intake,
  language,
  medicineDates,
  schedule,
  source,
  startDate,
  tr,
}) {
  const days = treatmentDates(startDate, endDate);
  const [selectedDate, setSelectedDate] = useState(days[0] || '');
  const [showAllDays, setShowAllDays] = useState(false);
  const activeDate = days.includes(selectedDate) ? selectedDate : days[0];
  const activeIndex = Math.max(0, days.indexOf(activeDate));
  const weekStart = Math.floor(activeIndex / 7) * 7;
  const visibleDays = days.slice(weekStart, weekStart + 7);
  const displayedDays = showAllDays ? days : visibleDays;
  const visibleSchedule = schedule
    .map((slot) => ({
      ...slot,
      medicines: slot.medicines.filter((item) =>
        (medicineDates[String(item.drug_id || item.name)] || days).includes(activeDate)
      ),
    }))
    .filter((slot) => slot.medicines.length);
  return (
    <section className="pm-wizard__planner pm-generated-calendar">
      <div className="pm-wizard__planner-title">
        <div>
          <small>{tr('Medicine Schedule', 'Iskedyul ng Gamot')}</small>
          <h3>
            {activeDate &&
              new Date(`${activeDate}T00:00:00`).toLocaleDateString(
                language === 'fil' ? 'fil-PH' : 'en-PH',
                { month: 'long', year: 'numeric' }
              )}
          </h3>
        </div>
        {days.length > 7 && (
          <div className="pm-generated-calendar__nav">
            <button
              className="pm-generated-calendar__view-all"
              onClick={() => setShowAllDays((value) => !value)}
              type="button"
            >
              {showAllDays
                ? tr('Show one week', 'Isang linggo lang')
                : tr('View all days', 'Tingnan lahat')}
            </button>
            {!showAllDays && (
              <>
                <button
                  aria-label={tr('Previous week', 'Nakaraang linggo')}
                  disabled={weekStart === 0}
                  onClick={() => setSelectedDate(days[Math.max(0, weekStart - 7)])}
                  type="button"
                >
                  <ChevronLeft />
                </button>
                <button
                  aria-label={tr('Next week', 'Susunod na linggo')}
                  disabled={weekStart + 7 >= days.length}
                  onClick={() => setSelectedDate(days[Math.min(days.length - 1, weekStart + 7)])}
                  type="button"
                >
                  <ChevronRight />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {days.length > 1 && (
        <div className={`pm-generated-calendar__week${showAllDays ? ' show-all' : ''}`}>
          {displayedDays.map((date) => {
            const parsed = new Date(`${date}T00:00:00`);
            return (
              <button
                aria-pressed={activeDate === date}
                className={activeDate === date ? 'selected' : ''}
                key={date}
                onClick={() => setSelectedDate(date)}
                type="button"
              >
                <small>
                  {parsed.toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-PH', {
                    weekday: 'narrow',
                  })}
                </small>
                <strong>{parsed.getDate()}</strong>
              </button>
            );
          })}
        </div>
      )}
      <p className="pm-generated-calendar__date">
        {activeDate &&
          new Date(`${activeDate}T00:00:00`).toLocaleDateString(
            language === 'fil' ? 'fil-PH' : 'en-PH',
            { weekday: 'long', month: 'long', day: 'numeric' }
          )}
      </p>
      <div className="pm-wizard__compact-schedule">
        {visibleSchedule.map((slot) =>
          slot.medicines.map((item, medicineIndex) => (
            <article
              key={`${activeDate}-${slot.time}-${item.drug_id || item.name}-${medicineIndex}`}
            >
              <time dateTime={`${activeDate}T${slot.time}:00`}>{timeLabel(slot.time)}</time>
              <div className="pm-generated-calendar__event">
                <span>
                  <Pill />
                </span>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.strength || intake?.custom_strength} · {intake?.dosage_instruction}
                  </small>
                  {item.food_instruction &&
                    !/^(no food instruction|follow your medicine label)/i.test(
                      item.food_instruction
                    ) && (
                    <small>{item.food_instruction}</small>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
        {visibleSchedule.length === 0 && (
          <p className="pm-wizard__planner-empty">
            {tr('No reminders are set for this day.', 'Walang paalala para sa araw na ito.')}
          </p>
        )}
      </div>
      {source === 'suggested' && (
        <details className="pm-wizard__why">
          <summary>{tr('Why these times?', 'Bakit ganito ang mga oras?')}</summary>
          <p>
            {tr(
              'Based on the schedule you selected and your daily routine.',
              'Batay sa napili mong iskedyul at araw-araw mong routine.'
            )}
          </p>
        </details>
      )}
    </section>
  );
}
