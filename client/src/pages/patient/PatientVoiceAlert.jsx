import { BellRing, CheckCircle2, Clock3, ScanLine, Volume2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { speak } from '../../lib/notifications.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

export default function PatientVoiceAlert({ alert, dose, onTake, onScan, onSnooze, onDismiss }) {
  const { language } = useLanguage();
  const tr = (en, fil) => (language === 'fil' ? fil : en);
  const [speaking, setSpeaking] = useState(false);
  const medicine = dose?.drug_name || alert?.medicine || tr('your medicine', 'iyong gamot');
  const reminderText = tr(
    `It’s time to take your ${medicine}.`,
    `Oras nang inumin ang ${medicine}.`
  );

  const playReminder = useCallback(() => {
    if (!alert) return;
    speak(reminderText, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, [alert, reminderText]);

  useEffect(() => {
    playReminder();
    return () => window.speechSynthesis?.cancel();
  }, [playReminder]);

  if (!alert) return null;

  return (
    <section
      aria-labelledby="medicine-voice-reminder-title"
      className="pm-dashboard-card pm-voice-card pm-caregiver-voice-card"
      role="status"
    >
      <div className="pm-section-heading">
        <h2 id="medicine-voice-reminder-title">
          <span>
            <BellRing />
          </span>{' '}
          {tr('Medicine Voice Reminder', 'Paalalang may Boses')}
        </h2>
        <div className="pm-caregiver-voice-card__tools">
          <span className="pm-active-pill">{tr('Active', 'Aktibo')}</span>
          <button
            aria-label={tr('Dismiss voice reminder', 'Isara ang paalala')}
            onClick={onDismiss}
            type="button"
          >
            <X />
          </button>
        </div>
      </div>
      <div className="pm-reminder">
        <button
          aria-label={
            speaking
              ? tr('Voice reminder is playing', 'Pinapatugtog ang paalala')
              : tr('Play medicine voice reminder', 'Patugtugin ang paalala')
          }
          className={`pm-mic ${speaking ? 'speaking' : ''}`}
          onClick={playReminder}
          type="button"
        >
          <Volume2 />
        </button>
        <div className="pm-reminder__copy">
          <small>{tr('Scheduled medicine reminder', 'Naka-iskedyul na paalala')}</small>
          <h3>“{reminderText}”</h3>
          <p>
            {tr(
              'Please check your medicine before taking it.',
              'Suriin muna ang gamot bago ito inumin.'
            )}
          </p>
        </div>
      </div>
      <div className={`pm-wave ${speaking ? 'speaking' : ''}`} aria-hidden="true">
        {Array.from({ length: 40 }, (_, index) => (
          <span key={index} style={{ '--wave-index': index }} />
        ))}
      </div>
      <button className="pm-action-button pm-action-button--outline" onClick={onTake} type="button">
        <CheckCircle2 /> {tr('Mark as Taken', 'Markahan bilang Nainom')}
      </button>
      <button className="pm-action-button" onClick={onScan} type="button">
        <ScanLine /> {tr('Scan Medicine', 'I-scan ang Gamot')}
      </button>
      <small className="pm-scan-hint">
        {tr('Scan for a more accurate record.', 'I-scan para sa mas tumpak na tala.')}
      </small>
      <button className="pm-caregiver-voice-card__snooze" onClick={onSnooze} type="button">
        <Clock3 /> {tr('Snooze for 15 minutes', 'Ipagpaliban nang 15 minuto')}
      </button>
    </section>
  );
}
