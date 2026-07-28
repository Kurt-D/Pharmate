import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';

// Ask Your Pharmacist — pharmacist side (D-I). Queue and threads show
// patient_code only; high-severity inquiries (B-8) sort first. Polling transport.
export default function Inquiries() {
  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const poll = useRef(null);

  const loadQueue = useCallback(async () => {
    try {
      const r = await api('/api/pharmacist/inquiries');
      setQueue(r.data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadMessages = useCallback(async (id) => {
    const r = await api(`/api/pharmacist/inquiries/${id}/messages`);
    setMessages(r.data);
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!active) return;
    loadMessages(active.id);
    poll.current = setInterval(() => loadMessages(active.id), 4000);
    return () => clearInterval(poll.current);
  }, [active, loadMessages]);

  async function reply() {
    const message = draft.trim();
    if (!message) return;
    setDraft('');
    await api(`/api/pharmacist/inquiries/${active.id}/reply`, {
      method: 'POST',
      body: { message },
    });
    loadMessages(active.id);
  }

  async function close() {
    await api(`/api/pharmacist/inquiries/${active.id}/close`, { method: 'POST' });
    clearInterval(poll.current);
    setActive(null);
    setMessages([]);
    loadQueue();
  }

  return (
    <>
      <h2 className="h4 fw-bold mb-1">Ask Your Pharmacist</h2>
      <p className="text-muted">
        Pharmacy-level medication questions. Patients are shown by code only — never a name.
      </p>
      {error && <div className="alert alert-warning py-2">{error}</div>}

      <div className="row g-3">
        <div className="col-lg-5">
          <div className="pw-card p-3">
            <strong className="d-block mb-2">Open inquiries</strong>
            {queue.length === 0 && (
              <div className="text-muted small py-3 text-center">Nothing open. 🎉</div>
            )}
            {queue.map((q) => (
              <button
                key={q.id}
                className={
                  'btn w-100 text-start p-2 mb-2 ' +
                  (active?.id === q.id ? 'btn-primary' : 'btn-light')
                }
                onClick={() => setActive(q)}
              >
                <div className="d-flex justify-content-between">
                  <span className="pw-code">{q.patient_code}</span>
                  {q.priority === 'high' && (
                    <span className="badge bg-danger-subtle text-danger">priority</span>
                  )}
                </div>
                <div className="small opacity-75">
                  {q.subject || '(no subject)'} · {new Date(q.opened_at).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="col-lg-7">
          <div className="pw-card p-3">
            {!active ? (
              <div className="text-muted small py-5 text-center">Select an inquiry.</div>
            ) : (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <strong className="pw-code">{active.patient_code}</strong>
                  <button className="btn btn-sm btn-outline-danger" onClick={close}>
                    Close & purge
                  </button>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }} className="mb-2">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={
                        'mb-2 d-flex ' +
                        (m.sender_role === 'pharmacist' ? 'justify-content-end' : '')
                      }
                    >
                      <span
                        className={
                          'px-3 py-2 rounded ' +
                          (m.sender_role === 'pharmacist' ? 'bg-primary text-white' : 'bg-light')
                        }
                        style={{ maxWidth: '80%' }}
                      >
                        {m.message}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="d-flex gap-2">
                  <input
                    className="form-control"
                    placeholder="Type a reply…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && reply()}
                  />
                  <button className="btn btn-primary" onClick={reply}>
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
