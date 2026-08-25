import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

const STEPS = ['Request', 'Review', 'Chat', 'Complete'];

function loadPriorityTokens() {
  try {
    const streak = JSON.parse(localStorage.getItem('pm_priority_streak') || 'null');
    return Math.max(0, Number(streak?.tokens || 0));
  } catch {
    return 0;
  }
}

function loadConversationLabels() {
  try {
    return JSON.parse(localStorage.getItem('pm_conversation_labels') || '{}');
  } catch {
    return {};
  }
}

function isPriorityInquiry(id) {
  try {
    return JSON.parse(localStorage.getItem('pm_priority_inquiries') || '[]').includes(id);
  } catch {
    return false;
  }
}

function spendPriorityToken(threadId) {
  let streak = {};
  let inquiries = [];
  try {
    streak = JSON.parse(localStorage.getItem('pm_priority_streak') || 'null') || {};
    inquiries = JSON.parse(localStorage.getItem('pm_priority_inquiries') || '[]');
  } catch {
    streak = {};
    inquiries = [];
  }
  const tokens = Math.max(0, Number(streak.tokens || 0) - 1);
  localStorage.setItem('pm_priority_streak', JSON.stringify({ ...streak, tokens }));
  localStorage.setItem(
    'pm_priority_inquiries',
    JSON.stringify([...new Set([threadId, ...inquiries])])
  );
  return tokens;
}

