import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';

export default function InquiriesRedesign() {
  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const poll = useRef(null);
  const activeId = active?.id;
  const activeStatus = active?.validation_status;
  const loadQueue = useCallback(async () => { try { const response = await api('/api/pharmacist/inquiries'); setQueue(response.data); } catch (e) { setError(e.message); } }, []);
  const loadMessages = useCallback(async (id) => { try { const response = await api(`/api/pharmacist/inquiries/${id}/messages`); setMessages(response.data); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { loadQueue(); }, [loadQueue]);
  useEffect(() => {
    if (!activeId || activeStatus !== 'accepted') return undefined;
    loadMessages(activeId); poll.current = setInterval(() => loadMessages(activeId), 4000);
    return () => clearInterval(poll.current);
  }, [activeId, activeStatus, loadMessages]);

  async function accept() {
    setBusy(true); setError('');
    try {
      await api(`/api/pharmacist/inquiries/${active.id}/accept`, { method: 'POST' });
      const accepted = { ...active, validation_status: 'accepted' };
      setActive(accepted); setQueue((items) => items.map((item) => item.id === active.id ? accepted : item));
      await loadMessages(active.id);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function reply() {
    if (!draft.trim()) return; const message = draft.trim(); setDraft('');
    try { await api(`/api/pharmacist/inquiries/${active.id}/reply`, { method: 'POST', body: { message } }); await loadMessages(active.id); }
    catch (e) { setError(e.message); }
  }
  async function close() {
    await api(`/api/pharmacist/inquiries/${active.id}/close`, { method: 'POST' });
    clearInterval(poll.current); setActive((item) => ({ ...item, status: 'closed', closed_at: new Date().toISOString() })); await loadQueue();
  }

  return <>
    <h2 className="h4 fw-bold mb-1">Patient Chat Validation</h2>
    <p className="text-muted">Validate and accept a request before viewing or replying. Patients are identified only by patient code.</p>
    {error && <div className="alert alert-warning py-2">{error}</div>}
    <div className="row g-3">
      <div className="col-lg-5"><div className="pw-card p-3"><div className="d-flex justify-content-between mb-2"><strong>Requests &amp; history</strong><span className="badge bg-primary-subtle text-primary">{queue.length}</span></div>
        {queue.length === 0 && <div className="text-muted small py-4 text-center">No requests or consultation history.</div>}
        {queue.map((item) => <button type="button" key={item.id} className={`btn w-100 text-start p-3 mb-2 ${active?.id === item.id ? 'btn-primary' : 'btn-light'}`} onClick={() => { setActive(item); setMessages([]); setError(''); }}>
          <div className="d-flex justify-content-between"><span className="pw-code">{item.patient_code}</span>{item.priority === 'high' && <span className="badge bg-danger-subtle text-danger">Priority</span>}</div>
          <div className="small mt-1">{item.subject || 'Medication question'}</div>
          <div className="small opacity-75 mt-1">{item.status === 'closed' ? 'Completed · View history' : item.validation_status === 'accepted' ? '✓ Accepted by you' : 'Awaiting validation'}</div>
        </button>)}
      </div></div>
      <div className="col-lg-7"><div className="pw-card p-3">
        {!active ? <div className="text-muted small py-5 text-center">Select a patient request.</div> : active.validation_status !== 'accepted' ? <div className="pw-inquiry-validation">
          <span className="badge bg-warning-subtle text-warning-emphasis mb-3">Validation required</span>
          <h3 className="h5">Review chat request</h3><p><strong>Patient:</strong> <span className="pw-code">{active.patient_code}</span></p>
          <p><strong>Question:</strong> {active.subject || 'No subject provided'}</p>
          <div className="alert alert-info small">Accepting assigns this private conversation to you. Other pharmacists will no longer be able to open or reply to it.</div>
          <button type="button" className="btn btn-success w-100" disabled={busy} onClick={accept}>{busy ? 'Validating…' : 'Accept & Validate Request'}</button>
        </div> : <>
          <div className="d-flex justify-content-between align-items-center mb-2"><div><strong className="pw-code">{active.patient_code}</strong><div className={`small ${active.status === 'closed' ? 'text-muted' : 'text-success'}`}>{active.status === 'closed' ? 'Completed consultation · Read-only' : '✓ Request validated'}</div></div>{active.status !== 'closed' && <button type="button" className="btn btn-sm btn-outline-danger" onClick={close}>Complete &amp; save</button>}</div>
          <div className="alert alert-light border small">{active.status === 'closed' ? 'This consultation is saved as read-only history. The patient must reconnect to start a new session.' : 'This secure conversation is assigned to you.'}</div>
          <div className="pw-inquiry-messages">{messages.map((message) => <div key={message.id} className={message.sender_role === 'pharmacist' ? 'mine' : 'theirs'}><span>{message.message}<small>{new Date(message.sent_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></span></div>)}</div>
          {active.status !== 'closed' && <div className="d-flex gap-2 mt-3"><input className="form-control" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && reply()} placeholder="Type a validated pharmacist reply…" /><button type="button" className="btn btn-primary" onClick={reply}>Send</button></div>}
        </>}
      </div></div>
    </div>
  </>;
}
