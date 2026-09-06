import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useInquiryConsent } from '../../lib/useInquiryConsent.js';
import InquiryConsent from '../../components/InquiryConsent.jsx';

// Pseudonymous pharmacist inquiries. The server retains completed conversations.
// Optional, versioned patient consent is enforced by the API before writes.
const SCOPE_NOTICE =
  'Pharmacy-level medication questions only (dosing, timing, interactions, ' +
  'availability). PharMate pharmacists provide medication guidance and do not diagnose medical conditions.';

export default function Ask() {
  const consent = useInquiryConsent();
  const [branches, setBranches] = useState([]);
  const [thread, setThread] = useState(null); // { id }
  const [messages, setMessages] = useState([]);
  const [subject, setSubject] = useState('');
  const [branchId, setBranchId] = useState('');
  const [draft, setDraft] = useState('');
  const [banner, setBanner] = useState('');
  const [error, setError] = useState('');
  const poll = useRef(null);

  useEffect(() => {
    api('/api/directory/branches')
      .then((r) => setBranches(r.data))
      .catch(() => setBranches([]));
  }, []);

  const loadMessages = useCallback(async (id) => {
    try {
      const r = await api(`/api/patient/inquiries/${id}/messages`);
      setMessages(r.data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!thread) return;
    loadMessages(thread.id);
    poll.current = setInterval(() => loadMessages(thread.id), 4000);
    return () => clearInterval(poll.current);
  }, [thread, loadMessages]);

  async function start() {
    if (!consent.consented) return;
    setError('');
    setBanner('');
    try {
      const r = await api('/api/patient/inquiries', {
        method: 'POST',
        body: { subject: subject.trim() || null, branch_id: branchId || null },
      });
      setThread({ id: r.data.thread_id });
    } catch (e) {
      if (e.status === 403 && e.body?.redirect === 'visit_nearest_branch') {
        setBanner(e.body.message);
      } else {
        setError(e.message);
      }
    }
  }

  async function send() {
    if (!consent.consented) return;
    const message = draft.trim();
    if (!message) return;
    setDraft('');
    try {
      await api(`/api/patient/inquiries/${thread.id}/messages`, {
        method: 'POST',
        body: { message },
      });
      loadMessages(thread.id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function close() {
    await api(`/api/patient/inquiries/${thread.id}/close`, { method: 'POST' });
    clearInterval(poll.current);
    setThread(null);
    setMessages([]);
    setSubject('');
    setBanner('Inquiry completed. Your conversation remains in consultation history on PharMate’s server.');
  }

  return (
    <>
      <h1 className="pm-title" style={{ fontSize: '1.4rem' }}>
        Ask a Pharmacist
      </h1>
      <p className="pm-subtitle">Your patient code replaces your profile name; messages may still identify you.</p>
      <InquiryConsent consent={consent} />

      {/* Scope boundary — always visible, before any message is sent. */}
      <div className="pm-banner pm-banner--info mb-3">{SCOPE_NOTICE}</div>

      {error && <div className="pm-banner pm-banner--warn mb-3">{error}</div>}
      {banner && <div className="pm-banner pm-banner--warn mb-3">{banner}</div>}

      {!thread ? (
        <div className="pm-card p-3">
          <label className="form-label fw-semibold">What's your question about?</label>
          <input
            className="form-control mb-2"
            placeholder="e.g., taking amlodipine with food"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <label className="form-label fw-semibold">Branch (choose manually)</label>
          <select
            className="form-select mb-3"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">Any branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — {b.address}
              </option>
            ))}
          </select>
          <button className="pm-btn-primary" onClick={start} disabled={!consent.consented}>
            Start conversation
          </button>
        </div>
      ) : (
        <div className="pm-card p-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong>Conversation</strong>
            <button className="pm-link" onClick={close}>
              Complete conversation
            </button>
          </div>

          <div style={{ maxHeight: 320, overflowY: 'auto' }} className="mb-2">
            {messages.length === 0 && <p className="text-muted small">Send your question below.</p>}
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  'mb-2 d-flex ' + (m.sender_role === 'patient' ? 'justify-content-end' : '')
                }
              >
                <span
                  className={
                    'px-3 py-2 rounded ' +
                    (m.sender_role === 'patient' ? 'bg-primary text-white' : 'bg-light')
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
              placeholder="Type a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button className="pm-btn-primary" style={{ width: 'auto' }} onClick={send} disabled={!consent.consented}>
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
