import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

const STEPS = ['Request', 'Review', 'Chat', 'Complete'];

export default function AskRedesign() {
  const { language } = useLanguage();
  const tr = (english, filipino) => (language === 'fil' ? filipino : english);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [pharmacists, setPharmacists] = useState([]);
  const [pharmacist, setPharmacist] = useState(null);
  const [question, setQuestion] = useState('');
  const [thread, setThread] = useState(null);
  const [threads, setThreads] = useState([]);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [restoringThread, setRestoringThread] = useState(true);
  const poll = useRef(null);
  const threadId = thread?.id;
  const threadStatus = thread?.status;

  useEffect(() => {
    api('/api/directory/branches')
      .then((r) => setBranches(r.data))
      .catch(() => setBranches([]));
  }, []);
  useEffect(() => {
    let cancelled = false;

    async function restoreOpenThread() {
      try {
        const response = await api('/api/patient/inquiries');
        if (cancelled) return;
        setThreads(response.data);
        const existingThread =
          response.data.find((item) => item.status === 'open') || response.data[0];
        if (existingThread) setThread(existingThread);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setRestoringThread(false);
      }
    }

    restoreOpenThread();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    setPharmacist(null);
    if (!branchId) {
      setPharmacists([]);
      return;
    }
    api(`/api/directory/branches/${branchId}/pharmacists`)
      .then((r) => setPharmacists(r.data))
      .catch(() => setPharmacists([]));
  }, [branchId]);

  const refresh = useCallback(async (id) => {
    try {
      const [messageResponse, threadResponse] = await Promise.all([
        api(`/api/patient/inquiries/${id}/messages`),
        api('/api/patient/inquiries'),
      ]);
      setMessages(messageResponse.data);
      const current = threadResponse.data.find((item) => item.id === id);
      setThreads(threadResponse.data);
      if (current) setThread((old) => ({ ...old, ...current }));
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    if (!threadId) return undefined;
    refresh(threadId);
    if (threadStatus === 'closed') return undefined;
    poll.current = setInterval(() => refresh(threadId), 4000);
    return () => clearInterval(poll.current);
  }, [threadId, threadStatus, refresh]);

  async function start() {
    if (!branchId || !pharmacist || !question.trim()) {
      setError('Choose a branch and pharmacist, then enter your question.');
      return;
    }
    setError('');
    try {
      const response = await api('/api/patient/inquiries', {
        method: 'POST',
        body: { subject: question.trim(), branch_id: branchId, pharmacist_id: pharmacist.id },
      });
      await api(`/api/patient/inquiries/${response.data.thread_id}/messages`, {
        method: 'POST',
        body: { message: question.trim() },
      });
      setThread({
        id: response.data.thread_id,
        status: 'open',
        validation_status: response.data.validation_status,
        pharmacist_name: pharmacist.full_name,
        branch_id: branchId,
        pharmacist_id: pharmacist.id,
        subject: question.trim(),
      });
      setQuestion('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function send() {
    if (!draft.trim()) return;
    const message = draft.trim();
    setDraft('');
    try {
      await api(`/api/patient/inquiries/${thread.id}/messages`, {
        method: 'POST',
        body: { message },
      });
      await refresh(thread.id);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function close() {
    await api(`/api/patient/inquiries/${thread.id}/close`, { method: 'POST' });
    clearInterval(poll.current);
    await refresh(thread.id);
  }

  async function reconnect() {
    setError('');
    try {
      const subject = `Follow-up: ${thread.subject || 'Medication consultation'}`;
      const response = await api('/api/patient/inquiries', {
        method: 'POST',
        body: { subject, branch_id: thread.branch_id, pharmacist_id: thread.pharmacist_id },
      });
      await api(`/api/patient/inquiries/${response.data.thread_id}/messages`, {
        method: 'POST',
        body: { message: 'I would like to reconnect for a follow-up consultation.' },
      });
      const newThread = {
        id: response.data.thread_id,
        status: 'open',
        validation_status: response.data.validation_status,
        pharmacist_name: thread.pharmacist_name,
        branch_id: thread.branch_id,
        pharmacist_id: thread.pharmacist_id,
        subject,
      };
      setThread(newThread);
      setMessages([]);
      setThreads((items) => [newThread, ...items]);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function startNewConsultation() {
    clearInterval(poll.current);
    setThread(null);
    setMessages([]);
    setDraft('');
    setQuestion('');
    setBranchId('');
    setPharmacist(null);
    setError('');
  }

  const savedOpenThread = threads.find((item) => item.status === 'open');
  const step = !thread
    ? 1
    : thread.status === 'closed'
      ? 4
      : thread.validation_status === 'accepted'
        ? 3
        : 2;
  return (
    <main className="pm-ask-page">
      <header>
        <h1>{tr('Ask a Pharmacist', 'Magtanong sa Parmasyutiko')}</h1>
        <p>
          {tr(
            "We're here to help you with your health.",
            'Narito kami upang tumulong sa iyong kalusugan.'
          )}
        </p>
      </header>
      <div className="pm-ask-steps">
        {STEPS.map((label, index) => (
          <div key={label} className={step >= index + 1 ? 'active' : ''}>
            <i>{index + 1}</i>
            <span>
              {language === 'fil' ? ['Kahilingan', 'Pagsusuri', 'Chat', 'Tapos'][index] : label}
            </span>
          </div>
        ))}
      </div>
      {error && <div className="pm-banner pm-banner--warn">{error}</div>}

      {restoringThread ? (
        <section className="pm-ask-card pm-ask-empty">
          {tr('Restoring your conversation…', 'Ibinabalik ang iyong usapan…')}
        </section>
      ) : !thread ? (
        <>
          {savedOpenThread && (
            <section className="pm-ask-card">
              <h2>{tr('Current Consultation', 'Kasalukuyang Konsultasyon')}</h2>
              <p className="pm-ask-empty">
                {tr(
                  'You already have a consultation in progress. You can resume it or begin a separate request below.',
                  'May kasalukuyan ka nang konsultasyon. Maaari mo itong ipagpatuloy o gumawa ng bagong kahilingan sa ibaba.'
                )}
              </p>
              <button
                type="button"
                className="pm-ask-primary"
                onClick={() => setThread(savedOpenThread)}
              >
                {tr('Resume Current Consultation', 'Ipagpatuloy ang Konsultasyon')}
              </button>
            </section>
          )}
          <section className="pm-ask-card">
            <h2>
              <span>▣</span> 1. Choose a Pharmacy Branch
            </h2>
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">{tr('Select a branch', 'Pumili ng branch')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} — {branch.address}
                </option>
              ))}
            </select>
          </section>
          <section className="pm-ask-card">
            <h2>
              <span>♙</span> 2. Available Pharmacists
            </h2>
            {!branchId && <p className="pm-ask-empty">Choose a branch to see pharmacists.</p>}
            {branchId && pharmacists.length === 0 && (
              <p className="pm-ask-empty">No pharmacist is currently listed for this branch.</p>
            )}
            {pharmacists.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`pm-pharmacist-option ${pharmacist?.id === item.id ? 'selected' : ''}`}
                onClick={() => setPharmacist(item)}
              >
                <b>
                  {item.full_name
                    .split(/\s+/)
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('')}
                </b>
                <span>
                  <strong>{item.full_name}</strong>
                  <small>Licensed pharmacist · Available for request</small>
                </span>
                <em>{pharmacist?.id === item.id ? 'Selected' : 'Choose'}</em>
              </button>
            ))}
          </section>
          <section className="pm-ask-card">
            <h2>
              <span>✎</span> 3. Your medication question
            </h2>
            <textarea
              rows={3}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="e.g., I missed a dose this morning. What should I do?"
            />
            <button type="button" className="pm-ask-primary" onClick={start}>
              {tr('Request Chat', 'Humiling ng Chat')}
            </button>
          </section>
          <div className="pm-ask-security">
            ♢{' '}
            <span>
              <strong>Your conversation is private and secure.</strong>
              <small>The pharmacist sees your patient code, not your name.</small>
            </span>
          </div>
        </>
      ) : (
        <section className="pm-chat-shell">
          <div className="pm-chat-header">
            <button
              type="button"
              onClick={startNewConsultation}
              aria-label="Back to consultation start"
            >
              ‹
            </button>
            <b>{(thread.pharmacist_name || pharmacist?.full_name || 'Pharmacist').slice(0, 1)}</b>
            <span>
              <strong>
                {thread.pharmacist_name || pharmacist?.full_name || 'Selected Pharmacist'}
              </strong>
              <small>
                {thread.status === 'closed'
                  ? 'Completed consultation · Read-only history'
                  : thread.validation_status === 'accepted'
                    ? 'Request validated · Pharmacist'
                    : 'Waiting for pharmacist validation'}
              </small>
            </span>
          </div>
          <div className="pm-chat-secure">
            ♢{' '}
            {tr(
              'This conversation is secure and confidential.',
              'Ligtas at kumpidensyal ang usapang ito.'
            )}
          </div>
          {thread.status === 'open' && thread.validation_status !== 'accepted' && (
            <div className="pm-chat-waiting">
              {tr(
                'Your request was sent. Chat will open after the pharmacist accepts and validates it.',
                'Naipadala na ang iyong kahilingan. Magbubukas ang chat kapag tinanggap at sinuri ito ng parmasyutiko.'
              )}
            </div>
          )}
          {thread.status === 'closed' && (
            <div className="pm-chat-waiting">
              {tr(
                'This consultation is complete. You can read the history, but messages are locked until you reconnect.',
                'Tapos na ang konsultasyong ito. Maaari mong basahin ang kasaysayan, ngunit kailangan mong kumonekta muli upang magpadala ng mensahe.'
              )}
            </div>
          )}
          <div className="pm-chat-messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={message.sender_role === 'patient' ? 'mine' : 'theirs'}
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
          {thread.status === 'open' && thread.validation_status === 'accepted' && (
            <div className="pm-chat-compose">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && send()}
                placeholder="Type your message…"
              />
              <button type="button" onClick={send}>
                ➤
              </button>
            </div>
          )}
          {thread.status === 'open' && (
            <button type="button" className="pm-chat-close" onClick={close}>
              Complete &amp; save conversation
            </button>
          )}
          {thread.status === 'closed' && (
            <div className="pm-chat-complete-actions">
              <button type="button" className="pm-ask-primary" onClick={reconnect}>
                {tr('Reconnect with this pharmacist', 'Kumonekta muli sa parmasyutikong ito')}
              </button>
              <button type="button" className="pm-chat-new" onClick={startNewConsultation}>
                {tr('Start a New Consultation', 'Magsimula ng Bagong Konsultasyon')}
              </button>
            </div>
          )}
        </section>
      )}
      {!restoringThread && threads.some((item) => item.status === 'closed') && (
        <section className="pm-ask-card pm-chat-history">
          <h2>{tr('Consultation History', 'Kasaysayan ng Konsultasyon')}</h2>
          {threads
            .filter((item) => item.status === 'closed')
            .map((item) => (
              <button
                type="button"
                key={item.id}
                className={thread?.id === item.id ? 'selected' : ''}
                onClick={() => {
                  setThread(item);
                  setMessages([]);
                  setError('');
                }}
              >
                <span>
                  <strong>
                    {item.subject || tr('Medication consultation', 'Konsultasyon sa gamot')}
                  </strong>
                  <small>{new Date(item.closed_at || item.opened_at).toLocaleDateString()}</small>
                </span>
                <em>{tr('View messages', 'Tingnan ang mensahe')}</em>
              </button>
            ))}
        </section>
      )}
    </main>
  );
}
