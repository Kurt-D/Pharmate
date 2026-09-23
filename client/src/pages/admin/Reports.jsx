import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

export default function Reports() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [alerts, setAlerts] = useState({ alerts: [] });
  const [selectedReportDate, setSelectedReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([api('/api/admin/reports/summary'), api('/api/admin/adherence-trend?days=7'), api('/api/admin/alerts')])
      .then(([summaryResponse, trendResponse, alertsResponse]) => {
        if (!active) return;
        setSummary(summaryResponse.data);
        setTrend(trendResponse.data);
        setAlerts(alertsResponse.data || { alerts: [] });
      })
      .catch((requestError) => active && setError(requestError.message || 'Unable to load report data.'));
    return () => { active = false; };
  }, []);

  const statuses = useMemo(() => {
    const total = (summary?.dose_statuses || []).reduce((sum, item) => sum + item.count, 0) || 1;
    return (summary?.dose_statuses || []).map((item) => ({ ...item, percent: Math.round((item.count / total) * 100) }));
  }, [summary]);
  const calendarDays = useMemo(() => {
    const today = new Date();
    const offset = (today.getDay() + 6) % 7;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
      return { date, key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` };
    });
  }, []);
  const selectedTrend = trend.find((point) => String(point.date).slice(0, 10) === selectedReportDate);

  return (
    <section className="admin-report-page">
      {error && <div className="alert alert-warning">{error}</div>}
      {!summary ? <div className="pw-card p-4 text-muted">Loading report data…</div> : <div className="admin-report-workspace">
        <div className="admin-report-main">
          <section className="admin-report-alerts" aria-labelledby="reports-alerts-title"><header><div><h3 id="reports-alerts-title">System alerts</h3><p>Operational items that need administrative attention.</p></div><button className="btn btn-outline-primary btn-sm" type="button" onClick={() => navigate('/admin/alerts')}>View all alerts</button></header><div className="admin-report-alerts__list">{alerts.alerts?.length ? alerts.alerts.slice(0, 4).map((alert) => <button key={alert.id} type="button" onClick={() => navigate('/admin/alerts')}><i className={`is-${alert.severity || 'info'}`} aria-hidden="true" /><span><strong>{alert.title}</strong><small>{alert.description}</small></span><em>{alert.severity || 'info'}</em></button>) : <p>No active system alerts.</p>}</div></section>
          <div className="admin-report-grid">
            <article className="pw-card admin-report-chart"><header><div><h3>Adherence trend</h3><p>Scheduled doses recorded each day.</p></div><strong>{summary.adherence.percentage}%</strong></header><div className="admin-report-bars" aria-label="Seven day adherence chart">{trend.length ? trend.map((point) => <div key={point.date}><span style={{ height: `${Math.max(5, point.pct || 0)}%` }} /><small>{new Date(point.date).toLocaleDateString([], { weekday: 'narrow' })}</small></div>) : <p>No adherence activity yet.</p>}</div></article>
            <article className="pw-card admin-report-chart"><header><div><h3>Dose status</h3><p>Current medication schedule records.</p></div></header><div className="admin-report-statuses">{statuses.map((item) => <div key={item.status}><span><b>{item.status.replace('_', ' ')}</b><small>{item.count} records</small></span><i><em style={{ width: `${item.percent}%` }} /></i><strong>{item.percent}%</strong></div>)}</div></article>
          </div>
        </div><aside className="admin-report-calendar"><small>REPORTING PERIOD</small><h3>{new Date(`${selectedReportDate}T12:00:00`).toLocaleDateString([], { month: 'long', day: 'numeric' })}</h3><div className="admin-report-calendar__days">{calendarDays.map(({ date, key }) => <button aria-pressed={selectedReportDate === key} className={selectedReportDate === key ? 'active' : ''} key={key} onClick={() => setSelectedReportDate(key)} type="button"><small>{date.toLocaleDateString([], { weekday: 'narrow' })}</small><b>{date.getDate()}</b></button>)}</div><h4>Report snapshot</h4><p><b>{selectedTrend?.pct ?? '—'}{selectedTrend?.pct != null ? '%' : ''}</b> adherence on this date</p><p><b>{summary.adherence.scheduled-summary.adherence.taken}</b> doses need attention</p><p><b>{summary.surveys.sus+summary.surveys.tam}</b> feedback responses</p></aside>
      </div>}
    </section>
  );
}
