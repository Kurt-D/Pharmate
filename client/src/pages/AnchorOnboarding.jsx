import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Minus,
  Pencil,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import privacyConsentIllustration from '../assets/privacy-consent-illustration.png';
import safetyDateIllustration from '../assets/safety-date-illustration.png';
import safetyWeightIllustration from '../assets/safety-weight-illustration.png';
import safetyAllergyIllustration from '../assets/safety-allergy-illustration.png';
import safetyConditionsIllustration from '../assets/safety-conditions-illustration.png';
import safetyPregnancyIllustration from '../assets/safety-pregnancy-illustration.png';
import safetySupplementsIllustration from '../assets/safety-supplements-illustration.png';
import safetyRoutineIllustration from '../assets/safety-routine-illustration.png';
import safetyKidneyIllustration from '../assets/safety-kidney-illustration.png';
import safetyLiverIllustration from '../assets/safety-liver-illustration.png';
import safetyCaregiverIllustration from '../assets/safety-caregiver-illustration.png';
import '../styles/safety-onboarding.css';

const DEFAULTS = {
  wake_anchor: '07:00',
  sleep_anchor: '22:00',
  breakfast_anchor: '07:30',
  lunch_anchor: '12:00',
  dinner_anchor: '18:30',
};
function minutesForTime(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) ? hours * 60 + minutes : null;
}
function timeAfter(value, minutesToAdd = 30) {
  const minutes = minutesForTime(value);
  if (minutes === null) return DEFAULTS.breakfast_anchor;
  const next = (minutes + minutesToAdd) % (24 * 60);
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
}
function normalizeRoutineAnchors(values) {
  const next = { ...DEFAULTS, ...values };
  const wake = minutesForTime(next.wake_anchor);
  const breakfast = minutesForTime(next.breakfast_anchor);
  if (wake !== null && (breakfast === null || breakfast <= wake)) {
    next.breakfast_anchor = timeAfter(next.wake_anchor);
  }
  return next;
}
const EMPTY = {
  date_of_birth: '',
  weight_kg: '',
  allergies: '',
  conditions: '',
  kidney_status: 'UNANSWERED',
  liver_status: 'UNANSWERED',
  pregnancy_status: 'UNANSWERED',
  current_medicines: '',
  caregiver_alerts: false,
};
const QUESTIONS = [
  {
    key: 'date_of_birth',
    title: 'What is your date of birth?',
    help: 'Age helps PharMate check medicine-label restrictions.',
    type: 'date',
  },
  {
    key: 'weight_kg',
    title: 'What is your current weight?',
    help: 'You may skip this. Some medicine directions depend on weight.',
    type: 'number',
  },
  {
    key: 'allergies',
    title: 'Do you have any medicine allergies?',
    help: 'Select all that apply. Choose Not sure if you need help checking.',
    type: 'multi-choice',
    choices: [
      'None known',
      'Penicillin',
      'Aspirin or pain relievers',
      'Sulfa medicines',
      'Other',
      'Not sure',
    ],
  },
  {
    key: 'conditions',
    title: 'Do you have any health conditions?',
    help: 'Select all that apply.',
    type: 'multi-choice',
    choices: [
      'None known',
      'High blood pressure',
      'Diabetes',
      'Heart condition',
      'Asthma',
      'Other',
      'Not sure',
    ],
  },
  {
    key: 'kidney_status',
    title: 'Do you have kidney problems?',
    help: 'Choose Unsure if you do not know.',
    type: 'choice',
    choices: [
      ['YES', 'Yes'],
      ['NO', 'No'],
      ['UNSURE', 'Unsure'],
    ],
  },
  {
    key: 'liver_status',
    title: 'Do you have liver problems?',
    help: 'Choose Unsure if you do not know.',
    type: 'choice',
    choices: [
      ['YES', 'Yes'],
      ['NO', 'No'],
      ['UNSURE', 'Unsure'],
    ],
  },
  {
    key: 'pregnancy_status',
    title: 'Which option applies to you?',
    help: 'This is used only for medicine safety checks.',
    type: 'choice',
    choices: [
      ['PREGNANT', 'Pregnant'],
      ['BREASTFEEDING', 'Breastfeeding'],
      ['NEITHER', 'Neither'],
      ['NOT_APPLICABLE', 'Not applicable'],
      ['UNSURE', 'Unsure'],
    ],
  },
  {
    key: 'current_medicines',
    title: 'What medicines or supplements do you currently use?',
    help: 'Select the types you use. Your saved medication list keeps the exact names.',
    type: 'multi-choice',
    choices: [
      'None',
      'Prescription medicines',
      'Over-the-counter medicines',
      'Vitamins or supplements',
      'Other',
      'Not sure',
    ],
  },
  {
    key: 'routine',
    title: 'When do you normally wake, eat, and sleep?',
    help: 'PharMate uses these times to place reminders into your routine.',
    type: 'routine',
  },
  {
    key: 'caregiver_alerts',
    title: 'Would you like caregiver safety alerts?',
    help: 'You can change this later after connecting a caregiver.',
    type: 'boolean',
  },
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function SafetyDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => String(option.value) === String(value));
  return (
    <div className="pm-safety-select">
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>{selected?.label}</span>
        <ChevronDown />
      </button>
      {open && (
        <div className="pm-safety-select__menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              aria-selected={String(option.value) === String(value)}
              className={String(option.value) === String(value) ? 'selected' : ''}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SafetyDatePicker({ value, onChange }) {
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date();
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const firstDay = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index);
  const setMonth = (offset) => setView(new Date(view.getFullYear(), view.getMonth() + offset, 1));
  const chooseDay = (day) => {
    const date = `${view.getFullYear()}-${String(view.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(date);
  };
  return (
    <div className="pm-safety-calendar" aria-label="Choose date of birth">
      <div className="pm-safety-calendar-nav">
        <button type="button" onClick={() => setMonth(-1)} aria-label="Previous month">
          <ChevronLeft />
        </button>
        <div>
          <SafetyDropdown
            label="Birth month"
            value={view.getMonth()}
            options={MONTHS.map((month, index) => ({ label: month, value: index }))}
            onChange={(month) => setView(new Date(view.getFullYear(), Number(month), 1))}
          />
          <SafetyDropdown
            label="Birth year"
            value={view.getFullYear()}
            options={years.map((year) => ({ label: String(year), value: year }))}
            onChange={(year) => setView(new Date(Number(year), view.getMonth(), 1))}
          />
        </div>
        <button
          type="button"
          onClick={() => setMonth(1)}
          disabled={view.getFullYear() === currentYear && view.getMonth() === new Date().getMonth()}
          aria-label="Next month"
        >
          <ChevronRight />
        </button>
      </div>
      <div className="pm-safety-calendar-grid pm-safety-calendar-weekdays">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <b key={day}>{day}</b>
        ))}
      </div>
      <div className="pm-safety-calendar-grid">
        {Array.from({ length: firstDay }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const date = `${view.getFullYear()}-${String(view.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return (
            <button
              type="button"
              key={day}
              className={selected === date ? 'selected' : ''}
              onClick={() => chooseDay(day)}
              aria-pressed={selected === date}
            >
              {day}
            </button>
          );
        })}
      </div>
      <strong className="pm-safety-calendar-selected">
        {selected
          ? `Selected: ${new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'long' })}`
          : 'Select your birth date'}
      </strong>
    </div>
  );
}

function SafetyTimePicker({ value, label, onChange }) {
  const [open, setOpen] = useState(false);
  const [hourText = '08', minuteText = '00'] = String(value || '08:00').split(':');
  const hour24 = Number(hourText);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  const minutes = Array.from(
    new Set([minuteText, ...Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))])
  ).sort();
  function update(nextHour = hour12, nextMinute = minuteText, nextPeriod = period) {
    let converted = Number(nextHour) % 12;
    if (nextPeriod === 'PM') converted += 12;
    onChange(`${String(converted).padStart(2, '0')}:${nextMinute}`);
  }
  const display = new Date(`2000-01-01T${String(value || '08:00')}:00`).toLocaleTimeString(
    undefined,
    { hour: 'numeric', minute: '2-digit' }
  );
  return (
    <div className={`pm-safety-time ${open ? 'open' : ''}`}>
      <button
        className="pm-safety-time-summary"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Clock />
        <span>{display}</span>
        <small>{open ? 'Close' : 'Change'}</small>
      </button>
      {open && (
        <div className="pm-safety-time-panel" aria-label={`Choose ${label} time`}>
          <label>
            <span>Hour</span>
            <select value={hour12} onChange={(e) => update(e.target.value)}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                <option key={hour}>{hour}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Minute</span>
            <select value={minuteText} onChange={(e) => update(hour12, e.target.value)}>
              {minutes.map((minute) => (
                <option key={minute}>{minute}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Period</span>
            <select value={period} onChange={(e) => update(hour12, minuteText, e.target.value)}>
              <option>AM</option>
              <option>PM</option>
            </select>
          </label>
          <button className="pm-safety-time-done" type="button" onClick={() => setOpen(false)}>
            <Check /> Done
          </button>
        </div>
      )}
    </div>
  );
}

export default function AnchorOnboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editingFromProfile = searchParams.get('from') === 'profile';
  const returningToMedicationSetup = searchParams.get('return') === 'medication-setup';
  const requestedStep = Number(searchParams.get('step'));
  const [step, setStep] = useState(() =>
    Number.isInteger(requestedStep) && requestedStep >= 0 && requestedStep < QUESTIONS.length
      ? requestedStep
      : 0
  );
  const [profile, setProfile] = useState(EMPTY);
  const [anchors, setAnchors] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(editingFromProfile);
  const [consentChecked, setConsentChecked] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const question = QUESTIONS[step];
  useEffect(() => {
    Promise.allSettled([api('/api/patient/safety-profile'), api('/api/patient/anchors')]).then(
      ([safety, routine]) => {
        if (safety.status === 'fulfilled')
          setProfile((current) => ({ ...current, ...safety.value.data }));
        if (routine.status === 'fulfilled')
          setAnchors(
            normalizeRoutineAnchors(
              Object.fromEntries(
              Object.keys(DEFAULTS).map((key) => [
                key,
                String(routine.value.data[key] || DEFAULTS[key]).slice(0, 5),
              ])
              )
            )
          );
        setLoading(false);
      }
    );
  }, []);
  async function finish() {
    setSaving(true);
    setError('');
    try {
      await api('/api/patient/safety-profile', {
        method: 'PUT',
        body: { ...profile, profile_completed: true },
      });
      await api('/api/patient/anchors', { method: 'PUT', body: anchors });
      navigate(
        editingFromProfile
          ? '/patient/profile'
          : returningToMedicationSetup
            ? '/patient/medications/add?resumeSafety=1'
            : '/patient/today',
        { replace: true }
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  function next() {
    if (step === QUESTIONS.length - 1) finish();
    else setStep((value) => value + 1);
  }
  function previousQuestion() {
    if (step > 0) {
      setStep((value) => value - 1);
      return;
    }
    if (!editingFromProfile) setPrivacyAccepted(false);
  }
  function toggleChoice(key, value) {
    const exclusive = ['None', 'None known', 'Not sure'];
    const selected = String(profile[key] || '')
      .split(', ')
      .filter(Boolean);
    let updated;
    const isSelected = selected.some((item) => item === value || item.startsWith(`${value}:`));
    if (exclusive.includes(value)) updated = isSelected ? [] : [value];
    else {
      const withoutExclusive = selected.filter((item) => !exclusive.includes(item));
      updated = isSelected
        ? withoutExclusive.filter((item) => item !== value && !item.startsWith(`${value}:`))
        : [...withoutExclusive, value];
    }
    setProfile({ ...profile, [key]: updated.join(', ') });
  }
  function updateOtherChoice(key, detail) {
    const accessibleDetail = detail.replaceAll(',', ';');
    const selected = String(profile[key] || '')
      .split(', ')
      .filter(Boolean)
      .filter((item) => item !== 'Other' && !item.startsWith('Other:'));
    setProfile({
      ...profile,
      [key]: [...selected, accessibleDetail.trim() ? `Other: ${accessibleDetail}` : 'Other'].join(
        ', '
      ),
    });
  }
  if (loading) return <main className="pm-safety-loading">Loading your safety profile…</main>;
  return (
    <main className="pm-safety-page">
      <section className={`pm-safety-card ${!privacyAccepted ? 'pm-safety-card--consent' : ''}`}>
        <header>
          <span>
            <ShieldCheck /> PharMate Safety Profile
          </span>
          <div className="pm-safety-progress">
            <i style={{ width: `${privacyAccepted ? ((step + 1) / QUESTIONS.length) * 100 : 10}%` }} />
          </div>
          <small>{privacyAccepted ? `Question ${step + 1} of ${QUESTIONS.length}` : 'Before we begin'}</small>
        </header>
        <button
          className="pm-safety-back"
          disabled={saving}
          onClick={() => setLeaveConfirmOpen(true)}
        >
          <ArrowLeft /> Return to Sign in
        </button>
        {leaveConfirmOpen && (
          <div
            aria-labelledby="leave-confirm-title"
            aria-modal="true"
            className="pm-safety-leave-dialog"
            role="dialog"
          >
            <div className="pm-safety-leave-dialog__panel">
              <h2 id="leave-confirm-title">Return to sign in?</h2>
              <p>Your progress on this safety profile will not be saved.</p>
              <div>
                <button onClick={() => setLeaveConfirmOpen(false)} type="button">
                  Stay here
                </button>
                <button onClick={() => navigate('/login?view=signin')} type="button">
                  Yes, return
                </button>
              </div>
            </div>
          </div>
        )}
        {!privacyAccepted ? (
          <section className="pm-safety-consent" aria-labelledby="safety-consent-title">
            <div className="pm-safety-consent__visual" aria-hidden="true">
              <img src={privacyConsentIllustration} alt="" />
            </div>
            <div className="pm-safety-consent__content">
              <h1 id="safety-consent-title">Your privacy matters</h1>
              <p>Your answers help personalize your care.</p>
              <ul>
                <li>
                  <span className="pm-safety-consent__benefit-icon"><CalendarDays /></span>
                  <span>Personalized reminders and safety checks.</span>
                </li>
                <li>
                  <span className="pm-safety-consent__benefit-icon"><ShieldCheck /></span>
                  <span>Used only to support your care.</span>
                </li>
                <li>
                  <span className="pm-safety-consent__benefit-icon"><Pencil /></span>
                  <span>Update your details anytime.</span>
                </li>
              </ul>
              <label className="pm-safety-consent__check">
                <input
                  checked={consentChecked}
                  onChange={(event) => setConsentChecked(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  I agree to the <a href="/privacy">Privacy Terms</a>.
                </span>
              </label>
            </div>
          </section>
        ) : (
        <div
          className={`pm-safety-question pm-safety-question--${question.type} pm-safety-question--${question.key}`}
        >
          <div className="pm-safety-question__intro">
            <div className="pm-safety-question__copy">
              <h1>
                {question.key === 'caregiver_alerts' ? (
                  <>
                    Would you like caregiver<br />
                    safety alerts?
                  </>
                ) : question.title}
              </h1>
              <p>{question.help}</p>
            </div>
            {question.type === 'date' && (
              <img
                className="pm-safety-question__art"
                src={safetyDateIllustration}
                alt=""
                aria-hidden="true"
              />
            )}
            {question.type === 'number' && (
              <img
                className="pm-safety-question__art pm-safety-question__art--weight"
                src={safetyWeightIllustration}
                alt=""
                aria-hidden="true"
              />
            )}
            {question.key === 'allergies' && (
              <img
                className="pm-safety-question__art pm-safety-question__art--allergy"
                src={safetyAllergyIllustration}
                alt=""
                aria-hidden="true"
              />
            )}
            {question.key === 'conditions' && (
              <img
                className="pm-safety-question__art pm-safety-question__art--conditions"
                src={safetyConditionsIllustration}
                alt=""
                aria-hidden="true"
              />
            )}
            {question.key === 'pregnancy_status' && (
              <img
                className="pm-safety-question__art pm-safety-question__art--pregnancy"
                src={safetyPregnancyIllustration}
                alt=""
                aria-hidden="true"
              />
            )}
            {question.key === 'current_medicines' && (
              <img
                className="pm-safety-question__art pm-safety-question__art--supplements"
                src={safetySupplementsIllustration}
                alt=""
                aria-hidden="true"
              />
            )}
            {question.key === 'routine' && (
              <img
                className="pm-safety-question__art pm-safety-question__art--routine"
                src={safetyRoutineIllustration}
                alt=""
                aria-hidden="true"
              />
            )}
            {question.key === 'kidney_status' && (
              <img
                className="pm-safety-question__art pm-safety-question__art--kidney"
                src={safetyKidneyIllustration}
                alt=""
                aria-hidden="true"
              />
            )}
            {question.key === 'liver_status' && (
              <img
                className="pm-safety-question__art pm-safety-question__art--liver"
                src={safetyLiverIllustration}
                alt=""
                aria-hidden="true"
              />
            )}
            {question.key === 'caregiver_alerts' && (
              <img
                className="pm-safety-question__art pm-safety-question__art--caregiver"
                src={safetyCaregiverIllustration}
                alt=""
                aria-hidden="true"
              />
            )}
          </div>
          {question.type === 'date' && (
            <SafetyDatePicker
              value={profile[question.key]}
              onChange={(value) => setProfile({ ...profile, [question.key]: value })}
            />
          )}{' '}
          {question.type === 'number' && (
            <div className="pm-safety-weight">
              <label className="pm-safety-weight-value">
                <span className="visually-hidden">Weight in kilograms</span>
                <input
                  type="number"
                  min="20"
                  max="300"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="Enter weight"
                  value={profile.weight_kg}
                  onChange={(event) => setProfile({ ...profile, weight_kg: event.target.value })}
                  onBlur={(event) => {
                    if (!event.target.value) return;
                    const value = Math.min(300, Math.max(20, Number(event.target.value)));
                    setProfile({ ...profile, weight_kg: String(value) });
                  }}
                />
                <b>kg</b>
              </label>
              <div className="pm-safety-weight-controls">
                <button
                  aria-label="Decrease weight"
                  onClick={() =>
                    setProfile({
                      ...profile,
                      weight_kg: String(Math.max(20, Number(profile.weight_kg || 60) - 1)),
                    })
                  }
                >
                  <Minus />
                </button>
                <button
                  aria-label="Increase weight"
                  onClick={() =>
                    setProfile({
                      ...profile,
                      weight_kg: String(Math.min(300, Number(profile.weight_kg || 59) + 1)),
                    })
                  }
                >
                  <Plus />
                </button>
              </div>
              <button
                className="pm-safety-unsure"
                onClick={() => setProfile({ ...profile, weight_kg: '' })}
              >
                I don&apos;t know my weight
              </button>
            </div>
          )}{' '}
          {question.type === 'multi-choice' && (
            <div className="pm-safety-choices">
              {question.choices.map((value) => {
                const answers = String(profile[question.key] || '').split(', ');
                const selected = answers.some(
                  (item) => item === value || item.startsWith(`${value}:`)
                );
                return (
                  <button
                    className={selected ? 'selected' : ''}
                    key={value}
                    onClick={() => toggleChoice(question.key, value)}
                  >
                    {selected && <Check />}
                    {value}
                  </button>
                );
              })}
              {String(profile[question.key] || '')
                .split(', ')
                .some((item) => item === 'Other' || item.startsWith('Other:')) && (
                <label className="pm-safety-other">
                  <span>Please tell us what was not listed</span>
                  <input
                    aria-label="Enter another answer"
                    autoFocus
                    placeholder="Type your answer here"
                    value={
                      String(profile[question.key] || '')
                        .split(', ')
                        .find((item) => item.startsWith('Other:'))
                        ?.slice(6)
                        .trim() || ''
                    }
                    onChange={(event) => updateOtherChoice(question.key, event.target.value)}
                  />
                </label>
              )}
            </div>
          )}{' '}
          {question.type === 'choice' && (
            <div className="pm-safety-choices">
              {question.choices.map(([value, label]) => (
                <button
                  className={profile[question.key] === value ? 'selected' : ''}
                  key={value}
                  onClick={() => setProfile({ ...profile, [question.key]: value })}
                >
                  {profile[question.key] === value && <Check />}
                  {label}
                </button>
              ))}
            </div>
          )}{' '}
          {question.type === 'boolean' && (
            <div className="pm-safety-choices">
              <button
                className={profile.caregiver_alerts ? 'selected' : ''}
                onClick={() => setProfile({ ...profile, caregiver_alerts: true })}
              >
                Yes
              </button>
              <button
                className={!profile.caregiver_alerts ? 'selected' : ''}
                onClick={() => setProfile({ ...profile, caregiver_alerts: false })}
              >
                Not now
              </button>
            </div>
          )}{' '}
          {question.type === 'routine' && (
            <div className="pm-safety-routine">
              {Object.entries({
                wake_anchor: 'Wake',
                breakfast_anchor: 'Breakfast',
                lunch_anchor: 'Lunch',
                dinner_anchor: 'Dinner',
                sleep_anchor: 'Sleep',
              }).map(([key, label]) => (
                <div className="pm-safety-routine-row" key={key}>
                  <strong>{label}</strong>
                  <SafetyTimePicker
                    label={label}
                    value={anchors[key]}
                    onChange={(value) => {
                      const next = { ...anchors, [key]: value };
                      if (
                        key === 'wake_anchor' &&
                        minutesForTime(next.breakfast_anchor) <= minutesForTime(value)
                      ) {
                        next.breakfast_anchor = timeAfter(value);
                      }
                      if (
                        key === 'breakfast_anchor' &&
                        minutesForTime(value) <= minutesForTime(next.wake_anchor)
                      ) {
                        next.breakfast_anchor = timeAfter(next.wake_anchor);
                      }
                      setAnchors(next);
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        )}
        {error && (
          <div className="pm-safety-error" role="alert">
            {error}
          </div>
        )}
        {!privacyAccepted ? (
          <footer className="pm-safety-consent__footer">
            <button
              className="pm-safety-next"
              disabled={!consentChecked}
              onClick={() => setPrivacyAccepted(true)}
              type="button"
            >
              Continue <ArrowRight />
            </button>
          </footer>
        ) : (
        <footer>
          <button
            className="pm-safety-skip"
            disabled={saving || (step === 0 && editingFromProfile)}
            onClick={previousQuestion}
          >
            <ArrowLeft /> Previous question
          </button>
          <button className="pm-safety-next" disabled={saving} onClick={next}>
            {saving ? 'Saving…' : step === QUESTIONS.length - 1 ? 'Save profile' : 'Next'}{' '}
            {!saving && <ArrowRight />}
          </button>
        </footer>
        )}
      </section>
    </main>
  );
}
