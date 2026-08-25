import { BellRing, CheckCircle2, Clock3, Pill, Volume2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { speak } from '../../lib/notifications.js';

export default function PatientVoiceAlert({ alert, dose, onTake, onSnooze, onDismiss }) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!alert?.message) return;
    speak(alert.message, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
    return () => window.speechSynthesis?.cancel();
  }, [alert]);

  if (!alert) return null;
  const medicine = dose?.drug_name || alert.medicine || 'your scheduled medicine';

  return (
    <div className="pm-caregiver-alert-backdrop" role="presentation">
      <section
        aria-describedby="caregiver-voice-alert-message"
        aria-labelledby="caregiver-voice-alert-title"
        aria-modal="true"
        className="pm-caregiver-alert"
        role="alertdialog"
      >
        <header>
          <span>
            <BellRing />
          </span>
          <div>
            <small>Caregiver voice alert</small>
            <h2 id="caregiver-voice-alert-title">
              Paalala mula kay {alert.caregiverName || 'your caregiver'}
            </h2>
          </div>
          <button aria-label="Close caregiver reminder" onClick={onDismiss} type="button">
            <X />
          </button>
        </header>
        <div className="pm-caregiver-alert__medicine">
          <span className={speaking ? 'speaking' : ''}>
            <Pill />
          </span>
          <div>
            <small>Medicine reminder</small>
            <strong>{medicine}</strong>
            {dose?.scheduled_time && (
              <time>
                {new Date(dose.scheduled_time).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
            )}
          </div>
        </div>
        <blockquote id="caregiver-voice-alert-message">“{alert.message}”</blockquote>
        <button
          className="pm-caregiver-alert__listen"
          onClick={() =>
            speak(alert.message, {
              onStart: () => setSpeaking(true),
              onEnd: () => setSpeaking(false),
              onError: () => setSpeaking(false),
            })
          }
          type="button"
        >
          <Volume2 />
          {speaking ? 'Playing reminder…' : 'Listen Again'}
        </button>
        <div className="pm-caregiver-alert__actions">
          <button className="take" onClick={onTake} type="button">
            <CheckCircle2 />
            Nainom Ko Na / I Took This
          </button>
          <button className="snooze" onClick={onSnooze} type="button">
            <Clock3 />
            I-snooze ng 15 Mins
          </button>
        </div>
        <p>This reminder was sent from the linked caregiver portal.</p>
      </section>
    </div>
  );
}