function ChatIcon({ name }) {
  const paths = {
    back: (
      <>
        <path d="m15 18-6-6 6-6" />
        <path d="M9 12h10" />
      </>
    ),
    shield: (
      <>
        <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 22a8 8 0 0 1 16 0" />
      </>
    ),
    sent: (
      <>
        <path d="m1 12 4 4L15 6" />
        <path d="m9 15 2 2L23 5" />
      </>
    ),
    star: (
      <path d="m12 2.5 2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.06l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93L12 2.5Z" />
    ),
    lock: (
      <>
        <rect width="16" height="11" x="4" y="11" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
    bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />,
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
    >
      {paths[name]}
    </svg>
  );
}

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
  const [historyThread, setHistoryThread] = useState(null);
  const [historyMessages, setHistoryMessages] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [priorityTokens, setPriorityTokens] = useState(loadPriorityTokens);
  const [usePriority, setUsePriority] = useState(false);
  const [conversationLabels, setConversationLabels] = useState(loadConversationLabels);
  const [editingLabelId, setEditingLabelId] = useState(null);
  const [labelDraft, setLabelDraft] = useState('');
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
        const restoredThreads = response.data.map((item) => ({
          ...item,
          priority: isPriorityInquiry(item.id) ? 'high' : 'normal',
        }));
        setThreads(restoredThreads);
        const existingThread =
          restoredThreads.find((item) => item.status === 'open') || restoredThreads[0];
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
      const refreshedThreads = threadResponse.data.map((item) => ({
        ...item,
        priority: isPriorityInquiry(item.id) ? 'high' : 'normal',
      }));
      const current = refreshedThreads.find((item) => item.id === id);
      setThreads(refreshedThreads);
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
      const priorityApplied = usePriority && priorityTokens > 0;
      if (priorityApplied) setPriorityTokens(spendPriorityToken(response.data.thread_id));
      setThread({
        id: response.data.thread_id,
        status: 'open',
        validation_status: response.data.validation_status,
        pharmacist_name: pharmacist.full_name,
        branch_id: branchId,
        pharmacist_id: pharmacist.id,
        subject: question.trim(),
        priority: priorityApplied ? 'high' : 'normal',
      });
      setQuestion('');
      setUsePriority(false);
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
    setUsePriority(false);
    setError('');
  }

  async function viewHistory(item) {
    setHistoryThread(item);
    setHistoryMessages([]);
    setHistoryLoading(true);
    setError('');
    try {
      const response = await api(`/api/patient/inquiries/${item.id}/messages`);
      setHistoryMessages(response.data);
    } catch (requestError) {
      setError(requestError.message);
      setHistoryThread(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  function prioritizeCurrentThread() {
    if (!thread?.id || thread.priority === 'high' || priorityTokens < 1) return;
    setPriorityTokens(spendPriorityToken(thread.id));
    setThread((current) => ({ ...current, priority: 'high' }));
    setThreads((items) =>
      items.map((item) => (item.id === thread.id ? { ...item, priority: 'high' } : item))
    );
  }

  function editConversationLabel(item) {
    setEditingLabelId(item.id);
    setLabelDraft(conversationLabels[item.id] || '');
  }

  function saveConversationLabel(id) {
    const label = labelDraft.trim();
    setConversationLabels((current) => {
      const updated = { ...current };
      if (label) updated[id] = label;
      else delete updated[id];
      localStorage.setItem('pm_conversation_labels', JSON.stringify(updated));
      return updated;
    });
    setEditingLabelId(null);
    setLabelDraft('');
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
            <div className="pm-ask-priority-heading">
              <span>
                <ChatIcon name="star" />
              </span>
              <div>
                <h2>{tr('Choose Your Chat Type', 'Piliin ang Uri ng Chat')}</h2>
                <p>
                  {tr(
                    'Choose standard chat for regular assistance or use one token for priority handling.',
                    'Piliin ang standard chat para sa regular na tulong o gumamit ng isang token para sa priority handling.'
                  )}
                </p>
              </div>
            </div>
            <div className="pm-ask-priority-balance">
              <span>{tr('Your Priority Tokens', 'Iyong Priority Tokens')}</span>
              <strong>{priorityTokens}</strong>
            </div>
            <div
              className="pm-ask-chat-options"
              role="radiogroup"
              aria-label={tr('Chat type', 'Uri ng chat')}
            >
              <button
                aria-checked={!usePriority}
                className={!usePriority ? 'selected' : ''}
                onClick={() => setUsePriority(false)}
                role="radio"
                type="button"
              >
                <span>
                  <ChatIcon name="user" />
                </span>
                <strong>{tr('Standard Chat', 'Standard Chat')}</strong>
                <small>
                  {tr(
                    'No token required. Receive help through the regular queue.',
                    'Walang token na kailangan. Makakatanggap ng tulong sa regular queue.'
                  )}
                </small>
                <b>{tr('Free', 'Libre')}</b>
              </button>
              <button
                aria-checked={usePriority}
                className={usePriority ? 'selected priority' : 'priority'}
                disabled={priorityTokens < 1}
                onClick={() => setUsePriority(true)}
                role="radio"
                type="button"
              >
                <span>
                  <ChatIcon name={priorityTokens < 1 ? 'lock' : 'star'} />
                </span>
                <strong>{tr('Priority Chat', 'Priority Chat')}</strong>
                <small>
                  {tr(
                    'Placed ahead of standard requests for the fastest response.',
                    'Mauuna sa mga standard request para sa pinakamabilis na tugon.'
                  )}
                </small>
                <b>
                  {priorityTokens < 1
                    ? tr('Locked · 1 token required', 'Naka-lock · kailangan ng 1 token')
                    : tr('Uses 1 token', 'Gumagamit ng 1 token')}
                </b>
              </button>
            </div>
            {priorityTokens < 1 && (
              <a className="pm-ask-earn-tokens" href="/patient/streak">
                {tr('See how to earn tokens', 'Alamin kung paano makakuha ng token')}
              </a>
            )}
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
              {usePriority
                ? tr('Request Priority Chat', 'Humiling ng Priority Chat')
                : tr('Request Standard Chat', 'Humiling ng Standard Chat')}
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
        <section
          className={`pm-chat-shell ${thread.priority === 'high' ? 'priority-chat' : 'standard-chat'}`}
        >
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
              {thread.priority === 'high' && (
                <em className="pm-priority-chat-sign">
                  <ChatIcon name="star" /> {tr('Priority Chat', 'Priority Chat')}
                </em>
              )}
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
            <section
              className={`pm-chat-priority-booking ${thread.priority === 'high' ? 'applied' : ''}`}
            >
              <span>
                <ChatIcon name="star" />
              </span>
              <div>
                <strong>
                  {thread.priority === 'high'
                    ? tr('Priority request active', 'Aktibo ang priority request')
                    : tr('Need a faster response?', 'Kailangan ng mas mabilis na tugon?')}
                </strong>
                <small>
                  {thread.priority === 'high'
                    ? tr(
                        'Estimated pharmacist reply: 5–20 minutes.',
                        'Tinatayang tugon ng parmasyutiko: 5–20 minuto.'
                      )
                    : tr(
                        `${priorityTokens} priority ${priorityTokens === 1 ? 'token' : 'tokens'} available`,
                        `${priorityTokens} priority token ang available`
                      )}
                </small>
              </div>
              {thread.priority === 'high' ? (
                <b>{tr('Priority', 'Priority')}</b>
              ) : priorityTokens > 0 ? (
                <button onClick={prioritizeCurrentThread} type="button">
                  {tr('Use 1 Token', 'Gumamit ng 1 Token')}
                </button>
              ) : (
                <a href="/patient/streak">{tr('Earn tokens', 'Kumuha ng token')}</a>
              )}
            </section>
          )}
          {thread.status === 'open' && thread.validation_status !== 'accepted' && (
            <div
              className={`pm-chat-waiting ${thread.priority === 'high' ? 'priority' : 'standard'}`}
            >
              {thread.priority === 'high' ? (
                <>
                  <ChatIcon name="star" />
                  <span>
                    <strong>
                      {tr('Priority request submitted', 'Naipadala ang priority request')}
                    </strong>
                    {tr(
                      'Your pharmacist is expected to reply within 5–20 minutes. Priority requests are handled first.',
                      'Inaasahang sasagot ang parmasyutiko sa loob ng 5–20 minuto. Inuuna ang mga priority request.'
                    )}
                  </span>
                </>
              ) : (
                <span>
                  <strong>
                    {tr('Standard chat request submitted', 'Naipadala ang standard chat request')}
                  </strong>
                  {tr(
                    'Please wait patiently for an available pharmacist. Priority requests may be answered before standard requests.',
                    'Mangyaring maghintay para sa available na parmasyutiko. Maaaring maunang sagutin ang mga priority request.'
                  )}
                </span>
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
          <div className={`pm-chat-messages ${thread.priority === 'high' ? 'premium' : ''}`}>
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
          <h2>{tr('Conversation History', 'Kasaysayan ng Usapan')}</h2>
          {threads
            .filter((item) => item.status === 'closed')
            .map((item) => (
              <article
                key={item.id}
                className={`pm-history-entry ${historyThread?.id === item.id ? 'selected' : ''}`}
              >
                <div className="pm-history-entry-summary">
                  <span className="pm-history-bookmark-icon">
                    <ChatIcon name="bookmark" />
                  </span>
                  <span>
                    <strong>
                      {conversationLabels[item.id] ||
                        item.subject ||
                        tr('Medication conversation', 'Usapan tungkol sa gamot')}
                    </strong>
                    {conversationLabels[item.id] && (
                      <small>
                        {tr('Topic:', 'Paksa:')}{' '}
                        {item.subject || tr('Medication conversation', 'Usapan tungkol sa gamot')}
                      </small>
                    )}
                    <small>{new Date(item.closed_at || item.opened_at).toLocaleDateString()}</small>
                    <span
                      className={`pm-history-chat-type ${item.priority === 'high' ? 'priority' : 'standard'}`}
                    >
                      <ChatIcon name={item.priority === 'high' ? 'star' : 'user'} />
                      {item.priority === 'high'
                        ? tr('Priority Chat', 'Priority Chat')
                        : tr('Standard Chat', 'Standard Chat')}
                    </span>
                  </span>
                </div>
                <div className="pm-history-entry-actions">
                  <button onClick={() => viewHistory(item)} type="button">
                    {tr('View messages', 'Tingnan ang mensahe')}
                  </button>
                  <button onClick={() => editConversationLabel(item)} type="button">
                    <ChatIcon name="bookmark" />{' '}
                    {conversationLabels[item.id]
                      ? tr('Edit bookmark', 'Baguhin ang bookmark')
                      : tr('Add bookmark', 'Magdagdag ng bookmark')}
                  </button>
                </div>
                {editingLabelId === item.id && (
                  <div className="pm-history-label-editor">
                    <label htmlFor={`conversation-label-${item.id}`}>
                      {tr('Conversation bookmark', 'Bookmark ng usapan')}
                    </label>
                    <input
                      id={`conversation-label-${item.id}`}
                      maxLength={50}
                      onChange={(event) => setLabelDraft(event.target.value)}
                      placeholder={tr(
                        'Example: Missed morning dose',
                        'Halimbawa: Nakaligtaang dose sa umaga'
                      )}
                      value={labelDraft}
                    />
                    <button onClick={() => saveConversationLabel(item.id)} type="button">
                      {tr('Save label', 'I-save ang label')}
                    </button>
                    <button onClick={() => setEditingLabelId(null)} type="button">
                      {tr('Cancel', 'Kanselahin')}
                    </button>
                  </div>
                )}
              </article>
            ))}
        </section>
      )}
      {historyThread && (
        <div className="pm-history-modal-backdrop">
          <section
            className={`pm-history-modal ${historyThread.priority === 'high' ? 'priority-history' : 'standard-history'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-message-title"
          >
            <header className="pm-history-chat-header">
              <button type="button" onClick={() => setHistoryThread(null)}>
                <ChatIcon name="back" />
                <span className="pm-visually-hidden">{tr('Back', 'Bumalik')}</span>
              </button>
              <span className="pm-history-avatar" aria-hidden="true">
                <ChatIcon name="user" />
              </span>
              <div>
                <h2 id="history-message-title">
                  {tr('Chat with Pharmacist', 'Chat sa Parmasyutiko')}
                </h2>
                <p className="pm-history-modal-subject">
                  <ChatIcon name="bookmark" />{' '}
                  {conversationLabels[historyThread.id] ||
                    historyThread.subject ||
                    tr('Medication conversation', 'Usapan tungkol sa gamot')}
                </p>
                <strong>
                  {historyThread.pharmacist_name ||
                    tr('PharMate Pharmacist', 'Parmasyutiko ng PharMate')}
                </strong>
                <small>{tr('Licensed Pharmacist', 'Lisensyadong Parmasyutiko')}</small>
                <span
                  className={`pm-history-modal-type ${historyThread.priority === 'high' ? 'priority' : 'standard'}`}
                >
                  <ChatIcon name={historyThread.priority === 'high' ? 'star' : 'user'} />
                  {historyThread.priority === 'high'
                    ? tr('Priority Chat', 'Priority Chat')
                    : tr('Standard Chat', 'Standard Chat')}
                </span>
              </div>
            </header>
            <div className="pm-history-secure">
              <ChatIcon name="shield" />
              <span>
                {tr(
                  'This conversation is secure and confidential.',
                  'Ligtas at kumpidensyal ang usapang ito.'
                )}
              </span>
            </div>
            <div className="pm-history-message-list">
              <div className="pm-history-date-divider">
                <span>
                  {new Date(historyThread.closed_at || historyThread.opened_at).toLocaleDateString(
                    [],
                    { month: 'long', day: 'numeric', year: 'numeric' }
                  )}
                </span>
              </div>
              {historyLoading ? (
                <p className="pm-history-message-empty">
                  {tr('Loading messages…', 'Nilo-load ang mga mensahe…')}
                </p>
              ) : historyMessages.length ? (
                historyMessages.map((message) => {
                  const isPatient = message.sender_role === 'patient';
                  return (
                    <div
                      className={`pm-history-message-row ${isPatient ? 'patient' : 'pharmacist'}`}
                      key={message.id}
                    >
                      {!isPatient && (
                        <span className="pm-history-message-avatar" aria-hidden="true">
                          <ChatIcon name="user" />
                        </span>
                      )}
                      <article>
                        <p>{message.message}</p>
                        <time>
                          {new Date(message.sent_at).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                          {isPatient && (
                            <span aria-label={tr('Sent', 'Naipadala')}>
                              <ChatIcon name="sent" />
                            </span>
                          )}
                        </time>
                      </article>
                    </div>
                  );
                })
              ) : (
                <p className="pm-history-message-empty">
                  {tr(
                    'No messages were saved in this consultation.',
                    'Walang mensaheng na-save sa konsultasyong ito.'
                  )}
                </p>
              )}
            </div>
            <footer className="pm-history-readonly">
              <ChatIcon name="shield" />
              <span>
                {tr(
                  'Completed consultation · Message history is read-only',
                  'Tapos na konsultasyon · Mababasa lamang ang kasaysayan'
                )}
              </span>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
