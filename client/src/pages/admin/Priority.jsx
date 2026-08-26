import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, Info, MessageSquare, RefreshCw, ShieldCheck, Star, Ticket, TrendingUp, Users } from 'lucide-react';
import { api } from '../../api.js';
import '../../styles/admin-priority.css';

export default function Priority() {
  const navigate = useNavigate();
  const [data, setData] = useState({ priority: 0, standard: 0, total: 0, chats: {}, activity: [], reward_policy: [] });
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); try { const response = await api('/api/admin/priority'); setData(response.data); setError(''); } catch (requestError) { setError(requestError.message); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const maxActivity = Math.max(1, ...data.activity.map((row) => row.priority + row.standard));
  return <section className="admin-priority-workspace">
    <header className="admin-priority-heading"><div><span>PRIORITY CHAT OPERATIONS</span><h2>Priority Token Management</h2><p>Monitor priority-chat demand, explain how tokens are earned, and keep priority handling transparent.</p></div><button onClick={load} disabled={loading} type="button"><RefreshCw size={17} className={loading ? 'is-spinning' : ''} />Refresh</button></header>
    {error && <div className="admin-priority-error">{error}</div>}
    <section className="priority-explainer"><span><Ticket size={25} /></span><div><h3>How Priority Tokens work</h3><p>Patients earn tokens by completing medication streak milestones. One token may be used for Priority Chat, placing the request ahead of standard chats. Pharmacists still control all clinical decisions.</p></div><button onClick={() => navigate('/admin/alerts')} type="button">Monitor related alerts <ArrowRight size={16} /></button></section>
    <div className="priority-metrics">
      <article className="blue"><span><Clock3 size={21} /></span><div><strong>{data.chats.priority_open || 0}</strong><small>Priority chats waiting</small></div></article>
      <article className="green"><span><CheckCircle2 size={21} /></span><div><strong>{data.chats.priority_total || 0}</strong><small>Priority chats recorded</small></div></article>
      <article className="amber"><span><MessageSquare size={21} /></span><div><strong>{data.chats.standard_open || 0}</strong><small>Standard chats waiting</small></div></article>
      <article className="violet"><span><Users size={21} /></span><div><strong>{data.total || 0}</strong><small>Eligible patient accounts</small></div></article>
    </div>
    <div className="priority-grid">
      <section className="priority-card reward-policy"><header><div><span><Star size={19} /></span><div><h3>Token reward policy</h3><p>Current patient adherence milestones</p></div></div><b>Active policy</b></header><div className="reward-journey">{data.reward_policy.map((rule, index) => <article key={rule.day}><span>{rule.day}</span><div><b>Day {rule.day} streak</b><small>Patient earns {rule.tokens} priority {rule.tokens === 1 ? 'token' : 'tokens'}</small></div>{index < data.reward_policy.length - 1 ? <ArrowRight size={17} /> : null}</article>)}</div><aside><Info size={17} /><p>Completing all scheduled doses without a missed dose advances the streak. Token earning is displayed on the patient’s Adherence Streak page.</p></aside></section>
      <section className="priority-card eligibility"><header><div><span><ShieldCheck size={19} /></span><div><h3>Verified priority eligibility</h3><p>Separate from streak-earned tokens</p></div></div></header><div className="eligibility-chart"><div style={{ '--priority': `${data.total ? (data.priority / data.total) * 100 : 0}%` }}><span><b>{data.priority}</b><small>Verified priority</small></span></div><dl><div><dt>Verified priority accounts</dt><dd>{data.priority}</dd></div><div><dt>Standard accounts</dt><dd>{data.standard}</dd></div><div><dt>Total monitored</dt><dd>{data.total}</dd></div></dl></div><p className="privacy-note"><ShieldCheck size={15} />Only aggregate counts are shown. Patient diagnoses and clinical reasons remain hidden from administrators.</p></section>
      <section className="priority-card activity"><header><div><span><TrendingUp size={19} /></span><div><h3>Priority chat activity</h3><p>Last seven days of chat requests</p></div></div></header><div className="priority-bars">{data.activity.length ? data.activity.map((row) => <article key={String(row.date)}><div><span className="priority" style={{ height: `${Math.max(4, (row.priority / maxActivity) * 100)}%` }} /><span className="standard" style={{ height: `${Math.max(4, (row.standard / maxActivity) * 100)}%` }} /></div><small>{new Date(row.date).toLocaleDateString('en-PH', { weekday: 'short' })}</small></article>) : <div className="priority-empty"><TrendingUp size={28} /><b>No chat activity yet</b><span>Priority and standard requests will appear here.</span></div>}</div><footer><span><i className="priority" />Priority chat</span><span><i className="standard" />Standard chat</span></footer></section>
    </div>
  </section>;
}
