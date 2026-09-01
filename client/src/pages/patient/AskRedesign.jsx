import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

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
    unlock: (
      <>
        <rect width="16" height="11" x="4" y="11" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 7.5-2" />
      </>
    ),
    bookmark: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
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
  const [showAllHistory, setShowAllHistory] = useState(true);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historySearchResults, setHistorySearchResults] = useState([]);
  const [historySearchLoading, setHistorySearchLoading] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [historyMessageQuery, setHistoryMessageQuery] = useState('');
  const [requestStep, setRequestStep] = useState(0);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [restoringThread, setRestoringThread] = useState(true);
  const tourChatChoiceVisible = false;
  const poll = useRef(null);
  const threadId = thread?.id;
  const threadStatus = thread?.status;

  useEffect(() => {
    api('/api/directory/branches')
      .then((r) => setBranches(r.data))
      .catch(() => setBranches([]));
  }, []);
  useEffect(() => {
    api('/api/patient/streak/status')
      .then((response) => {
        const tokens = Math.max(0, Number(response.data?.priority_tokens || 0));
        setPriorityTokens(tokens);
        const saved = JSON.parse(localStorage.getItem('pm_priority_streak') || '{}');
        localStorage.setItem('pm_priority_streak', JSON.stringify({ ...saved, tokens }));
        if (tokens < 1) setUsePriority(false);
      })
      .catch(() => setPriorityTokens(loadPriorityTokens()));
  }, []);
  useEffect(() => {
    let cancelled = false;

    async function restoreOpenThread() {
      try {
        const response = await api('/api/patient/inquiries');
        if (cancelled) return;
        const restoredThreads = response.data.map((item) => ({
          ...item,
          priority: item.priority === 'high' || isPriorityInquiry(item.id) ? 'high' : 'normal',
        }));
        setThreads(restoredThreads);
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
        priority: item.priority === 'high' || isPriorityInquiry(item.id) ? 'high' : 'normal',
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

  useEffect(() => {
    const query = historyQuery.trim().toLowerCase();
    if (query.length < 2) { setHistorySearchResults([]); setHistorySearchLoading(false); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setHistorySearchLoading(true);
      try {
        const candidates = threads.filter((item) => item.status === 'closed');
        const messageGroups = await Promise.all(candidates.map(async (item) => {
          const response = await api(`/api/patient/inquiries/${item.id}/messages`);
          return { thread: item, messages: response.data };
        }));
        if (cancelled) return;
        const results = [];
        for (const group of messageGroups) {
          const heading = `${conversationLabels[group.thread.id] || ''} ${group.thread.subject || ''} ${group.thread.pharmacist_name || ''}`.toLowerCase();
          const matchedMessages = group.messages.filter((message) => message.message.toLowerCase().includes(query));
          if (heading.includes(query) && matchedMessages.length === 0) results.push({ thread: group.thread, message: null });
          for (const message of matchedMessages) results.push({ thread: group.thread, message });
        }
        setHistorySearchResults(results.slice(0, 20));
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setHistorySearchLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [conversationLabels, historyQuery, threads]);

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

  async function reconnect(conversation = thread) {
    setError('');
    try {
      const subject = `Follow-up: ${conversation.subject || 'Medication consultation'}`;
      const response = await api('/api/patient/inquiries', {
        method: 'POST',
        body: { subject, branch_id: conversation.branch_id, pharmacist_id: conversation.pharmacist_id },
      });
      await api(`/api/patient/inquiries/${response.data.thread_id}/messages`, {
        method: 'POST',
        body: { message: 'I would like to reconnect for a follow-up consultation.' },
      });
      const newThread = {
        id: response.data.thread_id,
        status: 'open',
        validation_status: response.data.validation_status,
        pharmacist_name: conversation.pharmacist_name,
        branch_id: conversation.branch_id,
        pharmacist_id: conversation.pharmacist_id,
        subject,
        priority: response.data.priority || 'normal',
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
    setChatSearchOpen(false);
    setChatQuery('');
    setRequestStep(0);
    setError('');
  }

  async function viewHistory(item, search = '') {
    setHistoryThread(item);
    setHistoryMessageQuery(search);
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
  const closedThreads = threads.filter((item) => item.status === 'closed');
  const historyPreviewLimit = closedThreads.length > 2 ? 2 : 1;
  const visibleMessages = chatQuery.trim() ? messages.filter((message) => message.message.toLowerCase().includes(chatQuery.trim().toLowerCase())) : messages;
  const visibleHistoryMessages = historyMessageQuery.trim() ? historyMessages.filter((message) => message.message.toLowerCase().includes(historyMessageQuery.trim().toLowerCase())) : historyMessages;
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
      {!thread && requestStep > 0 && (
        <div
          aria-label={tr('Ask a pharmacist progress', 'Progreso sa pagtatanong sa parmasyutiko')}
          aria-valuemax="3"
          aria-valuemin="1"
          aria-valuenow={requestStep}
          className="pm-ask-progress"
          role="progressbar"
        >
          <span style={{ width: `${requestStep * (100 / 3)}%` }} />
        </div>
      )}
      {error && <div className="pm-banner pm-banner--warn">{error}</div>}

      {tourChatChoiceVisible && (
        <section className="pm-ask-card pm-tour-chat-choice" aria-label="Chat type tutorial">
          <div className="pm-ask-priority-heading">
            <span><ChatIcon name="star" /></span>
            <div>
              <h2>{tr('Choose Your Chat Type', 'Piliin ang Uri ng Chat')}</h2>
              <p>
                {tr(
                  'Standard Chat uses the regular queue. Priority Chat uses one token for faster handling.',
                  'Ang Standard Chat ay regular queue. Ang Priority Chat ay gumagamit ng isang token para sa mas mabilis na pag-asikaso.'
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
            id="pm-tour-chat-type-options"
            role="radiogroup"
            aria-label="Standard or Priority Chat"
          >
            <button
              aria-checked={!usePriority}
              className={!usePriority ? 'selected' : ''}
              onClick={() => setUsePriority(false)}
              role="radio"
              type="button"
            >
              <span><ChatIcon name="user" /></span>
              <strong>{tr('Standard Chat', 'Standard Chat')}</strong>
              <small>{tr('Free · Regular pharmacist queue', 'Libre · Regular pharmacist queue')}</small>
              <b>{tr('No token needed', 'Walang token')}</b>
            </button>
            <button
              aria-checked={usePriority}
              className={usePriority ? 'selected priority' : 'priority'}
              disabled={priorityTokens < 1}
              onClick={() => setUsePriority(true)}
              role="radio"
              type="button"
            >
              <span><ChatIcon name={priorityTokens < 1 ? 'lock' : 'star'} /></span>
              <strong>{tr('Priority Chat', 'Priority Chat')}</strong>
              <small>{tr('Faster handling by the pharmacist', 'Mas mabilis na pag-asikaso')}</small>
              <b>
                {priorityTokens < 1
                  ? tr('Locked · Earn 1 token', 'Naka-lock · Kumuha ng 1 token')
                  : tr('Use 1 Token', 'Gumamit ng 1 Token')}
              </b>
            </button>
          </div>
        </section>
      )}

      {restoringThread ? (
        <section className="pm-ask-card pm-ask-empty">
          {tr('Restoring your conversation…', 'Ibinabalik ang iyong usapan…')}
        </section>
      ) : !thread ? (
        <>
          {requestStep === 0 && <div className="pm-ask-home-options">
            <section className="pm-ask-card pm-ask-home-card">
              <span className="pm-ask-home-icon"><ChatIcon name="user" /></span>
              <div><h2>{tr('Ask a Pharmacist', 'Magtanong sa Parmasyutiko')}</h2><p>{tr('Start a new private conversation about your medicine.', 'Magsimula ng pribadong usapan tungkol sa iyong gamot.')}</p></div>
              <button className="pm-ask-primary" onClick={() => { setUsePriority(false); setRequestStep(1); }} type="button">{tr('Ask a Pharmacist', 'Magtanong sa Parmasyutiko')}</button>
            </section>
            <section className="pm-ask-card pm-ask-home-card pm-ask-history-card">
              <span className="pm-ask-home-icon"><ChatIcon name="bookmark" /></span>
              <div><h2>{tr('Conversation History', 'Kasaysayan ng Usapan')}</h2><p>{savedOpenThread ? tr('You have a conversation in progress.', 'May usapan kang kasalukuyang nagpapatuloy.') : tr(`${closedThreads.length} saved conversation${closedThreads.length === 1 ? '' : 's'}`, `${closedThreads.length} naka-save na usapan`)}</p></div>
              <label className="pm-conversation-search"><ChatIcon name="search" /><input aria-label={tr('Search conversation messages', 'Maghanap sa mga mensahe')} onChange={(event) => setHistoryQuery(event.target.value)} placeholder={tr('Search messages or pharmacist', 'Maghanap ng mensahe o parmasyutiko')} value={historyQuery} />{historyQuery && <button aria-label={tr('Clear search', 'Burahin ang hinahanap')} onClick={() => setHistoryQuery('')} type="button"><ChatIcon name="close" /></button>}</label>
              {historyQuery.trim().length >= 2 && <div className="pm-conversation-search-results">{historySearchLoading ? <p>{tr('Searching conversations…', 'Naghahanap sa mga usapan…')}</p> : historySearchResults.length ? historySearchResults.map((result, index) => <button key={`${result.thread.id}-${result.message?.id || index}`} onClick={() => viewHistory(result.thread, historyQuery)} type="button"><span><ChatIcon name="user" /></span><div><strong>{result.thread.pharmacist_name || tr('PharMate Pharmacist', 'Parmasyutiko ng PharMate')}</strong><small>{result.message?.message || result.thread.subject}</small></div></button>) : <p>{tr('No matching messages found.', 'Walang nahanap na katugmang mensahe.')}</p>}</div>}
              {savedOpenThread && <button className="pm-ask-primary" onClick={() => setThread(savedOpenThread)} type="button">{tr('Resume Current Conversation', 'Ipagpatuloy ang Kasalukuyang Usapan')}</button>}
              {closedThreads.length > 0 && <button className="pm-ask-secondary" onClick={() => setShowAllHistory((value) => !value)} type="button">{showAllHistory ? tr('Hide Conversation History', 'Itago ang Kasaysayan') : tr('View Conversation History', 'Tingnan ang Kasaysayan')}</button>}
            </section>
          </div>}

          {requestStep === 1 && <section className="pm-ask-card pm-ask-single-step">
            <button className="pm-ask-back" onClick={() => setRequestStep(0)} type="button"><ChatIcon name="back" />{tr('Back', 'Bumalik')}</button>
            <h2>{tr('Choose your pharmacy branch', 'Piliin ang branch ng parmasya')}</h2>
            <p>{tr('Choose the pharmacy you normally use.', 'Piliin ang parmasyang karaniwan mong ginagamit.')}</p>
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">{tr('Choose a branch', 'Pumili ng branch')}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} — {branch.address}</option>)}</select>
            <button className="pm-ask-primary" disabled={!branchId} onClick={() => setRequestStep(2)} type="button">{tr('Continue', 'Magpatuloy')}</button>
          </section>}

          {requestStep === 2 && <section className="pm-ask-card pm-ask-single-step">
            <button className="pm-ask-back" onClick={() => setRequestStep(1)} type="button"><ChatIcon name="back" />{tr('Back', 'Bumalik')}</button>
            <h2>{tr('Choose a pharmacist', 'Pumili ng parmasyutiko')}</h2>
            <p>{tr('Choose who you would like to ask.', 'Piliin kung sino ang gusto mong tanungin.')}</p>
            {pharmacists.length === 0 && <p className="pm-ask-empty">{tr('No pharmacist is currently listed for this branch.', 'Walang parmasyutikong nakalista sa branch na ito ngayon.')}</p>}
            {pharmacists.map((item) => <button className={`pm-pharmacist-option ${pharmacist?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setPharmacist(item)} type="button"><b>{item.full_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}</b><span><strong>{item.full_name}</strong><small>{tr('Licensed pharmacist', 'Lisensyadong parmasyutiko')}</small></span><em>{pharmacist?.id === item.id ? tr('Selected', 'Napili') : tr('Choose', 'Piliin')}</em></button>)}
            <button className="pm-ask-primary" disabled={!pharmacist} onClick={() => setRequestStep(3)} type="button">{tr('Continue', 'Magpatuloy')}</button>
          </section>}

          {requestStep === 3 && <section className="pm-ask-card pm-ask-single-step">
            <button className="pm-ask-back" onClick={() => setRequestStep(2)} type="button"><ChatIcon name="back" />{tr('Back', 'Bumalik')}</button>
            <h2>{tr('What would you like to ask?', 'Ano ang gusto mong itanong?')}</h2>
            <p>{tr('Write your medicine question below.', 'Isulat sa ibaba ang tanong mo tungkol sa gamot.')}</p>
            <textarea onChange={(event) => setQuestion(event.target.value)} placeholder={tr('Type your question here…', 'I-type ang tanong dito…')} rows={5} value={question} />
            <fieldset className="pm-chat-type-choice">
              <legend>{tr('Choose your chat type', 'Piliin ang uri ng chat')}</legend>
              <div className="pm-chat-token-balance">
                <span>{tr('Your Priority Tokens', 'Iyong Priority Tokens')}</span>
                <strong>{priorityTokens}</strong>
              </div>
              <button aria-pressed={!usePriority} className={!usePriority ? 'selected' : ''} onClick={() => setUsePriority(false)} type="button">
                <span><ChatIcon name="user" /></span>
                <div><strong>{tr('Standard Chat', 'Standard Chat')}</strong><small>{tr('Regular pharmacist queue · No token needed', 'Regular na pila · Walang token')}</small></div>
              </button>
              <button aria-disabled={priorityTokens < 1} aria-pressed={usePriority} className={usePriority ? 'selected priority' : 'priority'} disabled={priorityTokens < 1} onClick={() => setUsePriority(true)} type="button">
                <span><ChatIcon name={priorityTokens < 1 ? 'lock' : 'star'} /></span>
                <div>
                  <strong>{tr('Priority Chat', 'Priority Chat')}</strong>
                  <small>
                    {priorityTokens < 1
                      ? tr('No priority tokens available', 'Walang priority token')
                      : tr(`${priorityTokens} ${priorityTokens === 1 ? 'token' : 'tokens'} available · Uses 1`, `${priorityTokens} token ang available · Gumagamit ng 1`)}
                  </small>
                </div>
              </button>
              {priorityTokens < 1 && (
                <div className="pm-chat-priority-learn">
                  <span>{tr('Earn tokens by completing your Adherence Streak.', 'Kumuha ng token sa pagkumpleto ng Adherence Streak.')}</span>
                  <a href="/patient/streak">{tr('Learn more', 'Alamin pa')}</a>
                </div>
              )}
            </fieldset>
            <button className="pm-ask-primary" disabled={!question.trim()} onClick={start} type="button">{tr('Send Question', 'Ipadala ang Tanong')}</button>
            <div className="pm-ask-security"><ChatIcon name="shield" /><span><strong>{tr('Private and secure', 'Pribado at ligtas')}</strong><small>{tr('Only the pharmacist can view this conversation.', 'Ang parmasyutiko lamang ang makakakita sa usapang ito.')}</small></span></div>
          </section>}
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
            <button className="pm-chat-search-button" aria-label={tr('Search this conversation', 'Maghanap sa usapang ito')} onClick={() => setChatSearchOpen((value) => !value)} type="button"><ChatIcon name={chatSearchOpen ? 'close' : 'search'} /></button>
          </div>
          {chatSearchOpen && <label className="pm-chat-inline-search"><ChatIcon name="search" /><input autoFocus onChange={(event) => setChatQuery(event.target.value)} placeholder={tr('Search messages in this conversation', 'Maghanap ng mensahe sa usapang ito')} value={chatQuery} />{chatQuery && <button aria-label={tr('Clear search', 'Burahin ang hinahanap')} onClick={() => setChatQuery('')} type="button"><ChatIcon name="close" /></button>}</label>}
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
            {visibleMessages.map((message) => (
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
            {chatQuery.trim() && visibleMessages.length === 0 && <p className="pm-chat-search-empty">{tr('No matching messages found.', 'Walang nahanap na katugmang mensahe.')}</p>}
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
              <button type="button" className="pm-ask-primary" onClick={() => reconnect(thread)}>
                {tr('Request to Continue Conversation', 'Humiling na Ipagpatuloy ang Usapan')}
              </button>
              <button type="button" className="pm-chat-new" onClick={startNewConsultation}>
                {tr('Start a New Consultation', 'Magsimula ng Bagong Konsultasyon')}
              </button>
            </div>
          )}
        </section>
      )}
      {!restoringThread && !thread && requestStep === 0 && showAllHistory && closedThreads.length > 0 && (
        <section className="pm-ask-card pm-chat-history">
          <header className="pm-chat-history-header">
            <div>
              <h2>{tr('Conversation History', 'Kasaysayan ng Usapan')}</h2>
              <small>
                {tr(
                  `${closedThreads.length} saved conversation${closedThreads.length === 1 ? '' : 's'}`,
                  `${closedThreads.length} naka-save na usapan`
                )}
              </small>
            </div>
            {closedThreads.length > historyPreviewLimit && (
              <button
                aria-expanded={showAllHistory}
                onClick={() => setShowAllHistory((value) => !value)}
                type="button"
              >
                {showAllHistory
                  ? tr('Show less', 'Mas kaunti')
                  : tr('See all', 'Tingnan lahat')}
              </button>
            )}
          </header>
          {closedThreads
            .slice(0, showAllHistory ? closedThreads.length : historyPreviewLimit)
            .map((item) => (
              <article
                key={item.id}
                className={`pm-history-entry ${historyThread?.id === item.id ? 'selected' : ''}`}
              >
                <div className="pm-history-entry-summary">
                  <span className="pm-history-bookmark-icon pm-history-pharmacist-icon">
                    <ChatIcon name="user" />
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
                    <small className="pm-history-pharmacist-name">{item.pharmacist_name || tr('PharMate Pharmacist', 'Parmasyutiko ng PharMate')}</small>
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
                  <button className="pm-history-continue" onClick={() => reconnect(item)} type="button">
                    {tr('Request to continue', 'Humiling na ipagpatuloy')}
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
              <button className="pm-history-search-button" aria-label={tr('Search this conversation', 'Maghanap sa usapang ito')} onClick={() => setChatSearchOpen((value) => !value)} type="button"><ChatIcon name={chatSearchOpen ? 'close' : 'search'} /></button>
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
            {chatSearchOpen && <label className="pm-chat-inline-search pm-history-inline-search"><ChatIcon name="search" /><input autoFocus onChange={(event) => setHistoryMessageQuery(event.target.value)} placeholder={tr('Search messages in this conversation', 'Maghanap ng mensahe sa usapang ito')} value={historyMessageQuery} />{historyMessageQuery && <button aria-label={tr('Clear search', 'Burahin ang hinahanap')} onClick={() => setHistoryMessageQuery('')} type="button"><ChatIcon name="close" /></button>}</label>}
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
              ) : visibleHistoryMessages.length ? (
                visibleHistoryMessages.map((message) => {
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
                  {historyMessageQuery.trim() ? tr('No matching messages found.', 'Walang nahanap na katugmang mensahe.') : tr('No messages were saved in this consultation.', 'Walang mensaheng na-save sa konsultasyong ito.')}
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
