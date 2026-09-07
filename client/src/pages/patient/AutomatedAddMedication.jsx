import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
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
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || localStorage.getItem(DRAFT_KEY) || 'null') || {};
  } catch {
    return {};
  }
}
function frequencyDetails(code) {
  const rules = {
    QD: ['ONCE_DAILY', 1], BID: ['TWICE_DAILY', 2], TID: ['THREE_TIMES_DAILY', 3],
    QID: ['SPECIFIC_TIMES', 4], Q4H: ['EVERY_N_HOURS', 6, 4], Q6H: ['EVERY_N_HOURS', 4, 6],
    Q8H: ['EVERY_N_HOURS', 3, 8], Q12H: ['EVERY_N_HOURS', 2, 12], PRN: ['AS_NEEDED', 0],
  };
  const [frequencyType, count, intervalHours = null] = rules[code] || [null, null, null];
  return { frequencyType, count, intervalHours };
}
function today(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const tz = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tz).toISOString().slice(0, 10);
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

export default function AutomatedAddMedication() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const tr = (en, fil) => (language === 'fil' ? fil : en);
  const initial = useMemo(readDraft, []);
  const restoredPhase = String(initial.phase || 'questions').startsWith('suggested-')
    ? 'schedule-choice'
    : initial.phase === 'manual-dose'
      ? 'manual-times'
      : initial.phase || 'questions';
  const [step, setStep] = useState(Math.min(initial.step || 1, 8));
  const [durationPage, setDurationPage] = useState(Boolean(initial.durationPage));
  const [phase, setPhase] = useState(restoredPhase);
  const [query, setQuery] = useState(initial.query || '');
  const [results, setResults] = useState([]);
  const [medicine, setMedicine] = useState(initial.medicine || null);
  const [medicineList, setMedicineList] = useState(initial.medicineList || []);
  const [detailBackup, setDetailBackup] = useState(null);
  const [searching, setSearching] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [schedule, setSchedule] = useState(initial.schedule || null);
  const [source, setSource] = useState(initial.source || '');
  const [manualTimes, setManualTimes] = useState(initial.manualTimes || ['08:00']);
  const [editingMedicine, setEditingMedicine] = useState(initial.editingMedicine || null);
  const [medicineDates, setMedicineDates] = useState(initial.medicineDates || {});
  const [confirmed, setConfirmed] = useState(false);
  const [referenceConfirmed, setReferenceConfirmed] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [saved, setSaved] = useState(false);
  const saveLock = useRef(false);

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

  const update = (changes) => {
    if ('start_date' in changes || 'end_date' in changes || 'duration' in changes) {
      const key = String(medicine?._draftKey || medicine?.id || '');
      setMedicineDates((current) =>
        Object.fromEntries(Object.entries(current).filter(([itemKey]) => itemKey !== key && itemKey !== String(medicine?.id || '')))
      );
    }
    setMedicine((current) => ({ ...current, ...changes }));
    setError('');
  };
  const brands = brandsFor(medicine);
  const uses = usesFor(medicine);
  const hasBrandPage = Boolean(brands.length || medicine?.release_type);
  const selectedEndDate = endDateFor(medicine?.start_date, medicine?.duration, medicine?.end_date);
  const allMedicines = useMemo(() => {
    if (!medicine) return medicineList;
    const key = String(medicine._draftKey || medicine.id);
    return [...medicineList.filter((item) => String(item._draftKey || item.id) !== key), medicine];
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
  function back() {
    setError('');
    if (phase === 'success') return;
    if (phase === 'edit-details') {
      setMedicine(detailBackup);
      setPhase('review');
      return;
    }
    if (phase === 'review') {
      setPhase('schedule-choice');
      return;
    }
    if (phase === 'suggested-unavailable') {
      setPhase('schedule-choice');
      return;
    }
    if (phase === 'schedule-choice') {
      setPhase('questions');
      setStep(3);
      setDurationPage(false);
      return;
    }
    const manualQuestions = ['manual-first', 'manual-food', 'manual-supply', 'manual-instructions'];
    if (manualQuestions.includes(phase)) {
      const index = manualQuestions.indexOf(phase);
      if (index) setPhase(manualQuestions[index - 1]);
      else {
        setPhase('questions');
        setStep(8);
        setDurationPage(true);
      }
      return;
    }
    if (phase === 'manual-times') {
      setPhase(schedule?.schedule?.length ? 'review' : 'manual-instructions');
      return;
    }
    if (durationPage) {
      setDurationPage(false);
      return;
    }
    const firstManualDetailStep = hasBrandPage ? 4 : 5;
    if (source === 'manual' && step === firstManualDetailStep) {
      setPhase('schedule-choice');
      return;
    }
    if (step > 1) {
      const target = step - 1;
      setStep(target === 4 && !hasBrandPage ? 3 : target);
      return;
    }
    if (
      (medicine || query) &&
      !window.confirm(
        tr(
          'Leave this setup? Your unfinished answers will stay on this device.',
          'Umalis sa setup? Mananatili sa device ang mga sagot mo.'
        )
      )
    )
      return;
    navigate('/patient/medications');
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
    if (step === 8 && durationPage) {
      setMedicineList(allMedicines);
      setConfirmed(false);
      setPhase('manual-first');
      return;
    }
    setStep((current) => Math.min(8, current + 1));
  }

  async function generate() {
    setWorking(true);
    setError('');
    setSource('suggested');
    try {
      const safetyProfile = await api('/api/patient/safety-profile');
      if (safetyProfile.data.missing_for_safety_check?.length) {
        setError(
          tr(
            'Complete the missing safety details once so PharMate can check this suggestion.',
            'Kumpletuhin nang isang beses ang kulang na safety details para masuri ng PharMate ang mungkahi.'
          )
        );
        setPhase('safety-needed');
        return;
      }
      const adaptiveRequest = {
        medications: intakes.map((item) => ({
          ...item,
          first_dose_time: '',
        })),
      };
      const response = await api('/api/medications/generate-schedule', {
        method: 'POST',
        body: { ...adaptiveRequest, schedule_mode: 'SUGGESTED' },
      });
      const governedDirections = new Map([
        ...(response.data.schedule || []).flatMap((slot) =>
          slot.medicines.map((item) => [String(item.drug_id), item])
        ),
        ...(response.data.prn_trackers || []).map((item) => [String(item.drug_id), item]),
      ]);
      const suggestedMedicines = allMedicines.map((item) => ({
        ...item,
        frequency_code: governedDirections.get(String(item.id))?.frequency || item.frequency_code,
        label_direction:
          governedDirections.get(String(item.id))?.label_direction ||
          governedDirections.get(String(item.id))?.directions ||
          item.label_direction,
        start_date: item.start_date || today(),
        duration: item.duration || 'ONGOING',
        dose_amount: item.dose_amount || 1,
      }));
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
      setError(requestError.body?.error || requestError.message);
      setPhase('suggested-unavailable');
    } finally {
      setWorking(false);
    }
  }
  function startManualQuestions() {
    setMedicineList(allMedicines);
    setSource('manual');
    setConfirmed(false);
    setError('');
    setDurationPage(false);
    setStep(hasBrandPage ? 4 : 5);
    setPhase('questions');
  }
  function startManualTimeQuestions() {
    const dateMap = { ...medicineDates };
    for (const item of allMedicines)
      dateMap[String(item.id)] = treatmentDates(
        item.start_date,
        endDateFor(item.start_date, item.duration, item.end_date)
      );
    setMedicineList(allMedicines);
    setMedicineDates(dateMap);
    setEditingMedicine({ drug_id: intake.drug_id, name: intake.medicine_name });
    setManualTimes([medicine.first_dose_time || '08:00']);
    setSchedule((current) => current || { schedule: [] });
    setSource('manual');
    setConfirmed(false);
    setError('');
    setPhase('manual-times');
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
    const frequency = frequencyDetails(medicine.frequency_code);
    try {
      await api('/api/medications/validate-schedule', {
        method: 'POST',
        body: {
          frequencyType: frequency.frequencyType,
          intervalHours: frequency.intervalHours,
          scheduleTimes: manualRows().map((row) => row.time),
          startDate: medicine.start_date,
          endDate: selectedEndDate || null,
        },
      });
    } catch (requestError) {
      setError(requestError.body?.message || requestError.body?.error || requestError.message);
      return;
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
          body: request,
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
      localStorage.removeItem('pm_schedule_hidden');
      localStorage.setItem('pm_has_medication_schedule', '1');
      localStorage.setItem('pm_medication_schedule_source', source);
      sessionStorage.setItem('pm_medicine_added_success', '1');
      sessionStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_KEY);
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

  const questionTitle = [
    tr('What is the name of your medicine?', 'Ano ang pangalan ng iyong gamot?'),
    tr('What form is your medicine?', 'Anong uri ang iyong gamot?'),
    tr('What strength is shown on the label?', 'Anong lakas ang nakasulat sa label?'),
    tr('Does the label show a brand or special type?', 'May brand o espesyal na uri ba sa label?'),
    tr('What are you taking this medicine for?', 'Para saan mo iniinom ang gamot na ito?'),
    tr('How often do you take this medicine?', 'Gaano kadalas mo iniinom ang gamot na ito?'),
    tr(
      `How many ${unitFor(medicine?.patient_form || medicine?.dosage_form, 2)} do you take at one time?`,
      'Gaano karaming gamot ang iniinom mo sa isang inuman?'
    ),
    durationPage
      ? tr('How long will you take it?', 'Gaano katagal mo ito iinumin?')
      : tr('When will you start taking it?', 'Kailan mo ito sisimulang inumin?'),
  ][step - 1];

  return (
    <main className="pm-auto-medication-page pm-wizard">
      <header className="pm-auto-medication-header pm-wizard__header">
        <button aria-label={tr('Back', 'Bumalik')} onClick={back} type="button">
          <ArrowLeft />
        </button>
        <div>
          <h1>{tr('Medication Setup', 'Pag-set Up ng Gamot')}</h1>
          {phase !== 'questions' && (
            <p>
              {phase === 'schedule-choice'
                ? tr('Choose a scheduling method', 'Pumili ng paraan ng pag-iskedyul')
                : source === 'manual'
                  ? tr('Manual schedule', 'Manwal na iskedyul')
                  : tr('PharMate suggested schedule', 'Mungkahing iskedyul ng PharMate')}
            </p>
          )}
        </div>
      </header>
      {phase === 'questions' && (
        <div
          aria-label={tr('Medication setup progress', 'Progreso ng pag-set up ng gamot')}
          aria-valuemax="8"
          aria-valuemin="1"
          aria-valuenow={step}
          className="pm-wizard__progress"
          role="progressbar"
        >
          <span style={{ width: `${step * (100 / 8)}%` }} />
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
                  setMedicineList(allMedicines);
                  setConfirmed(false);
                  setError('');
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
                <input
                  className="pm-wizard__date"
                  min={medicine.start_date}
                  onChange={(event) => update({ end_date: event.target.value })}
                  type="date"
                  value={medicine?.end_date || ''}
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
          className="pm-wizard__schedule-choice"
          title={tr(
            'How would you like to create your schedule?',
            'Paano mo gustong gawin ang iyong iskedyul?'
          )}
        >
          <p>
            {tr('Choose how to set your reminders.', 'Piliin kung paano itatakda ang paalala.')}
          </p>
          <article className="pm-wizard__method suggested">
            <ShieldCheck />
            <div>
              <h3>{tr('Use PharMate Suggested Schedule', 'Gamitin ang Mungkahi ng PharMate')}</h3>
              <p>
                {tr(
                  'Review suggested reminder times before saving.',
                  'Suriin ang mungkahing oras bago i-save.'
                )}
              </p>
            </div>
            <button disabled={working} onClick={() => generate()} type="button">
              {working ? <LoaderCircle className="spin" /> : <CalendarClock />}
              {tr('Use Suggested Schedule', 'Gamitin ang Mungkahi')}
            </button>
          </article>
          <article className="pm-wizard__method manual">
            <Edit3 />
            <div>
              <h3>{tr('Create My Own Schedule', 'Gumawa ng Sarili Kong Iskedyul')}</h3>
              <p>
                {tr(
                  'Answer a few questions and choose your own times.',
                  'Sagutin ang ilang tanong at piliin ang iyong oras.'
                )}
              </p>
            </div>
            <button disabled={working} onClick={startManualQuestions} type="button">
              <Clock3 />
              {tr('Create Manually', 'Gumawa nang Manwal')}
            </button>
          </article>
          {error && (
            <GenerationError
              error={error}
              onAsk={() => navigate('/patient/ask')}
              onCheck={() => {
                setPhase('questions');
                setStep(3);
                setDurationPage(false);
              }}
              onEdit={startManualQuestions}
              tr={tr}
            />
          )}
        </WizardPage>
      )}

      {phase === 'suggested-unavailable' && (
        <WizardPage
          className="pm-wizard__suggested-unavailable"
          title={tr('No automatic rule available', 'Walang awtomatikong rule na available')}
        >
          <div className="pm-wizard__generation-error" role="alert">
            <Info />
            <div>
              <h3>{medicine?.generic_name || intake.medicine_name}</h3>
              <p>
                {tr(
                  'This exact medicine, strength, dose, and form does not have a supported PharMate rule yet.',
                  'Wala pang suportadong PharMate rule para sa eksaktong gamot, lakas, dose, at uri na ito.'
                )}
              </p>
              <button onClick={startManualQuestions} type="button">
                {tr('Enter Label Instructions', 'Ilagay ang Tagubilin sa Label')}
              </button>
              <button onClick={() => setPhase('schedule-choice')} type="button">
                {tr('Choose Another Method', 'Pumili ng Ibang Paraan')}
              </button>
            </div>
          </div>
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
              <button onClick={() => navigate('/patient/onboarding')} type="button">
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
          <BottomNext onClick={() => setPhase('manual-food')} tr={tr} />
        </WizardPage>
      )}
      {phase === 'manual-food' && (
        <WizardPage
          title={tr(
            'What does the label say about food?',
            'Ano ang nakasulat sa label tungkol sa pagkain?'
          )}
        >
          <div className="pm-wizard__choices">
            {FOOD.map(([value, en, fil]) => (
              <button
                className={medicine.food_instruction === value ? 'selected' : ''}
                key={value}
                onClick={() => update({ food_instruction: value })}
                type="button"
              >
                <strong>{language === 'fil' ? fil : en}</strong>
                {medicine.food_instruction === value && <Check />}
              </button>
            ))}
          </div>
          <BottomNext onClick={() => setPhase('manual-supply')} tr={tr} />
        </WizardPage>
      )}
      {phase === 'manual-supply' && (
        <WizardPage
          title={tr('Would you like refill reminders?', 'Gusto mo ba ng paalala sa refill?')}
        >
          <div className="pm-wizard__choices">
            <button
              className={medicine.refill_reminders ? 'selected' : ''}
              onClick={() => update({ refill_reminders: true })}
              type="button"
            >
              <strong>{tr('Yes, remind me', 'Oo, paalalahanan ako')}</strong>
            </button>
            <button
              className={!medicine.refill_reminders ? 'selected' : ''}
              onClick={() => update({ refill_reminders: false, quantity_on_hand: 0 })}
              type="button"
            >
              <strong>{tr('No refill reminder', 'Walang paalala sa refill')}</strong>
            </button>
          </div>
          {medicine.refill_reminders && (
            <label className="pm-wizard__field">
              <span>{tr('How many do you have now?', 'Ilan ang mayroon ka ngayon?')}</span>
              <input
                inputMode="numeric"
                min="0"
                onChange={(event) => update({ quantity_on_hand: event.target.value })}
                type="number"
                value={medicine.quantity_on_hand}
              />
            </label>
          )}
          <BottomNext onClick={() => setPhase('manual-instructions')} tr={tr} />
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
            allDates={treatmentDates(medicine.start_date, selectedEndDate)}
            onChange={(dates) =>
              setMedicineDates((current) => ({
                ...current,
                [String(editingMedicine?.drug_id || editingMedicine?.name || intake.drug_id)]:
                  dates,
              }))
            }
            selectedDates={
              medicineDates[
                String(editingMedicine?.drug_id || editingMedicine?.name || intake.drug_id)
              ] || treatmentDates(medicine.start_date, selectedEndDate)
            }
            tr={tr}
          />
          <section className="pm-wizard__time-list">
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
              if (Number.isInteger(maximum) && manualTimes.length >= maximum) {
                setError(maximum === 1
                  ? tr('This medication is set to once daily. Only one scheduled time can be added.', 'Isang beses lang kada araw ang gamot na ito.')
                  : tr(`This frequency allows ${maximum} scheduled times per day.`, `Hanggang ${maximum} oras lamang kada araw.`));
                return;
              }
              setManualTimes((times) => [...times, '12:00']);
            }}
            type="button"
          >
            <Plus />
            {tr('Add another time', 'Magdagdag ng oras')}
          </button>
          {error && <div className="pm-wizard__error" role="alert"><Info />{error}</div>}
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
          {source === 'suggested' && (
            <aside className="pm-wizard__warning">
              <Info />
              <span>
                {tr(
                  schedule?.disclaimer ||
                    'PharMate checks recorded rules and creates reminder times only. It does not guarantee that a medicine or schedule is medically safe or replace a licensed clinician or pharmacist.',
                  'Sinusuri lamang ng PharMate ang mga naitalang tuntunin at gumagawa ng oras ng paalala. Hindi nito ginagarantiya na medikal na ligtas ang gamot o iskedyul at hindi nito pinapalitan ang lisensyadong clinician o parmasyutiko.'
                )}
              </span>
            </aside>
          )}
          {schedule?.prn_trackers?.length > 0 && (
            <aside className="pm-wizard__warning">
              <Info />
              <div>
                <strong>
                  {tr(
                    'As-needed tracker — no recurring alarms',
                    'Tracker kapag kailangan — walang paulit-ulit na alarm'
                  )}
                </strong>
                {schedule.prn_trackers.map((tracker) => (
                  <span key={tracker.drug_id}>
                    {tracker.name}: {tracker.directions}.{' '}
                    {tracker.min_interval_hours
                      ? tr(
                          `Wait at least ${tracker.min_interval_hours} hours between doses.`,
                          `Maghintay ng hindi bababa sa ${tracker.min_interval_hours} oras sa pagitan ng dose.`
                        )
                      : tr(
                          'PharMate will not calculate the next safe dose.',
                          'Hindi kakalkulahin ng PharMate ang susunod na ligtas na dose.'
                        )}
                  </span>
                ))}
              </div>
            </aside>
          )}
          {schedule?.warnings
            ?.filter((item) => item.severity === 'warning')
            .map((item) => (
              <aside className="pm-wizard__warning" key={`${item.code}-${item.drug_id || ''}`}>
                <Info />
                <span>{item.message}</span>
              </aside>
            ))}
          {source === 'manual' && (
            <aside className="pm-wizard__warning">
              <Info />
              <span>
                {tr(
                  'Created by you. Check that your selected times match the medicine label or prescription. Ask your pharmacist if you are unsure.',
                  'Ikaw ang gumawa nito. Tiyaking tugma ang napiling oras sa label o reseta. Magtanong sa parmasyutiko kung hindi sigurado.'
                )}
              </span>
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
          <button
            className="pm-wizard__secondary"
            onClick={askPharmacist}
            type="button"
          >
            <ShieldCheck />
            {tr('Ask a Pharmacist', 'Magtanong sa Parmasyutiko')}
          </button>
          <button
            className="pm-wizard__add-medicine-review"
            onClick={addAnotherMedicine}
            type="button"
          >
            <Plus />
            {tr('Add another medicine', 'Magdagdag ng isa pang gamot')}
          </button>
          <div className="pm-wizard__review-actions">
            <button
              onClick={() => {
                setConfirmed(false);
                setError('');
                setPhase('schedule-choice');
              }}
              type="button"
            >
              <CalendarClock />
              {tr('Change Scheduling Method', 'Palitan ang Paraan ng Pag-iskedyul')}
            </button>
          </div>
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
                {schedule?.schedule?.length
                  ? tr('Confirm & Save Schedule', 'Kumpirmahin at I-save ang Iskedyul')
                  : tr(
                      'Confirm & Save As-Needed Medicine',
                      'Kumpirmahin at I-save ang Gamot Kapag Kailangan'
                    )}
              </button>
            </>
          )}
          <button className="pm-wizard__secondary" onClick={back} type="button">
            {tr('Go Back', 'Bumalik')}
          </button>
        </WizardPage>
      )}
      {phase === 'success' && (
        <WizardPage title={tr('Medication schedule saved', 'Nai-save ang iskedyul ng gamot')}>
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
      {confirmation && (
        <div className="pm-confirm-backdrop" role="presentation">
          <section
            aria-labelledby="pm-confirm-title"
            aria-modal="true"
            className="pm-confirm-dialog"
            role="alertdialog"
          >
            <span className="pm-confirm-dialog__icon">
              <Info />
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
        </div>
      )}
    </main>
  );
}

function WizardPage({ title, children, className = '' }) {
  return (
    <section className={`pm-wizard__card ${className}`.trim()}>
      <h2>{title}</h2>
      {children}
    </section>
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
  const minuteOptions = [
    ...new Set([
      ...Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0')),
      minute,
    ]),
  ].sort();
  function updateTime(nextHour = hour12, nextMinute = minute, nextPeriod = period) {
    let next24 = Number(nextHour) % 12;
    if (nextPeriod === 'PM') next24 += 12;
    onChange(`${String(next24).padStart(2, '0')}:${nextMinute}`);
  }
  return (
    <div className="pm-friendly-time-picker" aria-label={tr('Reminder time', 'Oras ng paalala')}>
      <span>
        <Clock3 />
      </span>
      <select
        aria-label={tr('Hour', 'Oras')}
        onChange={(event) => updateTime(event.target.value)}
        value={hour12}
      >
        {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
          <option key={hour} value={hour}>
            {String(hour).padStart(2, '0')}
          </option>
        ))}
      </select>
      <b>:</b>
      <select
        aria-label={tr('Minute', 'Minuto')}
        onChange={(event) => updateTime(hour12, event.target.value)}
        value={minute}
      >
        {minuteOptions.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <select
        aria-label={tr('AM or PM', 'AM o PM')}
        className="period"
        onChange={(event) => updateTime(hour12, minute, event.target.value)}
        value={period}
      >
        <option>AM</option>
        <option>PM</option>
      </select>
    </div>
  );
}
function MedicineDayEditor({ allDates, onChange, selectedDates, tr }) {
  const selected = new Set(selectedDates);
  const firstDate = allDates[0] ? new Date(`${allDates[0]}T00:00:00`) : new Date();
  const lastDate = allDates.length ? new Date(`${allDates.at(-1)}T00:00:00`) : firstDate;
  const monthLabel =
    firstDate.getMonth() === lastDate.getMonth() &&
    firstDate.getFullYear() === lastDate.getFullYear()
      ? firstDate.toLocaleDateString([], { month: 'long', year: 'numeric' })
      : `${firstDate.toLocaleDateString([], { month: 'short' })} – ${lastDate.toLocaleDateString([], { month: 'short', year: 'numeric' })}`;
  const blanks = Array.from({ length: firstDate.getDay() }, (_, index) => index);
  return (
    <section className="pm-wizard__day-editor pm-wizard__date-picker">
      <header>
        <div>
          <h3>{tr('Choose dates', 'Pumili ng mga petsa')}</h3>
          <strong>{monthLabel}</strong>
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
        {allDates.map((date) => {
          const parsed = new Date(`${date}T00:00:00`);
          return (
            <label className={selected.has(date) ? 'selected' : ''} key={date}>
              <input
                checked={selected.has(date)}
                onChange={() => {
                  const next = selected.has(date)
                    ? selectedDates.filter((item) => item !== date)
                    : [...selectedDates, date].sort();
                  if (next.length) onChange(next);
                }}
                type="checkbox"
              />
              <strong>{parsed.getDate()}</strong>
            </label>
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
              'PharMate used the frequency and instructions you entered.',
              'Ginamit ng PharMate ang dalas at mga tagubiling inilagay mo.'
            )}
          </p>
        </details>
      )}
    </section>
  );
}
function GenerationError({ error, onCheck, onEdit, onAsk, tr }) {
  return (
    <div className="pm-wizard__generation-error" role="alert">
      <Info />
      <div>
        <h3>{tr('We need more information', 'Kailangan namin ng dagdag na impormasyon')}</h3>
        <p>
          {tr(
            'PharMate could not create a suggested schedule from the available medicine instructions. Check the medicine label or prescription, create the schedule yourself, or ask your pharmacist.',
            'Hindi makagawa ang PharMate ng mungkahing iskedyul mula sa available na tagubilin. Suriin ang label o reseta, gumawa ng sariling iskedyul, o magtanong sa parmasyutiko.'
          )}
        </p>
        {error && <small>{error}</small>}
        <button onClick={onCheck} type="button">
          {tr('Check Medicine Details', 'Suriin ang Detalye ng Gamot')}
        </button>
        <button onClick={onEdit} type="button">
          {tr('Create Manual Schedule', 'Gumawa ng Manwal na Iskedyul')}
        </button>
        <button onClick={onAsk} type="button">
          {tr('Ask a Pharmacist', 'Magtanong sa Parmasyutiko')}
        </button>
      </div>
    </div>
  );
}
