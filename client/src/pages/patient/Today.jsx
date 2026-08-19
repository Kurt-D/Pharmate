import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { enqueue, flushOutbox, newLogId } from '../../lib/doseOutbox.js';
import { scheduleDoseReminders, initReminderVoice, speak } from '../../lib/notifications.js';
import patientWelcome from '../../assets/patient-welcome.png';

function patientName(user) {
  const raw = user?.name || user?.full_name || user?.first_name || '';
  if (raw) return raw.trim().split(/\s+/)[0];
  return 'Patient';
}

export default function Today() {
  const { user } = useAuth();
  const { language } = useLanguage(); const tr = (english, filipino) => language === 'fil' ? filipino : english;
  const [doses, setDoses] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanPhoto, setScanPhoto] = useState(null);
  const [scanName, setScanName] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      await flushOutbox(api);
      const response = await api('/api/patient/doses/today');
      setDoses(response.data);
      setError('');
      scheduleDoseReminders(response.data);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await api('/api/patient/notifications?limit=20');
      setNotifications(response.data.notifications);
      setUnreadNotifications(response.data.unread_count);
    } catch {
      // Keep the medicine dashboard usable if the inbox is unavailable.
    }
  }, []);

  useEffect(() => {
    load();
    loadNotifications();
    window.addEventListener('online', load);
    return () => window.removeEventListener('online', load);
  }, [load, loadNotifications]);

  async function markNotificationsRead() {
    await api('/api/patient/notifications/read-all', { method: 'POST' });
    setUnreadNotifications(0);
    setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
  }

  useEffect(() => {
    let dispose = () => {};
    initReminderVoice().then((cleanup) => {
      dispose = cleanup;
    });
    return () => dispose();
  }, []);

  useEffect(() => () => {
    if (scanPhoto?.url) URL.revokeObjectURL(scanPhoto.url);
  }, [scanPhoto]);

  async function log(dose, action) {
    const body = { log_id: newLogId(), logged_at: new Date().toISOString(), method: 'manual', action };
    const optimistic = action === 'snooze' ? 'snoozed' : 'taken';
    setDoses((items) => items.map((item) =>
      item.schedule_id === dose.schedule_id ? { ...item, status: optimistic } : item
    ));
    try {
      const response = await api(`/api/patient/doses/${dose.schedule_id}/log`, { method: 'POST', body });
      setDoses((items) => items.map((item) =>
        item.schedule_id === dose.schedule_id ? { ...item, status: response.data.status } : item
      ));
      setNotice(response.data.reflow
        ? 'Dose recorded. We suggested updated times for the rest of today.'
        : 'Dose marked as taken. Keep up the great work!');
    } catch {
      enqueue({ ...body, schedule_id: dose.schedule_id, method: 'local' });
      setNotice('Saved offline. It will sync when you are connected again.');
    }
  }

  function chooseScanPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (scanPhoto?.url) URL.revokeObjectURL(scanPhoto.url);
    setScanPhoto({ file, url: URL.createObjectURL(file) });
    setScanResult(null);
  }

  async function verifyScan() {
    if (!scanName.trim()) return;
    setScanBusy(true);
    setScanResult(null);
    try {
      const response = await api('/api/patient/label/verify', {
        method: 'POST',
        body: { scanned_name: scanName.trim() },
      });
      if (response.data.match) {
        const matchingDose = (doses || []).find((dose) =>
          dose.medication_id === response.data.medication_id
          && ['scheduled', 'snoozed'].includes(dose.status)
        );
        if (matchingDose) {
          await log(matchingDose, 'take');
          setScanResult({ ...response.data, markedTaken: true });
        } else {
          setScanResult({ ...response.data, markedTaken: false });
        }
      } else {
        setScanResult(response.data);
      }
    } catch (scanError) {
      setScanResult({ match: false, message: scanError.message });
    } finally {
      setScanBusy(false);
    }
  }

  function closeScan() {
    if (scanPhoto?.url) URL.revokeObjectURL(scanPhoto.url);
    setScanOpen(false);
    setScanPhoto(null);
    setScanName('');
    setScanResult(null);
  }

  const summary = useMemo(() => {
    const items = doses || [];
    return {
      taken: items.filter((dose) => ['taken', 'taken_late'].includes(dose.status)).length,
      upcoming: items.filter((dose) => ['scheduled', 'snoozed'].includes(dose.status)).length,
      missed: items.filter((dose) => dose.status === 'missed').length,
    };
  }, [doses]);

  const nextDose = useMemo(() => (doses || [])
    .filter((dose) => ['scheduled', 'snoozed'].includes(dose.status))
    .sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time))[0], [doses]);

  const nextTime = nextDose ? new Date(nextDose.scheduled_time).toLocaleTimeString([], {
    hour: 'numeric', minute: '2-digit',
  }) : '';
  const reminderText = nextDose
    ? `It is time to take your ${nextDose.drug_name}`
    : 'You have no medicine due right now';

  return (
    <main className="pm-home">
      <header className="pm-home__header">
        <div><h1>{tr('Welcome', 'Maligayang pagdating')}, {patientName(user)}!</h1><p>{tr('Manage your health with ease.', 'Pamahalaan ang iyong kalusugan nang madali.')}</p></div>
        <div className="pm-home-header-actions"><button type="button" className="pm-notification-button" onClick={() => { setNotificationsOpen((open) => !open); loadNotifications(); }} aria-label={tr('Open notifications', 'Buksan ang mga abiso')}>♧{unreadNotifications > 0 && <b>{unreadNotifications > 9 ? '9+' : unreadNotifications}</b>}</button><Link className="pm-profile-button" to="/patient/profile" aria-label="Open profile"><span aria-hidden="true">◉</span><span aria-hidden="true">⌄</span></Link></div>
      </header>

      {notificationsOpen && <section className="pm-notification-panel"><div><h2>{tr('Notifications', 'Mga Abiso')}</h2>{unreadNotifications > 0 && <button type="button" onClick={markNotificationsRead}>{tr('Mark all read', 'Markahang nabasa lahat')}</button>}</div>{notifications.length === 0 ? <p>{tr('No notifications yet.', 'Wala pang abiso.')}</p> : notifications.map((item) => <article key={item.id} className={item.read_at ? '' : 'unread'}><i>{item.type === 'dose_reminder' ? '♧' : '▣'}</i><span><strong>{item.title}</strong><small>{item.message}</small><time>{new Date(item.created_at).toLocaleString()}</time></span></article>)}</section>}

      <section className="pm-welcome-card" aria-label="Health encouragement">
        <div className="pm-avatar" aria-hidden="true"><img src={patientWelcome} alt="" /><b>♥</b></div>
        <div><h2>{tr('Your health matters most.', 'Pinakamahalaga ang iyong kalusugan.')}</h2>
          <p>{tr('Take your medications on time, stay consistent, and feel your best every day.', 'Inumin ang mga gamot sa tamang oras at panatilihin ang mabuting kalusugan araw-araw.')}</p>
          <div className="pm-support-line"><span>♥</span> We’re here to support you every step of the way.</div>
        </div>
      </section>

      {error && <div className="pm-banner pm-banner--warn">{error}</div>}
      {notice && <div className="pm-banner pm-banner--success">{notice}</div>}

      <section className="pm-dashboard-card pm-summary-card">
        <div className="pm-section-heading"><h2><span aria-hidden="true">▣</span> Today’s Summary</h2>
          <Link to="/patient/schedule">{tr('View Details', 'Tingnan ang Detalye')} <span aria-hidden="true">›</span></Link></div>
        <div className="pm-summary-grid" aria-live="polite">
          <div><span className="pm-stat-icon pm-stat-icon--green">✓</span><strong>{summary.taken}</strong><small>{tr('Taken', 'Nainom')}</small></div>
          <div><span className="pm-stat-icon pm-stat-icon--orange">◷</span><strong>{summary.upcoming}</strong><small>{tr('Upcoming', 'Paparating')}</small></div>
          <div><span className="pm-stat-icon pm-stat-icon--red">×</span><strong>{summary.missed}</strong><small>{tr('Missed', 'Hindi nainom')}</small></div>
        </div>
        <div className="pm-streak"><span className="pm-streak__shield">◆</span>
          <span><strong>{tr('You’re doing great!', 'Mahusay ang iyong ginagawa!')}</strong><small>{tr('Keep it up and maintain your streak.', 'Ipagpatuloy ito at panatilihin ang iyong sunod-sunod na araw.')}</small></span>
          <span className="pm-streak__days">♨ <strong>6</strong><small>Days<br />Streak</small></span>
        </div>
      </section>

      <section className="pm-dashboard-card pm-voice-card">
        <div className="pm-section-heading"><h2><span aria-hidden="true">🔊</span> Voice Reminder</h2>
          <span className="pm-active-pill">⌁ Active</span></div>
        <div className="pm-reminder">
          <button type="button" className="pm-mic" onClick={() => speak(reminderText)} aria-label="Play voice reminder">
            <span className="pm-mic__glyph" aria-hidden="true" />
          </button>
          <div><h3>“{reminderText}.”</h3>
            {nextDose && <p>{nextTime} · {nextDose.dosage_instruction || 'Follow your prescribed dose'}</p>}
            <small>You can scan your medicine or mark it as taken.</small></div>
        </div>
        <div className="pm-wave" aria-hidden="true">˙│˙││˙│˙│││˙│˙││˙│││˙│˙│</div>
        <button type="button" className="pm-action-button pm-action-button--outline"
          disabled={!nextDose} onClick={() => nextDose && log(nextDose, 'take')}>Mark as Taken</button>
        <button type="button" className="pm-action-button" onClick={() => setScanOpen(true)}>▣ &nbsp; {tr('Scan Medicine', 'I-scan ang Gamot')}</button>
        <small className="pm-scan-hint">{tr('Scan the medicine for automatic log', 'I-scan ang gamot para awtomatikong maitala')}</small>
      </section>

      {scanOpen && (
        <div className="pm-scan-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeScan();
        }}>
          <section className="pm-scan-sheet" role="dialog" aria-modal="true" aria-labelledby="scan-title">
            <div className="pm-scan-sheet__header">
              <div><h2 id="scan-title">Scan Medicine</h2><p>Take a clear photo of the medicine label.</p></div>
              <button type="button" onClick={closeScan} aria-label="Close medicine scanner">×</button>
            </div>

            {!scanPhoto ? (
              <div className="pm-scan-choices">
                <button type="button" onClick={() => cameraInputRef.current?.click()}>
                  <span aria-hidden="true">📷</span><strong>Take a Photo</strong><small>Use your phone camera</small>
                </button>
                <button type="button" onClick={() => galleryInputRef.current?.click()}>
                  <span aria-hidden="true">▣</span><strong>Choose a Photo</strong><small>Upload from your files</small>
                </button>
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={chooseScanPhoto} />
                <input ref={galleryInputRef} type="file" accept="image/*" hidden onChange={chooseScanPhoto} />
              </div>
            ) : (
              <div className="pm-scan-review">
                <img src={scanPhoto.url} alt="Selected medicine label" />
                <button type="button" className="pm-scan-retake" onClick={() => {
                  setScanPhoto(null); setScanName(''); setScanResult(null);
                }}>Choose a different photo</button>
                <label htmlFor="scan-medicine-name">Medicine name shown on the label</label>
                <input id="scan-medicine-name" value={scanName} onChange={(event) => {
                  setScanName(event.target.value); setScanResult(null);
                }} placeholder="Example: Paracetamol" autoComplete="off" />
                <p className="pm-scan-privacy">The photo stays on this device. Only the medicine name is checked.</p>
                <button type="button" className="pm-action-button" disabled={!scanName.trim() || scanBusy} onClick={verifyScan}>
                  {scanBusy ? 'Checking…' : 'Check Medicine'}
                </button>
                {scanResult?.match && (
                  <div className="pm-scan-result pm-scan-result--success">
                    <strong>{scanResult.markedTaken ? 'Dose marked as taken' : 'Medicine verified'}</strong>
                    <span>
                      {scanResult.markedTaken
                        ? `${scanResult.drug_name} was matched to your schedule and recorded as taken.`
                        : `${scanResult.drug_name} is active, but it has no outstanding scheduled dose to record.`}
                    </span>
                    <button type="button" onClick={closeScan}>Done</button>
                  </div>
                )}
                {scanResult && !scanResult.match && (
                  <div className="pm-scan-result pm-scan-result--warn">
                    <strong>Medicine not matched</strong><span>{scanResult.message || 'Check the label name or add this medicine first.'}</span>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      <section className="pm-dashboard-card pm-quick-card">
        <div className="pm-section-heading"><h2>{tr('Quick Actions', 'Mabilis na Aksyon')}</h2><span>{tr('Manage Your Health Easily', 'Madaling Pamahalaan ang Kalusugan')}</span></div>
        <div className="pm-quick-grid">
          <Link to="/patient/schedule"><i>▦</i><strong>{tr('My Schedule', 'Aking Iskedyul')}</strong><small>{tr('View & edit', 'Tingnan at i-edit')}</small></Link>
          <Link to="/patient/medications"><i>▣</i><strong>{tr('Upload Rx', 'Mag-upload ng Reseta')}</strong><small>{tr('New prescription', 'Bagong reseta')}</small></Link>
          <Link to="/patient/ask"><i>•••</i><strong>{tr('Ask Pharmacist', 'Magtanong sa Parmasyutiko')}</strong><small>{tr('Chat now', 'Makipag-chat')}</small></Link>
          <Link to="/patient/orders"><i>▱</i><strong>{tr('Order Medicine', 'Umorder ng Gamot')}</strong><small>{tr('Refill & delivery', 'Refill at delivery')}</small></Link>
        </div>
      </section>

      <section className="pm-tip-card"><span className="pm-tip-icon">♥</span>
        <div><h2>{tr('Tip of the day', 'Payo ngayong araw')}</h2><p>{tr('Drink enough water, eat balanced meals, and take short walks to stay active.', 'Uminom ng sapat na tubig, kumain nang balanse, at maglakad-lakad upang manatiling aktibo.')}</p></div>
        <span className="pm-tip-art" aria-hidden="true">🥛🍎</span>
      </section>
    </main>
  );
}
