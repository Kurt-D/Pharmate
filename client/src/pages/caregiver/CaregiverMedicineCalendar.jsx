import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../api.js';
import '../../styles/caregiver-calendar.css';

const keyFor = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const statusGroup = (dose) => {
  const status = String(dose.status || '').toUpperCase();
  if (['TAKEN', 'TAKEN_LATE'].includes(status)) return 'Taken';
  if (status === 'MISSED') return 'Missed';
  if (['SKIPPED', 'CANCELLED'].includes(status)) return null;
  return 'Upcoming';
};

export default function CaregiverMedicineCalendar({ patientCode, refreshKey }) {
  const [selected, setSelected] = useState(() => new Date());
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('Upcoming');
  const [result, setResult] = useState({ key: '', doses: [] });
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 41);
  const startKey = keyFor(start);
  const endKey = keyFor(end);
  const requestKey = `${patientCode}:${startKey}:${endKey}`;
  useEffect(() => {
    let active = true;
    setError('');
    setResult({ key: '', doses: [] });
    api(
      `/api/caregiver/patients/${encodeURIComponent(patientCode)}/doses/history?startDate=${startKey}&endDate=${endKey}`
    )
      .then(({ data }) => {
        if (active) setResult({ key: requestKey, doses: Array.isArray(data) ? data : [] });
      })
      .catch((failure) => {
        if (active) setError(failure.message || 'Unable to load medicine calendar.');
      });
    return () => {
      active = false;
    };
  }, [patientCode, startKey, endKey, requestKey, refreshKey, retry]);
  const weekStart = new Date(selected);
  weekStart.setDate(selected.getDate() - selected.getDay());
  const days = Array.from({ length: expanded ? 42 : 7 }, (_, index) => {
    const date = new Date(expanded ? start : weekStart);
    date.setDate(date.getDate() + index);
    return date;
  });
  const doses =
    result.key === requestKey
      ? result.doses
          .filter((dose) => {
            const date = new Date(dose.scheduled_at || dose.scheduled_time);
            return (
              !dose.is_prn &&
              String(dose.schedule_type).toUpperCase() !== 'PRN' &&
              keyFor(date) === keyFor(selected) &&
              statusGroup(dose) === filter
            );
          })
          .sort(
            (a, b) =>
              new Date(a.scheduled_at || a.scheduled_time) -
              new Date(b.scheduled_at || b.scheduled_time)
          )
      : [];
  const moveMonth = (amount) =>
    setSelected(new Date(selected.getFullYear(), selected.getMonth() + amount, 1));
  return (
    <section className="cg-medicine-calendar" aria-label="Patient medicine calendar">
      <header className="cg-calendar-header">
        <div>
          <p className="m-0 text-xs uppercase text-blue-600">Medicine calendar</p>
          <h3 className="m-0 text-base font-bold">
            {selected.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
        </div>
        <button
          type="button"
          className="cg-calendar-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <CalendarDays size={16} />
          {expanded ? 'Week view' : 'View Calendar'}
        </button>
      </header>
      <div className="cg-calendar-body">
        {
          <div className="cg-calendar-navigation">
            <button
              type="button"
              aria-label={expanded ? 'Previous month' : 'Previous week'}
              className="min-h-[44px] min-w-[44px]"
              onClick={() =>
                expanded
                  ? moveMonth(-1)
                  : setSelected(
                      new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() - 7)
                    )
              }
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              className="min-h-[44px] text-sm text-blue-700"
              onClick={() => setSelected(new Date())}
            >
              Today
            </button>
            <button
              type="button"
              aria-label={expanded ? 'Next month' : 'Next week'}
              className="min-h-[44px] min-w-[44px]"
              onClick={() =>
                expanded
                  ? moveMonth(1)
                  : setSelected(
                      new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + 7)
                    )
              }
            >
              <ChevronRight />
            </button>
          </div>
        }
        <div className="cg-calendar-grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
            <span key={i} className="text-xs text-slate-500" aria-hidden="true">
              {day}
            </span>
          ))}
          {days.map((date) => (
            <button
              type="button"
              key={keyFor(date)}
              aria-label={date.toLocaleDateString('en-US', { dateStyle: 'full' })}
              aria-pressed={keyFor(date) === keyFor(selected)}
              aria-current={keyFor(date) === keyFor(new Date()) ? 'date' : undefined}
              onClick={() => setSelected(date)}
              className={`cg-calendar-day ${date.getMonth() !== selected.getMonth() ? 'is-outside' : ''}`}
            >
              {date.getDate()}
            </button>
          ))}
        </div>
        <div className="cg-calendar-filters" aria-label="Filter doses">
          {['Upcoming', 'Taken', 'Missed'].map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className="cg-calendar-filter"
            >
              {value}
            </button>
          ))}
        </div>
        <h4 className="cg-calendar-date-heading">
          {keyFor(selected) === keyFor(new Date()) ? 'Today, ' : ''}
          {selected.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </h4>
        <div className="cg-calendar-results" aria-live="polite">
          {error ? (
            <div role="alert" className="text-sm text-red-700">
              {error}
              <button
                type="button"
                className="ml-2 min-h-[44px] underline"
                onClick={() => setRetry(retry + 1)}
              >
                Retry
              </button>
            </div>
          ) : result.key !== requestKey ? (
            <p className="text-sm text-slate-500">Loading medicine schedule…</p>
          ) : doses.length ? (
            doses.map((dose) => (
              <article key={dose.schedule_id || dose.id} className="cg-calendar-dose">
                <strong className="block text-sm">
                  {dose.drug_name || dose.drug_name_raw || 'Medicine'}
                </strong>
                <span className="text-xs text-slate-600">
                  {new Date(dose.scheduled_at || dose.scheduled_time).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}{' '}
                  · {String(dose.status || 'Upcoming').replaceAll('_', ' ')}
                </span>
                <p className="mb-0 mt-1 text-sm text-slate-600">
                  {dose.dosage_instruction ||
                    dose.dose ||
                    dose.instructions ||
                    dose.frequency ||
                    'Follow the saved prescription directions.'}
                </p>
              </article>
            ))
          ) : (
            <p className="cg-calendar-empty">No {filter.toLowerCase()} doses for this date.</p>
          )}
        </div>
      </div>
    </section>
  );
}
