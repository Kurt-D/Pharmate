import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, ClipboardPenLine, HeartPulse, RefreshCw, Save, Search, ShieldCheck } from 'lucide-react';
import { api } from '../../api.js';

export default function InquiriesRedesign() {
  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [patients, setPatients] = useState([]);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMessage, setNoteMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [queueFilter, setQueueFilter] = useState('all');
  const [search, setSearch] = useState('');
  const poll = useRef(null);
  const activeId = active?.id;
  const activeStatus = active?.validation_status;
  const loadQueue = useCallback(async () => {
    try {
      const [inquiries, patientList] = await Promise.all([
        api('/api/pharmacist/inquiries'),
        api('/api/pharmacist/patients'),
      ]);
      setQueue(inquiries.data);
      setPatients(patientList.data || []);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  const loadMessages = useCallback(async (id) => {
    try {
      const response = await api(`/api/pharmacist/inquiries/${id}/messages`);
      setMessages(response.data);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    loadQueue();
  }, [loadQueue]);
  useEffect(() => {
    if (!activeId || activeStatus !== 'accepted') return undefined;
    loadMessages(activeId);
    poll.current = setInterval(() => loadMessages(activeId), 4000);
    return () => clearInterval(poll.current);
  }, [activeId, activeStatus, loadMessages]);

  useEffect(() => {
    if (!activeId || activeStatus !== 'accepted') {
      setNote('');
      setNoteMessage('');
      return;
    }
    api(`/api/pharmacist/inquiries/${activeId}/note`)
      .then((response) => setNote(response.data?.note || ''))
      .catch(() => setNote(''));
  }, [activeId, activeStatus]);

  async function saveNote() {
    if (!activeId || noteSaving) return;
    setNoteSaving(true);
    setNoteMessage('');
    try {
      await api(`/api/pharmacist/inquiries/${activeId}/note`, { method: 'PUT', body: { note } });
      setNoteMessage('Private note saved');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setNoteSaving(false);
    }
  }

  async function accept() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/pharmacist/inquiries/${active.id}/accept`, { method: 'POST' });
      const accepted = { ...active, validation_status: 'accepted' };
      setActive(accepted);
      setQueue((items) => items.map((item) => (item.id === active.id ? accepted : item)));
      await loadMessages(active.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function markUrgent() {
    const reason = window.prompt('Brief clinical-safety reason for urgent handling:');
    if (!reason) return;
    try {
      const response = await api(`/api/pharmacist/inquiries/${active.id}/mark-urgent`, { method: 'POST', body: { reason } });
      const updated = { ...active, ...response.data };
      setActive(updated);
      setQueue((items) => items.map((item) => (item.id === updated.id ? { ...item, ...response.data } : item)));
    } catch (requestError) { setError(requestError.message); }
  }
  async function reply() {
    if (!draft.trim()) return;
    const message = draft.trim();
    setDraft('');
    try {
      await api(`/api/pharmacist/inquiries/${active.id}/reply`, {
        method: 'POST',
        body: { message },
      });
      await loadMessages(active.id);
    } catch (e) {
      setError(e.message);
    }
  }
  async function close() {
    const response = await api(`/api/pharmacist/inquiries/${active.id}/close`, { method: 'POST' });
    clearInterval(poll.current);
    setActive((item) => ({
      ...item,
      status: response.closed ? 'closed' : 'open',
      closed_at: response.closed ? new Date().toISOString() : item.closed_at,
      pharmacist_completed_at: true,
    }));
    await loadQueue();
  }

  const queueTabs = [
    ['all', 'All', queue.length],
    ['waiting', 'Awaiting review', queue.filter((item) => item.status !== 'closed' && item.validation_status !== 'accepted').length],
    ['active', 'Active', queue.filter((item) => item.status !== 'closed' && item.validation_status === 'accepted').length],
    ['completed', 'Completed', queue.filter((item) => item.status === 'closed').length],
  ];
  const visibleQueue = queue.filter((item) => {
    if (queueFilter === 'waiting') return item.status !== 'closed' && item.validation_status !== 'accepted';
    if (queueFilter === 'active') return item.status !== 'closed' && item.validation_status === 'accepted';
    if (queueFilter === 'completed') return item.status === 'closed';
    return true;
  });
  const filteredQueue = visibleQueue.filter((item) => `${item.patient_code || ''} ${item.subject || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const patient = patients.find((item) => item.patient_code === active?.patient_code);

  return (
    <section className="px-inquiries">
      <nav className="px-inquiry-tabs" aria-label="Inquiry filters">
        {queueTabs.map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            className={queueFilter === key ? 'is-active' : ''}
            onClick={() => setQueueFilter(key)}
          >
            {label}<span>{count}</span>
          </button>
        ))}
        <button className="px-inquiry-tabs__refresh" onClick={loadQueue} type="button">
          <RefreshCw aria-hidden="true" size={15} /> Refresh
        </button>
      </nav>
      {error && <div className="alert alert-warning py-2">{error}</div>}
      <div className="row g-3 px-inquiries-grid">
        <div className="col-lg-3">
          <div className="pw-card p-3 px-inquiry-queue">
            <div className="d-flex justify-content-between mb-2">
              <strong>Connect</strong>
              <span className="badge bg-primary-subtle text-primary">{filteredQueue.length}</span>
            </div>
            <label className="px-inquiry-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patients or chats" /></label>
            {filteredQueue.length === 0 && (
              <div className="text-muted small py-4 text-center">
                No inquiries in this view.
              </div>
            )}
            {filteredQueue.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`btn w-100 text-start p-3 mb-2 ${active?.id === item.id ? 'btn-primary' : 'btn-light'}`}
                onClick={() => {
                  setActive(item);
                  setMessages([]);
                  setError('');
                }}
              >
                <div className="d-flex justify-content-between">
                  <span className="pw-code">{item.patient_code}</span>
                  {item.priority === 'high' && (
                    <span className="badge bg-danger-subtle text-danger">Priority</span>
                  )}
                </div>
                <div className="small mt-1">{item.subject || 'Medication question'}</div>
                <div className="small opacity-75 mt-1">
                  {item.status === 'closed'
                    ? 'Completed · View history'
                    : item.validation_status === 'accepted'
                      ? <><CheckCircle2 aria-hidden="true" size={13} /> Accepted by you</>
                      : 'Awaiting validation'}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="col-lg-6">
          <div className="pw-card p-3 px-inquiry-chat">
            {!active ? (
              <div className="text-muted small py-5 text-center">Select a patient request.</div>
            ) : active.validation_status !== 'accepted' ? (
              <div className="pw-inquiry-validation">
                <span className="badge bg-warning-subtle text-warning-emphasis mb-3">
                  Validation required
                </span>
                <h3 className="h5">Review chat request</h3>
                <p>
                  <strong>Patient:</strong> <span className="pw-code">{active.patient_code}</span>
                </p>
                <p>
                  <strong>Question:</strong> {active.subject || 'No subject provided'}
                </p>
                {active.priority_tier !== 'urgent' && (
                  <button type="button" className="btn btn-outline-danger w-100 mb-2" onClick={markUrgent}>
                    Mark urgent safety case
                  </button>
                )}
                <div className="px-inquiry-privacy">
                  Accepting assigns this private conversation to you. Other pharmacists will no
                  longer be able to open or reply to it.
                </div>
                <button
                  type="button"
                  className="btn btn-primary w-100"
                  disabled={busy}
                  onClick={accept}
                >
                  {busy ? 'Validating…' : 'Accept & Validate Request'}
                </button>
              </div>
            ) : (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div>
                    <strong className="pw-code">{active.patient_code}</strong>
                    <div
                      className={`small ${active.status === 'closed' ? 'text-muted' : 'text-success'}`}
                    >
                      {active.status === 'closed'
                        ? 'Completed consultation · Read-only'
                        : <><CheckCircle2 aria-hidden="true" size={13} /> Request validated</>}
                    </div>
                  </div>
                  {active.status !== 'closed' && !active.pharmacist_completed_at && (
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={close}>
                      Complete conversation
                    </button>
                  )}
                </div>
                <div className="alert alert-light border small">
                  {active.status === 'closed'
                    ? 'This consultation is saved as read-only history. The patient must reconnect to start a new session.'
                    : active.pharmacist_completed_at
                      ? 'You completed this conversation. It will move to history once the patient confirms completion.'
                    : 'This secure conversation is assigned to you.'}
                </div>
                <div className="pw-inquiry-messages">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={message.sender_role === 'pharmacist' ? 'mine' : 'theirs'}
                    >
                      <span>
                        {message.message}
                        <small>
                          {new Date(message.sent_at).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
                {active.status !== 'closed' && !active.pharmacist_completed_at && !active.patient_completed_at && (
                  <div className="d-flex gap-2 mt-3">
                    <input
                      className="form-control"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && reply()}
                      placeholder="Type a validated pharmacist reply…"
                    />
                    <button type="button" className="btn btn-primary" onClick={reply}>
                      Send
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="col-lg-3">
          <aside className="pw-card p-3 px-inquiry-details" aria-label="Patient details">
            {!active ? <div className="px-inquiry-details__empty">Select a conversation to view patient details.</div> : <>
              <div className="px-inquiry-details__profile"><span>{active.patient_code?.slice(-2) || 'PT'}</span><strong>{active.patient_code}</strong><small>Patient medication inquiry</small>{active.priority === 'high' && <em><ShieldCheck size={13} /> Priority</em>}</div>
              <section className="px-inquiry-patient-summary">
                <header><HeartPulse size={17} /><div><small>Patient overview</small><strong>Care details</strong></div></header>
                <dl><div><dt>Active medicines</dt><dd>{patient?.active_meds ?? '—'}</dd></div><div><dt>Adherence</dt><dd>{patient?.adherence_pct == null ? 'No data' : `${patient.adherence_pct}%`}</dd></div><div><dt>Inquiry status</dt><dd>{active.status === 'closed' ? 'Completed' : 'Open'}</dd></div></dl>
              </section>
              {active.validation_status === 'accepted' && <section className="px-inquiry-note">
                <header><ClipboardPenLine size={17} /><div><strong>Note</strong><small>Only visible to you.</small></div></header>
                <textarea value={note} onChange={(event) => { setNote(event.target.value); setNoteMessage(''); }} maxLength={4000} placeholder="Add counseling notes…" />
                <footer><small>{noteMessage || `${note.length}/4000`}</small><button disabled={noteSaving} onClick={saveNote} type="button"><Save size={15} /> {noteSaving ? 'Saving…' : 'Save'}</button></footer>
              </section>}
            </>}
          </aside>
        </div>
      </div>
    </section>
  );
}
