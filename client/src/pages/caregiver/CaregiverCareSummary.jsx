import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { api } from '../../api.js';
import { dayKey, summarizeDoses } from '../../lib/caregiverMetrics.js';
import '../../styles/caregiver-summary.css';

export default function CaregiverCareSummary({ patientCode, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const now = new Date();
  const end = dayKey(now);
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - 6);
  const start = dayKey(startDate);
  const key = `${patientCode}:${start}:${end}`;
  useEffect(() => {
    let current = true;
    setData(null);
    setError('');
    api(
      `/api/caregiver/patients/${encodeURIComponent(patientCode)}/doses/history?startDate=${start}&endDate=${end}`
    )
      .then(({ data: rows }) => {
        if (current) setData({ key, rows: Array.isArray(rows) ? rows : [] });
      })
      .catch((e) => {
        if (current) setError(e.message || 'Unable to load care summary.');
      });
    return () => {
      current = false;
    };
  }, [key, patientCode, start, end, refreshKey, retry]);
  const rows = data?.key === key ? data.rows : [];
  const forDate = (date) =>
    rows.filter((row) => dayKey(new Date(row.scheduled_at || row.scheduled_time)) === date);
  const today = summarizeDoses(forDate(end), now);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    return { date, ...summarizeDoses(forDate(dayKey(date)), now) };
  });
  return (
    <section className="cg-care-summary" aria-labelledby="cg-summary-title">
      <header>
        <div>
          <span className="cg-eyebrow">PATIENT WELLBEING</span>
          <h2 id="cg-summary-title">Today’s care summary</h2>
          <p>Scheduled medicine activity at a glance</p>
        </div>
        <Activity aria-hidden="true" />
      </header>
      {error ? (
        <div role="alert">
          {error}
          <button onClick={() => setRetry(retry + 1)} type="button">
            Retry
          </button>
        </div>
      ) : data?.key !== key ? (
        <p role="status">Loading patient activity…</p>
      ) : (
        <>
          <div className="cg-summary-total">
            <div>
              <strong>
                {today.counts.Taken}
                <small> / {today.total}</small>
              </strong>
              <span>Doses completed today</span>
            </div>
            <span className="cg-summary-tag">
              {today.total ? 'Live tracking' : 'No scheduled doses'}
            </span>
          </div>
          <div
            className="cg-status-track"
            role="img"
            aria-label={Object.entries(today.counts)
              .map(([name, count]) => `${count} ${name}`)
              .join(', ')}
          >
            {Object.entries(today.counts).map(([name, count]) => (
              <span
                key={name}
                className={`cg-status-${name.toLowerCase()}`}
                style={{ width: `${today.total ? (count / today.total) * 100 : 0}%` }}
              />
            ))}
          </div>
          <dl className="cg-summary-counts">
            {Object.entries(today.counts)
              .filter(([name, count]) => name !== 'Skipped' || count)
              .map(([name, count]) => (
                <div key={name}>
                  <dt>
                    <i className={`cg-status-${name.toLowerCase()}`} />
                    {name}
                  </dt>
                  <dd>{count}</dd>
                </div>
              ))}
          </dl>
          <div className="cg-trend-heading">
            <h3>Last 7 days</h3>
            <span>Adherence · %</span>
          </div>
          <div className="cg-trend-bars">
            {days.map((day) => (
              <div
                key={dayKey(day.date)}
                className={dayKey(day.date) === end ? 'is-today' : ''}
                aria-label={`${day.date.toDateString()}: ${day.adherence === null ? 'No doses due' : `${day.adherence}% adherence`}`}
              >
                <strong>{day.adherence === null ? '—' : `${day.adherence}%`}</strong>
                <div className="cg-bar-track">
                  <span style={{ height: `${day.adherence || 0}%` }} />
                </div>
                <span>{day.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <small>{day.date.getDate()}</small>
              </div>
            ))}
          </div>
          <p className="cg-chart-note">
            See how regularly your patient takes their scheduled medicines. A dash (—) means no
            doses were due that day.
          </p>
        </>
      )}
    </section>
  );
}
