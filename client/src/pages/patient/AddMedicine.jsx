import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import AutomatedAddMedication, { FriendlyTimePicker } from './AutomatedAddMedication.jsx';

const FREQ_OPTIONS = [
  { label: 'Once daily', fil: 'Isang beses', value: 'once daily' },
  { label: 'Twice daily', fil: 'Dalawang beses', value: 'twice daily' },
  { label: '3x daily', fil: 'Tatlong beses', value: 'three times daily' },
  { label: 'Every other day', fil: 'Kada dalawang araw', value: 'every other day' },
  { label: 'Every 6 hours', fil: 'Kada 6 na oras', value: 'every 6 hours' },
  { label: 'Every 8 hours', fil: 'Kada 8 oras', value: 'every 8 hours' },
  { label: 'Every 12 hours', fil: 'Kada 12 oras', value: 'every 12 hours' },
];
const MEDICINE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Injection',
  'Solution',
  'Suspension',
  'Cream',
  'Ointment',
  'Inhaler',
  'Eye drops',
  'Ear drops',
  'Transdermal patch',
];
const DOSE_OPTIONS = [
  '5 mg',
  '10 mg',
  '20 mg',
  '25 mg',
  '50 mg',
  '100 mg',
  '250 mg',
  '500 mg',
  '650 mg',
  '1000 mg',
  '5 mL',
  '10 mL',
  '1000 IU',
  '5000 IU',
];
const DIRECTION_OPTIONS = [
  'Take one dose',
  'Take as directed',
  'Take in the morning',
  'Take at noon',
  'Take in the evening',
  'Take at bedtime',
];
const TIMING_NOTE_OPTIONS = [
  'No additional timing instruction',
  'Keep separate from my other medicines',
  'Avoid taking close to bedtime',
  'Take at the same time every day',
  'Remind me around a meal',
];
const TIME_OPTIONS = Array.from({ length: 24 }, (_, index) => {
  const value = `${String(index).padStart(2, '0')}:00`;
  return {
    value,
    label: new Date(`2000-01-01T${value}`).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
});

function FieldIcon({ name }) {
  const paths = {
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    dose: (
      <>
        <path d="M12 3v18M5 12h14" />
        <circle cx="12" cy="12" r="8" />
      </>
    ),
    medicine: (
      <>
        <path d="m10.5 5.5 8 8a4 4 0 0 1-5.7 5.7l-8-8a4 4 0 0 1 5.7-5.7Z" />
        <path d="m8.5 15.5 7-7" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      viewBox="0 0 24 24"
      width="22"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
    >
      {paths[name]}
    </svg>
  );
}

const dateValue = (value) => (value ? String(value).slice(0, 10) : '');
function timeValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '08:00'
    : `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function minuteOfDay(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
function frequencyChoice(value = '') {
  const normalized = value.toLowerCase();
  const candidate =
    {
      qd: 'once daily',
      bid: 'twice daily',
      tid: 'three times daily',
      '3x daily': 'three times daily',
    }[normalized] || normalized;
  return FREQ_OPTIONS.some((option) => option.value === candidate) ? candidate : 'once daily';
}

function ScheduleFlowSteps({ current, tr }) {
  const steps = [
    tr('Add Medicine', 'Magdagdag ng Gamot'),
    tr('Create Schedule', 'Gumawa ng Iskedyul'),
    tr('Review Schedule', 'Suriin ang Iskedyul'),
    tr('Complete', 'Tapos'),
  ];
  return (
    <nav
      aria-label={tr('Schedule creation progress', 'Progreso ng paggawa ng iskedyul')}
      className="pm-schedule-flow-steps"
    >
      <ol>
        {steps.map((step, index) => {
          const number = index + 1;
          const state = number < current ? 'complete' : number === current ? 'active' : '';
          return (
            <li aria-current={number === current ? 'step' : undefined} className={state} key={step}>
              <span>{number < current ? <FieldIcon name="shield" /> : number}</span>
              <strong>{step}</strong>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function LegacyAddMedicine() {
  const { language } = useLanguage();
  const tr = (english, filipino) => (language === 'fil' ? filipino : english);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const returnToSuggested = searchParams.get('return') === 'suggested';
  const appendToSuggested = searchParams.get('append') === '1';
  const addMedicineOnly = !editId;
  const [name, setName] = useState(searchParams.get('name') || '');
  const [strength, setStrength] = useState(searchParams.get('strength') || '');
  const [form, setForm] = useState(searchParams.get('form') || '');
  const [freqChoice, setFreqChoice] = useState('once daily');
  const [labelDirections, setLabelDirections] = useState('Take as directed');
  const [foodTiming, setFoodTiming] = useState('no restriction');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [bedtime, setBedtime] = useState('21:00');
  const [timingNotes, setTimingNotes] = useState('No additional timing instruction');
  const [times, setTimes] = useState(['08:00']);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [ongoing, setOngoing] = useState(true);
  const [original, setOriginal] = useState(null);
  const [loading, setLoading] = useState(Boolean(editId));
  const [suggestions, setSuggestions] = useState([]);
  const [selectedDrug, setSelectedDrug] = useState(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const [medicineSearch, setMedicineSearch] = useState('');
  const [searchingDrugs, setSearchingDrugs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    if (!editId) return;
    Promise.all([api(`/api/patient/medications/${editId}`), api('/api/patient/doses/today')])
      .then(([medicationResponse, doseResponse]) => {
        const medicine = medicationResponse.data;
        const dosageParts = String(medicine.dosage_instruction || '')
          .split(',')
          .map((part) => part.trim());
        const choice = frequencyChoice(medicine.frequency);
        const scheduledTimes = doseResponse.data
          .filter(
            (dose) =>
              dose.medication_id === editId && ['scheduled', 'snoozed'].includes(dose.status)
          )
          .map((dose) => timeValue(dose.scheduled_time));
        setOriginal(medicine);
        setName(medicine.drug_name_raw || '');
        setStrength(dosageParts[0] || '');
        setForm(dosageParts[1] || 'Tablet');
        setFreqChoice(choice);
        setTimes([...new Set(scheduledTimes)].length ? [...new Set(scheduledTimes)] : ['08:00']);
        setStartDate(dateValue(medicine.start_date) || new Date().toISOString().slice(0, 10));
        setEndDate(dateValue(medicine.end_date));
        setOngoing(!medicine.end_date);
        try {
          const preferences =
            JSON.parse(localStorage.getItem('pm_medicine_schedule_preferences') || '{}')[editId] ||
            {};
          setLabelDirections(preferences.labelDirections || 'Take as directed');
          setFoodTiming(preferences.foodTiming || 'no restriction');
          setWakeTime(preferences.wakeTime || '07:00');
          setBedtime(preferences.bedtime || '21:00');
          setTimingNotes(preferences.timingNotes || 'No additional timing instruction');
        } catch {
          /* Keep safe defaults when saved preferences are invalid. */
        }
      })
      .catch((error) => setResult({ kind: 'error', message: error.message }))
      .finally(() => setLoading(false));
  }, [editId]);

  useEffect(() => {
    setSearchingDrugs(true);
    api('/api/patient/drugs?q=&limit=500')
      .then((response) => setSuggestions(response.data))
      .catch(() => setSuggestions([]))
      .finally(() => setSearchingDrugs(false));
  }, []);

  const frequency = freqChoice;
  const filteredMedicines = useMemo(
    () =>
      suggestions.filter((drug) =>
        drug.generic_name.toLowerCase().includes(medicineSearch.trim().toLowerCase())
      ),
    [suggestions, medicineSearch]
  );
  const doseOptions = useMemo(
    () =>
      selectedDrug?.common_strength
        ? [...new Set([selectedDrug.common_strength, strength].filter(Boolean))]
        : [...new Set([strength, ...DOSE_OPTIONS].filter(Boolean))],
    [selectedDrug, strength]
  );
  const formOptions = useMemo(
    () =>
      selectedDrug?.dosage_form
        ? [selectedDrug.dosage_form[0].toUpperCase() + selectedDrug.dosage_form.slice(1)]
        : MEDICINE_FORMS,
    [selectedDrug]
  );
  function catalogFoodTiming(instruction) {
    const value = String(instruction || '').toLowerCase();
    if (/before|empty stomach/.test(value)) return 'before food';
    if (/after/.test(value)) return 'after food';
    if (/with|meal|food|first bite/.test(value)) return 'with food';
    return 'no restriction';
  }
  function chooseDrug(drug) {
    setSelectedDrug(drug);
    setName(drug.generic_name);
    setShowSuggest(false);
    setMedicineSearch('');
    if (drug.common_strength) setStrength(drug.common_strength);
    if (drug.dosage_form) setForm(drug.dosage_form[0].toUpperCase() + drug.dosage_form.slice(1));
    if (drug.administration_instruction) setLabelDirections(drug.administration_instruction);
    setFoodTiming(catalogFoodTiming(drug.meal_instruction));
  }
  function updateTime(index, value) {
    setTimes((items) => items.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  async function persistSchedule(medicationId, replacedMedicationId = medicationId) {
    localStorage.removeItem('pm_removed_schedule_rows');
    const doseResponse = await api('/api/patient/doses/today');
    const retained = doseResponse.data
      .filter(
        (dose) =>
          ['scheduled', 'snoozed'].includes(dose.status) &&
          dose.medication_id !== replacedMedicationId &&
          dose.medication_id !== medicationId
      )
      .map((dose) => ({
        medication_id: dose.medication_id,
        minute: minuteOfDay(timeValue(dose.scheduled_time)),
        generated_reason: dose.reason || 'existing patient schedule',
      }));
    const newSlots = [...new Set(times)].map((selectedTime) => ({
      medication_id: medicationId,
      minute: minuteOfDay(selectedTime),
      generated_reason: 'patient-selected medicine, time, and date',
    }));
    await api('/api/patient/schedule/confirm', {
      method: 'POST',
      body: { slots: [...retained, ...newSlots] },
    });
    localStorage.setItem('pm_has_medication_schedule', '1');
  }

  function saveSuggestionPreferences(medicationId) {
    let preferences = {};
    try {
      preferences =
        JSON.parse(localStorage.getItem('pm_medicine_schedule_preferences') || '{}') || {};
    } catch {
      preferences = {};
    }
    preferences[medicationId] = {
      labelDirections: labelDirections.trim(),
      foodTiming,
      wakeTime,
      bedtime,
      timingNotes: timingNotes.trim(),
      startDate,
      frequency,
    };
    localStorage.setItem('pm_medicine_schedule_preferences', JSON.stringify(preferences));
  }

  function continueToSchedule(medicationId) {
    saveSuggestionPreferences(medicationId);
    sessionStorage.setItem('pm_medicine_added_success', '1');
    let targetMedicationIds = [];
    if (appendToSuggested) {
      try {
        targetMedicationIds =
          JSON.parse(sessionStorage.getItem('pm_schedule_target_medication_ids') || '[]') || [];
      } catch {
        targetMedicationIds = [];
      }
    }
    sessionStorage.setItem(
      'pm_schedule_target_medication_ids',
      JSON.stringify([...new Set([...targetMedicationIds.map(String), String(medicationId)])])
    );
    const returnToManual = sessionStorage.getItem('pm_return_to_manual_after_add') === '1';
    sessionStorage.removeItem('pm_return_to_manual_after_add');
    if (returnToManual) sessionStorage.setItem('pm_open_manual_after_add', '1');
    navigate(`/patient/medications?setup=${returnToManual ? 'manual' : 'suggested'}`, {
      replace: true,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setResult(null);
    if (
      !name.trim() ||
      !strength.trim() ||
      !form ||
      !frequency ||
      (!addMedicineOnly && (!times.length || !startDate))
    ) {
      setResult({
        kind: 'error',
        message: addMedicineOnly
          ? tr(
              'Complete the medicine details before adding it.',
              'Kumpletuhin ang detalye ng gamot bago ito idagdag.'
            )
          : tr(
              'Complete all medicine and schedule fields before saving.',
              'Kumpletuhin ang detalye ng gamot at iskedyul bago i-save.'
            ),
      });
      return;
    }
    if (!addMedicineOnly && !ongoing && endDate && endDate < startDate) {
      setResult({
        kind: 'error',
        message: tr(
          'End date cannot be before the start date.',
          'Hindi maaaring mauna ang end date sa start date.'
        ),
      });
      return;
    }
    setSubmitting(true);
    try {
      // Suggested schedules are generated on the server, so the routine entered
      // here must be persisted there rather than remaining browser-only state.
      await api('/api/patient/anchors', {
        method: 'PUT',
        body: { wake_anchor: wakeTime, sleep_anchor: bedtime },
      });
      const dosageInstruction = `${strength.trim()}, ${form}`;
      let medicationId = editId;
      let replacedMedicationId = editId;
      const replacingMedicine = Boolean(
        editId && original && name.trim().toLowerCase() !== original.drug_name_raw.toLowerCase()
      );
      const requiresReplacement = replacingMedicine || (editId && original?.source !== 'OTC_SELF');
      if (editId && !requiresReplacement) {
        const response = await api(`/api/patient/medications/${editId}`, {
          method: 'PATCH',
          body: {
            expected_updated_at: original.updated_at,
            dosage_instruction: dosageInstruction,
            label_direction: labelDirections.trim(),
            food_instruction: selectedDrug?.meal_instruction || foodTiming,
            timing_note: timingNotes.trim(),
            frequency,
            is_prn: false,
            start_date: startDate,
            end_date: ongoing ? null : endDate || null,
          },
        });
        setOriginal(response.data.medication);
      } else {
        const response = await api('/api/patient/medications', {
          method: 'POST',
          body: {
            drug_name: name.trim(),
            frequency,
            source: 'OTC_SELF',
            schedule_only: true,
            is_prn: false,
            dosage_instruction: dosageInstruction,
            label_direction: labelDirections.trim(),
            food_instruction: selectedDrug?.meal_instruction || foodTiming,
            timing_note: timingNotes.trim(),
            start_date: startDate,
            end_date: ongoing ? null : endDate || null,
          },
        });
        medicationId = response.data.id;
        if (response.status === 202 || response.data.status !== 'active')
          sessionStorage.setItem('pm_medicine_pending_verification', '1');
        if (editId && original)
          await api(`/api/patient/medications/${editId}/stop`, {
            method: 'POST',
            body: { expected_updated_at: original.updated_at },
          });
        else replacedMedicationId = medicationId;
      }
      if (addMedicineOnly || returnToSuggested) {
        continueToSchedule(medicationId);
        return;
      }
      await persistSchedule(medicationId, replacedMedicationId);
      setSaved({
        name: name.trim(),
        strength: strength.trim(),
        form,
        frequency,
        times: [...new Set(times)],
        startDate,
        endDate: ongoing ? null : endDate,
      });
    } catch (error) {
      if (addMedicineOnly) {
        setResult({
          kind: 'error',
          message:
            error.message ||
            tr(
              'The medicine could not be saved. Please try again.',
              'Hindi na-save ang gamot. Pakisubukang muli.'
            ),
        });
        return;
      }
      setResult({ kind: 'error', message: error.message });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return <div className="pm-med-loading">{tr('Loading medicine…', 'Nilo-load ang gamot…')}</div>;
  return (
    <main className="pm-medication-editor-page">
      <header className="pm-medication-editor-header">
        <button
          aria-label={tr('Back', 'Bumalik')}
          onClick={() => navigate('/patient/medications')}
          type="button"
        >
          ←
        </button>
        <div>
          <h1>
            {editId
              ? tr('Edit Medicine', 'I-edit ang Gamot')
              : tr('Add Medicine', 'Magdagdag ng Gamot')}
          </h1>
          <p>
            {addMedicineOnly
              ? tr(
                  'Add the medicine first. You will create its schedule in the next step.',
                  'Idagdag muna ang gamot. Gagawa ka ng iskedyul sa susunod na hakbang.'
                )
              : tr(
                  'Update the medicine details and reminder schedule.',
                  'I-update ang detalye ng gamot at iskedyul ng paalala.'
                )}
          </p>
        </div>
      </header>
      {addMedicineOnly && <ScheduleFlowSteps current={1} tr={tr} />}
      {result && (
        <div
          className={`pm-banner ${result.kind === 'error' ? 'pm-banner--warn' : 'pm-banner--info'}`}
          role="alert"
        >
          {result.message}
        </div>
      )}
      <form className="pm-medication-detail-form" onSubmit={handleSubmit}>
        {addMedicineOnly && (
          <aside className="pm-add-medicine-instruction" aria-labelledby="schedule-questions-title">
            <span>
              <FieldIcon name="clock" />
            </span>
            <div>
              <h2 id="schedule-questions-title">
                {tr(
                  'Help us suggest the right schedule',
                  'Tulungan kaming magmungkahi ng tamang iskedyul'
                )}
              </h2>
              <p>
                {tr(
                  'Choose the answers below to create suggested reminder times. You can review and edit them before saving.',
                  'Piliin ang mga sagot sa ibaba upang gumawa ng mungkahing oras ng paalala. Maaari mo itong suriin at baguhin bago i-save.'
                )}
              </p>
            </div>
          </aside>
        )}
        <section className="pm-medication-form-row">
          <span className="blue">
            <FieldIcon name="medicine" />
          </span>
          <div>
            <label id="medicine-name-label">{tr('Medicine Name', 'Pangalan ng Gamot')}</label>
            <div className="pm-medication-name-picker">
              <button
                aria-expanded={showSuggest}
                aria-haspopup="listbox"
                aria-labelledby="medicine-name-label medicine-picker-value"
                className="pm-medicine-picker-button"
                id="medicine-picker-value"
                onClick={() => setShowSuggest((open) => !open)}
                type="button"
              >
                <span>{name || tr('Choose a medicine', 'Pumili ng gamot')}</span>
                <FieldIcon name="search" />
              </button>
              {showSuggest && (
                <div className="pm-medication-suggestions pm-medication-suggestions--picker">
                  <label htmlFor="medicine-search">
                    {tr('Search or choose from the list', 'Maghanap o pumili sa listahan')}
                  </label>
                  <div className="pm-medicine-search-control">
                    <FieldIcon name="search" />
                    <input
                      autoComplete="off"
                      id="medicine-search"
                      onChange={(event) => setMedicineSearch(event.target.value)}
                      placeholder={tr('Search medicine (optional)', 'Maghanap ng gamot (opsyonal)')}
                      value={medicineSearch}
                    />
                  </div>
                  <div
                    aria-label={tr('Available medicines', 'Mga gamot na maaaring piliin')}
                    className="pm-medicine-option-list"
                    role="listbox"
                  >
                    {searchingDrugs && (
                      <p>{tr('Loading medicines…', 'Nilo-load ang mga gamot…')}</p>
                    )}
                    {!searchingDrugs && !filteredMedicines.length && (
                      <p>{tr('No medicine found.', 'Walang nahanap na gamot.')}</p>
                    )}
                    {filteredMedicines.map((drug) => (
                      <button
                        aria-selected={selectedDrug?.id === drug.id}
                        key={drug.id}
                        onClick={() => chooseDrug(drug)}
                        role="option"
                        type="button"
                      >
                        <strong>{drug.generic_name}</strong>
                        <small>
                          {[drug.common_strength, drug.dosage_form].filter(Boolean).join(' · ')}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <small>
              {selectedDrug
                ? tr('Verified medicine selected', 'Napili ang verified na gamot')
                : tr(
                    'Open the list and choose the medicine shown on your label.',
                    'Buksan ang listahan at piliin ang gamot na nasa label.'
                  )}
            </small>
          </div>
        </section>
        <section className="pm-medication-form-row">
          <span className="green">
            <FieldIcon name="shield" />
          </span>
          <div>
            <label htmlFor="medicine-strength">{tr('Strength (Dose)', 'Lakas (Dose)')}</label>
            <select
              id="medicine-strength"
              onChange={(event) => setStrength(event.target.value)}
              required
              value={strength}
            >
              <option value="">{tr('Choose a dose', 'Pumili ng dose')}</option>
              {doseOptions.map((dose) => (
                <option key={dose} value={dose}>
                  {dose}
                </option>
              ))}
            </select>
          </div>
        </section>
        <section className="pm-medication-form-row">
          <span className="purple">
            <FieldIcon name="dose" />
          </span>
          <div>
            <label htmlFor="medicine-form">{tr('Form', 'Uri')}</label>
            <select
              id="medicine-form"
              onChange={(event) => setForm(event.target.value)}
              required
              value={form}
            >
              <option value="">{tr('Select form', 'Pumili ng uri')}</option>
              {form && !formOptions.includes(form) && <option>{form}</option>}
              {formOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <small>
              {selectedDrug?.dosage_form
                ? tr(
                    'Form matched to the selected medicine record.',
                    'Ang uri ay batay sa napiling tala ng gamot.'
                  )
                : 'Tablet, Capsule, Syrup, Injection'}
            </small>
          </div>
        </section>
        <section className="pm-medication-form-row">
          <span className="orange">
            <FieldIcon name="calendar" />
          </span>
          <div>
            <label htmlFor="medicine-frequency">
              {tr('How often do you take it?', 'Gaano kadalas ito iniinom?')}
            </label>
            <select
              id="medicine-frequency"
              onChange={(event) => setFreqChoice(event.target.value)}
              value={freqChoice}
            >
              {FREQ_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {language === 'fil' ? option.fil : option.label}
                </option>
              ))}
            </select>
          </div>
        </section>
        {addMedicineOnly && (
          <>
            <section className="pm-medication-form-row">
              <span className="blue">
                <FieldIcon name="medicine" />
              </span>
              <div>
                <label htmlFor="medicine-directions">
                  {tr('Label or Prescription Direction', 'Tagubilin sa Label o Reseta')}
                </label>
                <select
                  id="medicine-directions"
                  onChange={(event) => setLabelDirections(event.target.value)}
                  value={labelDirections}
                >
                  {labelDirections && !DIRECTION_OPTIONS.includes(labelDirections) && (
                    <option value={labelDirections}>{labelDirections}</option>
                  )}
                  {DIRECTION_OPTIONS.map((direction) => (
                    <option key={direction} value={direction}>
                      {direction}
                    </option>
                  ))}
                </select>
              </div>
            </section>
            <section className="pm-medication-form-row">
              <span className="green">
                <FieldIcon name="shield" />
              </span>
              <div>
                <label htmlFor="medicine-food-timing">
                  {tr('Food Instruction', 'Tagubilin sa Pagkain')}
                </label>
                <select
                  id="medicine-food-timing"
                  onChange={(event) => setFoodTiming(event.target.value)}
                  value={foodTiming}
                >
                  <option value="no restriction">
                    {tr('No food instruction', 'Walang tagubilin sa pagkain')}
                  </option>
                  <option value="before food">{tr('Before food', 'Bago kumain')}</option>
                  <option value="with food">{tr('With food', 'Kasabay ng pagkain')}</option>
                  <option value="after food">{tr('After food', 'Pagkatapos kumain')}</option>
                  <option value="empty stomach">
                    {tr('On an empty stomach', 'Walang laman ang tiyan')}
                  </option>
                </select>
              </div>
            </section>
            <section className="pm-medication-form-row">
              <span className="purple">
                <FieldIcon name="clock" />
              </span>
              <fieldset>
                <legend>{tr('Usual Daily Routine', 'Karaniwang Oras Araw-araw')}</legend>
                <div className="pm-schedule-routine">
                  <label htmlFor="medicine-wake-time">
                    {tr('Wake-up time', 'Oras ng paggising')}
                    <select
                      id="medicine-wake-time"
                      onChange={(event) => setWakeTime(event.target.value)}
                      value={wakeTime}
                    >
                      {TIME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="medicine-bedtime">
                    {tr('Bedtime', 'Oras ng pagtulog')}
                    <select
                      id="medicine-bedtime"
                      onChange={(event) => setBedtime(event.target.value)}
                      value={bedtime}
                    >
                      {TIME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <small>
                  {tr(
                    'Used to place reminders at practical times.',
                    'Ginagamit para sa praktikal na oras ng paalala.'
                  )}
                </small>
              </fieldset>
            </section>
            <section className="pm-medication-form-row">
              <span className="orange">
                <FieldIcon name="calendar" />
              </span>
              <div>
                <label htmlFor="medicine-suggestion-start">
                  {tr('Reminder Start Date', 'Petsa ng Simula ng Paalala')}
                </label>
                <input
                  id="medicine-suggestion-start"
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setStartDate(event.target.value)}
                  required
                  type="date"
                  value={startDate}
                />
              </div>
            </section>
            <section className="pm-medication-form-row">
              <span className="blue">
                <FieldIcon name="clock" />
              </span>
              <div>
                <label htmlFor="medicine-timing-notes">
                  {tr(
                    'Other Timing Instruction (Optional)',
                    'Iba Pang Tagubilin sa Oras (Opsyonal)'
                  )}
                </label>
                <select
                  id="medicine-timing-notes"
                  onChange={(event) => setTimingNotes(event.target.value)}
                  value={timingNotes}
                >
                  {TIMING_NOTE_OPTIONS.map((note) => (
                    <option key={note} value={note}>
                      {note}
                    </option>
                  ))}
                </select>
              </div>
            </section>
            <aside className="pm-medication-suggestion-note">
              <FieldIcon name="shield" />
              <p>
                <strong>{tr('Suggestion only', 'Mungkahi lamang')}</strong>
                <span>
                  {tr(
                    'Follow the medicine label and your pharmacist’s instructions. Review every suggested time before saving.',
                    'Sundin ang label ng gamot at tagubilin ng parmasyutiko. Suriin ang bawat mungkahing oras bago i-save.'
                  )}
                </span>
              </p>
            </aside>
          </>
        )}
        {!addMedicineOnly && (
          <>
            <section className="pm-medication-form-row">
              <span className="blue">
                <FieldIcon name="clock" />
              </span>
              <fieldset>
                <legend>{tr('What time(s) do you take it?', 'Anong oras ito iniinom?')}</legend>
                <div className="pm-medication-time-entry">
                  {times.map((selectedTime, index) => (
                    <div key={index}>
                      <FriendlyTimePicker
                        onChange={(value) => updateTime(index, value)}
                        tr={tr}
                        value={selectedTime}
                      />
                      {times.length > 1 && (
                        <button
                          aria-label={tr('Remove time', 'Alisin ang oras')}
                          onClick={() =>
                            setTimes((items) => items.filter((_, itemIndex) => itemIndex !== index))
                          }
                          type="button"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setTimes((items) => [...items, '20:00'])} type="button">
                    + {tr('Add Another Time', 'Magdagdag ng Oras')}
                  </button>
                </div>
              </fieldset>
            </section>
            <section className="pm-medication-form-row">
              <span className="green">
                <FieldIcon name="calendar" />
              </span>
              <div>
                <label htmlFor="medicine-start">
                  {tr('When do you want to start?', 'Kailan mo gustong magsimula?')}
                </label>
                <input
                  id="medicine-start"
                  onChange={(event) => setStartDate(event.target.value)}
                  required
                  type="date"
                  value={startDate}
                />
              </div>
            </section>
            <section className="pm-medication-form-row">
              <span className="orange">
                <FieldIcon name="calendar" />
              </span>
              <div>
                <label htmlFor="medicine-end">
                  {tr(
                    'When do you want to end? (optional)',
                    'Kailan mo gustong matapos? (opsyonal)'
                  )}
                </label>
                <input
                  disabled={ongoing}
                  id="medicine-end"
                  min={startDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  type="date"
                  value={endDate}
                />
                <label className="pm-medication-ongoing">
                  <input
                    checked={ongoing}
                    onChange={(event) => setOngoing(event.target.checked)}
                    type="checkbox"
                  />{' '}
                  {tr('Ongoing (no end date)', 'Tuloy-tuloy (walang end date)')}
                </label>
              </div>
            </section>
          </>
        )}
        <button className="pm-medication-save" disabled={submitting} type="submit">
          {submitting
            ? tr('Saving…', 'Sine-save…')
            : addMedicineOnly
              ? tr('Continue to Create Schedule', 'Magpatuloy sa Paggawa ng Iskedyul')
              : tr('Save Schedule', 'I-save ang Iskedyul')}
        </button>
      </form>
      {saved && (
        <ScheduleSavedModal
          onDone={() => navigate('/patient/medications')}
          onView={() => navigate('/patient/medications?created=1', { replace: true })}
          saved={saved}
          tr={tr}
        />
      )}
    </main>
  );
}

export default function AddMedicine() {
  const [searchParams] = useSearchParams();
  return searchParams.get('edit') ? <LegacyAddMedicine /> : <AutomatedAddMedication />;
}

function ScheduleSavedModal({ saved, onDone, onView, tr }) {
  return (
    <div className="pm-schedule-saved-backdrop" role="presentation">
      <section
        aria-labelledby="schedule-saved-title"
        aria-modal="true"
        className="pm-schedule-saved-modal"
        role="dialog"
      >
        <button
          aria-label={tr('Close', 'Isara')}
          className="pm-schedule-saved-close"
          onClick={onDone}
          type="button"
        >
          <FieldIcon name="close" />
        </button>
        <div className="pm-schedule-saved-check">✓</div>
        <h2 id="schedule-saved-title">{tr('Schedule Saved!', 'Nai-save ang Iskedyul!')}</h2>
        <p>
          {tr(
            'Your medicine schedule has been created successfully.',
            'Matagumpay na nagawa ang iskedyul ng iyong gamot.'
          )}
        </p>
        <article className="pm-schedule-saved-summary">
          <header>
            <span>
              <FieldIcon name="medicine" />
            </span>
            <div>
              <strong>
                {saved.name} <small>{saved.strength}</small>
              </strong>
              <p>{saved.form}</p>
            </div>
          </header>
          <dl>
            <div>
              <dt>{tr('Frequency', 'Dalas')}</dt>
              <dd>{saved.frequency}</dd>
            </div>
            <div>
              <dt>{tr('Time(s)', 'Oras')}</dt>
              <dd>
                {saved.times
                  .map((value) =>
                    new Date(`2000-01-01T${value}`).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  )
                  .join(', ')}
              </dd>
            </div>
            <div>
              <dt>{tr('Start Date', 'Petsa ng Simula')}</dt>
              <dd>
                {new Date(`${saved.startDate}T00:00:00`).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </dd>
            </div>
            <div>
              <dt>{tr('End Date', 'Petsa ng Pagtatapos')}</dt>
              <dd>
                {saved.endDate
                  ? new Date(`${saved.endDate}T00:00:00`).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : tr('Ongoing', 'Tuloy-tuloy')}
              </dd>
            </div>
          </dl>
        </article>
        <aside>
          <FieldIcon name="dose" />{' '}
          {tr(
            'You will receive reminders for your doses.',
            'Makakatanggap ka ng mga paalala para sa iyong dose.'
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
