import { BellRing, CheckCircle2, Clock3, ScanLine, Volume2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { speak } from '../../lib/notifications.js';

export default function PatientVoiceAlert({ alert, dose, onTake, onScan, onSnooze, onDismiss }) {
  const [speaking, setSpeaking] = useState(false);

  const playReminder = useCallback(() => {
    if (!alert?.message) return;
    speak(alert.message, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, [alert?.message]);

  useEffect(() => {
    playReminder();
    return () => window.speechSynthesis?.cancel();
  }, [playReminder]);

  if (!alert) return null;
  const medicine = dose?.drug_name || alert.medicine || 'your scheduled medicine';

  return (
    <section aria-labelledby="caregiver-voice-reminder-title" className="pm-dashboard-card pm-voice-card pm-caregiver-voice-card" role="status">
      <div className="pm-section-heading">
        <h2 id="caregiver-voice-reminder-title"><span><BellRing /></span> Caregiver Voice Reminder</h2>
        <div className="pm-caregiver-voice-card__tools">
          <span className="pm-active-pill">Active</span>
          <button aria-label="Dismiss caregiver reminder" onClick={onDismiss} type="button"><X /></button>
        </div>
      </div>
      <div className="pm-reminder">
        <button aria-label={speaking ? 'Voice reminder is playing' : 'Play caregiver voice reminder'} className={`pm-mic ${speaking ? 'speaking' : ''}`} onClick={playReminder} type="button"><Volume2 /></button>
        <div className="pm-reminder__copy">
          <small>Reminder from {alert.caregiverName || 'your caregiver'}</small>
          <h3>“It’s time to take your {medicine}.”</h3>
          <p>{alert.message}</p>
        </div>
      </div>
      <div className="pm-wave" aria-hidden="true">{Array.from({ length: 40 }, (_, index) => <span key={index} />)}</div>
      <button className="pm-action-button pm-action-button--outline" onClick={onTake} type="button"><CheckCircle2 /> Mark as Taken</button>
      <button className="pm-action-button" onClick={onScan} type="button"><ScanLine /> Scan Medicine</button>
      <small className="pm-scan-hint">Scan the medicine for a more accurate adherence log.</small>
      <button className="pm-caregiver-voice-card__snooze" onClick={onSnooze} type="button"><Clock3 /> Snooze reminder for 15 minutes</button>
    </section>
  );
}
