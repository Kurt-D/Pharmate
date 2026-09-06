import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import '../styles/safety-onboarding.css';

const DEFAULTS = {
  wake_anchor: '07:00',
  sleep_anchor: '22:00',
  breakfast_anchor: '07:30',
  lunch_anchor: '12:00',
  dinner_anchor: '18:30',
};
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
    help: 'Enter “None” if you have no known allergies.',
    type: 'textarea',
    placeholder: 'Example: aspirin, penicillin, or none',
  },
  {
    key: 'conditions',
    title: 'Do you have any health conditions?',
    help: 'Enter “None” if you have no known conditions.',
    type: 'textarea',
    placeholder: 'Example: hypertension, diabetes, or none',
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
    help: 'This helps detect possible duplicate ingredients and interactions.',
    type: 'textarea',
    placeholder: 'Enter medicine names, or none',
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

export default function AnchorOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(EMPTY);
  const [anchors, setAnchors] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const question = QUESTIONS[step];
  useEffect(() => {
    Promise.allSettled([api('/api/patient/safety-profile'), api('/api/patient/anchors')]).then(
      ([safety, routine]) => {
        if (safety.status === 'fulfilled')
          setProfile((current) => ({ ...current, ...safety.value.data }));
        if (routine.status === 'fulfilled')
          setAnchors(
            Object.fromEntries(
              Object.keys(DEFAULTS).map((key) => [
                key,
                String(routine.value.data[key] || DEFAULTS[key]).slice(0, 5),
              ])
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
      navigate('/patient/today', { replace: true });
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
  if (loading) return <main className="pm-safety-loading">Loading your safety profile…</main>;
  return (
    <main className="pm-safety-page">
      <section className="pm-safety-card">
        <header>
          <span>
            <ShieldCheck /> PharMate Safety Profile
          </span>
          <div className="pm-safety-progress">
            <i style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }} />
          </div>
          <small>
            Question {step + 1} of {QUESTIONS.length}
          </small>
        </header>
        <button
          className="pm-safety-back"
          disabled={step === 0 || saving}
          onClick={() => setStep((value) => value - 1)}
        >
          <ArrowLeft /> Back
        </button>
        <div className="pm-safety-question">
          <h1>{question.title}</h1>
          <p>{question.help}</p>
          {question.type === 'date' && (
            <input
              type="date"
              value={profile[question.key]}
              onChange={(e) => setProfile({ ...profile, [question.key]: e.target.value })}
            />
          )}{' '}
          {question.type === 'number' && (
            <div className="pm-safety-number">
              <input
                min="2"
                max="500"
                step="0.1"
                type="number"
                value={profile[question.key]}
                onChange={(e) => setProfile({ ...profile, [question.key]: e.target.value })}
              />
              <b>kg</b>
            </div>
          )}{' '}
          {question.type === 'textarea' && (
            <textarea
              autoFocus
              rows="4"
              placeholder={question.placeholder}
              value={profile[question.key]}
              onChange={(e) => setProfile({ ...profile, [question.key]: e.target.value })}
            />
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
                <label key={key}>
                  <span>{label}</span>
                  <input
                    type="time"
                    value={anchors[key]}
                    onChange={(e) => setAnchors({ ...anchors, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
        {error && (
          <div className="pm-safety-error" role="alert">
            {error}
          </div>
        )}
        <footer>
          <button className="pm-safety-skip" disabled={saving} onClick={next}>
            Skip for now
          </button>
          <button className="pm-safety-next" disabled={saving} onClick={next}>
            {saving ? 'Saving…' : step === QUESTIONS.length - 1 ? 'Save profile' : 'Next'}{' '}
            {!saving && <ArrowRight />}
          </button>
        </footer>
        <p className="pm-safety-note">
          Your answers improve safety checks but do not replace your medicine label or a health
          professional.
        </p>
      </section>
    </main>
  );
}
