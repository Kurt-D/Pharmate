import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { enqueue, flushOutbox, newLogId } from '../../lib/doseOutbox.js';
import { scheduleDoseReminders, initReminderVoice, speak } from '../../lib/notifications.js';

// Today — dose confirmation (UC-05/06). Each due dose can be marked Taken or
// Snoozed. Logs made offline queue locally and flush on reconnect (D-F/TC-10).
const STATUS = {
  taken: { label: 'Taken', cls: 'pm-pill--taken' },
  taken_late: { label: 'Taken late', cls: 'pm-pill--late' },
  missed: { label: 'Missed', cls: 'pm-pill--missed' },
  snoozed: { label: 'Snoozed', cls: 'pm-pill--pending' },
};

function fmt(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Today() {
  const [doses, setDoses] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      await flushOutbox(api); // drain anything queued while offline
      const r = await api('/api/patient/doses/today');
      setDoses(r.data);
      // Offline layer: (re)arm on-device local notifications from the confirmed
      // plan so reminders fire even with no network (no-op on web).
      scheduleDoseReminders(r.data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const onOnline = () => load();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [load]);

  // Foreground voice prompt: speak the medicine name when a reminder fires while
  // the app is open. Cleanup removes the native listener on unmount.
  useEffect(() => {
    let dispose = () => {};
    initReminderVoice().then((fn) => {
      dispose = fn;
    });
    return () => dispose();
  }, []);

  async function log(dose, action) {
    const logId = newLogId();
    const body = { log_id: logId, logged_at: new Date().toISOString(), method: 'manual', action };
    // Optimistic local update.
    const optimistic = action === 'snooze' ? 'snoozed' : 'taken';
    setDoses((ds) =>
      ds.map((d) => (d.schedule_id === dose.schedule_id ? { ...d, status: optimistic } : d))
    );
    try {
      const r = await api(`/api/patient/doses/${dose.schedule_id}/log`, { method: 'POST', body });
      setDoses((ds) =>
        ds.map((d) => (d.schedule_id === dose.schedule_id ? { ...d, status: r.data.status } : d))
      );
      if (r.data.reflow) {
        setNotice('That dose was late — we’ve suggested new times for the rest of the day.');
      }
    } catch {
      // Offline (or server unreachable): queue for sync on reconnect.
      enqueue({ ...body, schedule_id: dose.schedule_id, method: 'local' });
      setNotice('Saved offline — it’ll sync when you’re back online.');
    }
  }

  if (error) {
    return (
      <>
        <h1 className="pm-title">Today</h1>
        <div className="pm-banner pm-banner--warn">{error}</div>
      </>
    );
  }

  return (
    <>
      <h1 className="pm-title">Today</h1>
      <p className="pm-subtitle">Confirm each dose as you take it.</p>

      <div className="d-flex align-items-center gap-2 mb-3 text-muted small">
        <span>🔔 Dose reminders are on</span>
        <button
          type="button"
          className="pm-link p-0"
          onClick={() => speak('Time to take your medicine')}
        >
          🔊 Test voice
        </button>
      </div>

      {notice && <div className="pm-banner pm-banner--info mb-3">{notice}</div>}

      {doses === null && <div className="text-center text-muted py-5">Loading…</div>}

      {doses && doses.length === 0 && (
        <div className="pm-card text-center p-4">
          <div
            className="pm-med-icon mx-auto mb-3"
            style={{ background: '#e0edff', width: 64, height: 64, fontSize: '1.6rem' }}
          >
            📅
          </div>
          <h5 className="mb-1">No doses scheduled</h5>
          <p className="text-muted small mb-0">Confirm a schedule to see today’s doses here.</p>
        </div>
      )}

      {doses &&
        doses.map((d) => {
          const done = d.status !== 'scheduled';
          const s = STATUS[d.status];
          return (
            <div key={d.schedule_id} className="pm-card d-flex align-items-center gap-3 p-3 mb-2">
              <div className="pm-dose__time" style={{ minWidth: 62 }}>
                {fmt(d.scheduled_time)}
              </div>
              <div className="flex-grow-1">
                <div className="pm-dose__drug">{d.drug_name}</div>
                {s ? (
                  <span className={'pm-pill ' + s.cls}>{s.label}</span>
                ) : (
                  <span className="text-muted small">Due</span>
                )}
              </div>
              {!done && (
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-success" onClick={() => log(d, 'take')}>
                    Taken
                  </button>
                  <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => log(d, 'snooze')}
                  >
                    Snooze
                  </button>
                </div>
              )}
            </div>
          );
        })}
    </>
  );
}
