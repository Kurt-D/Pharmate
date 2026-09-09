import {
  BellRing,
  Languages,
  Link2,
  LogOut,
  Moon,
  ShieldCheck,
  Touchpad,
  UserRound,
  Volume2,
} from 'lucide-react';
import '../../styles/caregiver-settings.css';
import { useState } from 'react';
import { useAccessibility } from '../../context/AccessibilityContext.jsx';

const ACCESSIBILITY_ROWS = [
  ['ttsEnabled', 'Read alerts aloud', 'Hear medicine alerts spoken aloud.', Volume2],
  ['largeTouch', 'Larger buttons', 'Make buttons easier to tap.', Touchpad],
  ['darkMode', 'Dark mode', 'Use a darker screen.', Moon],
  [
    'enhancedFocus',
    'Clear keyboard focus',
    'See which control is selected when using a keyboard.',
    BellRing,
  ],
];

export default function CaregiverSettings({
  profile,
  patients = [],
  language,
  onLanguage,
  onAddPatient,
  onSelectPatient,
  onLogout,
  accessibility,
  onAccessibility,
}) {
  const { storageError } = useAccessibility();
  const [languageError, setLanguageError] = useState('');
  function changeLanguage(value) {
    try {
      onLanguage(value);
      setLanguageError('');
    } catch {
      setLanguageError('Language could not be saved. Please try again.');
    }
  }
  return (
    <main className="cg-settings">
      <header>
        <h1>Profile &amp; Settings</h1>
        <p>Your account, care connections, and app preferences.</p>
      </header>
      <section className="cs-group cs-account" aria-label="Caregiver account">
        <span className="cs-icon">
          <UserRound size={26} aria-hidden="true" />
        </span>
        <div>
          <h2>{profile?.display_name || profile?.full_name || 'Caregiver'}</h2>
          <p>{profile?.email || 'Account details unavailable'}</p>
          <span className="cs-role">Caregiver</span>
        </div>
      </section>
      <section className="cs-group" aria-labelledby="cs-patients">
        <h2 id="cs-patients">Connected patients</h2>
        <p>Select a patient to open their care dashboard.</p>
        {patients.length ? (
          patients.map((patient) => (
            <button
              type="button"
              className="cs-patient"
              key={patient.patient_code}
              onClick={() => onSelectPatient(patient.patient_code)}
            >
              <ShieldCheck size={21} aria-hidden="true" />
              <span>
                <strong>
                  {patient.relationship || 'Patient'} · {patient.patient_code}
                </strong>
                <small>
                  {patient.status && patient.status !== 'active'
                    ? patient.status
                    : 'Connection active'}
                </small>
                <small>
                  {patient.linked_at && Number.isFinite(new Date(patient.linked_at).getTime())
                    ? 'Connected ' +
                      new Date(patient.linked_at).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'Connection date unavailable'}
                </small>
              </span>
            </button>
          ))
        ) : (
          <p>No connected patients yet. Link a patient to start monitoring.</p>
        )}
        <button className="cs-link" type="button" onClick={onAddPatient}>
          <Link2 size={19} aria-hidden="true" />
          Link a patient
        </button>
      </section>
      <section className="cs-group cs-language">
        <label htmlFor="cs-language">
          <Languages size={22} aria-hidden="true" />
          App language
        </label>
        <select
          id="cs-language"
          value={language}
          onChange={(event) => changeLanguage(event.target.value)}
        >
          <option value="en">English</option>
          <option value="fil">Filipino</option>
        </select>
        {languageError && <p role="alert">{languageError}</p>}
      </section>
      <section className="cs-group" aria-labelledby="cs-accessibility">
        <h2 id="cs-accessibility">Alerts &amp; Accessibility</h2>
        {storageError && <p role="alert">{storageError}</p>}
        <p>Display and accessibility preferences are saved on this device.</p>
        {ACCESSIBILITY_ROWS.map(([key, title, description, Icon]) => (
          <div className="cs-row" key={key}>
            <span className="cs-icon">
              <Icon size={21} aria-hidden="true" />
            </span>
            <span className="cs-row-text">
              <strong id={`cs-${key}`}>{title}</strong>
              <small id={`cs-${key}-help`}>{description}</small>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(accessibility?.[key])}
              aria-labelledby={`cs-${key}`}
              aria-describedby={`cs-${key}-help`}
              className="cs-switch"
              onClick={() => onAccessibility(key, !accessibility?.[key])}
            >
              <span className="cs-switch-track" aria-hidden="true">
                <i />
              </span>
              <span aria-hidden="true">{accessibility?.[key] ? 'On' : 'Off'}</span>
            </button>
          </div>
        ))}
      </section>
      <button type="button" className="cs-signout" onClick={onLogout}>
        <LogOut size={21} aria-hidden="true" />
        Sign out
      </button>
    </main>
  );
}
