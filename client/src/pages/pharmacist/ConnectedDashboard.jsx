import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ClipboardCheck, Clock3, ShieldCheck } from 'lucide-react';
import { api } from '../../api.js';
import { useRealtime } from '../../hooks/useRealtime.js';
import { useAuth } from '../../context/AuthContext.jsx';

function MiniTrend({ variant }) {
  const paths = {
    review: 'M3 36 C15 33, 19 12, 31 17 S45 43, 58 31 S73 20, 85 10',
    inquiry: 'M3 25 C15 29, 23 38, 37 34 S54 15, 66 22 S77 19, 85 8',
    followup: 'M3 31 L24 31 L39 23 L57 23 L70 15 L85 15',
  };
  return <svg aria-hidden="true" className={`ph-dashboard-chart__line is-${variant}`} viewBox="0 0 88 46"><path d={paths[variant]} /><circle cx="85" cy={variant === 'followup' ? 15 : 8} r="3" /></svg>;
}

export default function ConnectedPharmacistDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [summary, setSummary] = useState({});
  const [agenda, setAgenda] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(now);
  const calendarMonth = new Intl.DateTimeFormat('en-PH', { month: 'long' }).format(now);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const calendarDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });
  const selectedDateLabel = new Intl.DateTimeFormat('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(selectedCalendarDate);
  const selectedIsToday = selectedCalendarDate.toDateString() === now.toDateString();
  const selectedAppointments = appointments.filter(
    (appointment) => new Date(appointment.scheduled_start_at).toDateString() === selectedCalendarDate.toDateString()
  );
  const workloadItems = [
    ['Prescription reviews', Number(summary.pending_validations || 0), 'is-blue'],
    ['Patient inquiries', Number(summary.open_inquiries || 0), 'is-coral'],
    ['Adherence follow-ups', Number(summary.followups || 0), 'is-pink'],
  ];
  const totalWorkload = workloadItems.reduce((total, [, count]) => total + count, 0);
  const workloadPeak = Math.max(...workloadItems.map(([, count]) => count), 1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dashboardResult = await api('/api/pharmacist/dashboard');
      setSummary(dashboardResult.data.summary || {});
      setAgenda(dashboardResult.data.agenda || []);
      setAppointments(dashboardResult.data.appointments || []);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Unable to load the pharmacist dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  useRealtime((event) => {
    if (
      [
        'LIVE_DISPENSE_LOG',
        'MEDICATION_CREATED',
        'MEDICATION_UPDATED',
        'MEDICATION_STOPPED',
        'SCHEDULE_CONFIRMED',
        'ORDER_STATUS_CHANGED',
        'INQUIRY_UPDATED',
        'PRESCRIPTION_STATUS_CHANGED',
        'FORMULARY_UPDATED',
        'INVENTORY_UPDATED',
        'COUNSELING_APPOINTMENT_UPDATED',
      ].includes(event)
    ) {
      load();
    }
  });

  return (
    <section className="ph-connected-dashboard">
      {error ? (
        <div className="ph-connected-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="ph-dashboard-intro">
        <div className="ph-dashboard-main">
        <section className="ph-dashboard-welcome">
          <div>
            <span className="ph-dashboard-eyebrow"><ShieldCheck size={15} /> PHARMATE CLINICAL DESK</span>
            <h2>Good day, Pharmacist</h2>
            <p>Review prescriptions, respond to patient questions, and keep today’s medicine care on track.</p>
            <div className="ph-dashboard-welcome__meta"><span><CalendarDays size={15} /> {today}</span><span><Clock3 size={15} /> Live workspace</span></div>
          </div>
          <div className="ph-dashboard-welcome__visual" aria-hidden="true">
            <span><ClipboardCheck size={28} /></span><i /><b />
          </div>
        </section>

        <div className="ph-dashboard-charts" aria-label="Live workload overview">
          <button type="button" onClick={() => navigate('/pharmacist/validation')}>
            <small>VERIFICATION QUEUE</small><span className="ph-dashboard-chart"><MiniTrend variant="review" /></span><div><strong>{loading ? '—' : Number(summary.pending_validations || 0)}</strong><span>prescription reviews</span><em>Live queue</em></div>
          </button>
          <button type="button" onClick={() => navigate('/pharmacist/inquiries')}>
            <small>PATIENT MESSAGING</small><span className="ph-dashboard-chart"><MiniTrend variant="inquiry" /></span><div><strong>{loading ? '—' : Number(summary.open_inquiries || 0)}</strong><span>open inquiries</span><em>Needs response</em></div>
          </button>
          <button type="button" onClick={() => navigate('/pharmacist/alerts')}>
            <small>ADHERENCE CARE</small><span className="ph-dashboard-chart"><MiniTrend variant="followup" /></span><div><strong>{loading ? '—' : Number(summary.followups || 0)}</strong><span>patient follow-ups</span><em>Today's care</em></div>
          </button>
        </div>
        <div className="ph-dashboard-progress">
          <section className="ph-dashboard-workload">
            <header><small>TODAY'S WORKLOAD</small><button type="button" onClick={load}>Refresh</button></header>
            <div className="ph-dashboard-workload__body"><div className="ph-dashboard-donut"><strong>{loading ? '—' : totalWorkload}</strong><span>open tasks</span></div><dl>{workloadItems.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{loading ? '—' : count}</dd></div>)}</dl></div>
          </section>
          <section className="ph-dashboard-plan">
            <header><small>QUEUE BREAKDOWN</small><span>Live</span></header>
            <div className="ph-dashboard-plan__rows">{workloadItems.map(([label, count, tone]) => <div key={label}><p><span>{label}</span><b>{loading ? '—' : count}</b></p><i><em className={tone} style={{ width: `${loading ? 0 : Math.max(8, (count / workloadPeak) * 100)}%` }} /></i></div>)}</div>
          </section>
        </div>
        </div>
        <div className="ph-dashboard-side">
          <section className="ph-dashboard-profile" aria-label="Pharmacist profile">
            <header><span>MY PROFILE</span><button type="button" onClick={() => navigate('/pharmacist/settings')} aria-label="Edit profile">↗</button></header>
            <div className="ph-dashboard-profile__identity"><b>{user?.full_name?.split(' ').map((part) => part[0]).join('').slice(0, 2) || 'PH'}</b><div><strong>{user?.full_name || 'Pharmacist account'}</strong><small>Pharmacist</small><em>PharMate clinical team</em></div></div>
            <footer><div><small>Open reviews</small><strong>{loading ? '—' : Number(summary.pending_validations || 0)}</strong></div><div><small>Inquiries</small><strong>{loading ? '—' : Number(summary.open_inquiries || 0)}</strong></div><div><small>Follow-ups</small><strong>{loading ? '—' : Number(summary.followups || 0)}</strong></div></footer>
          </section>
          <section className="ph-dashboard-agenda" aria-label="Today's clinical priorities">
            <header><span><CalendarDays size={17} /></span><div><small>MY CALENDAR</small><strong>{calendarMonth}</strong></div><button type="button" onClick={() => navigate('/pharmacist/appointments')}>View</button></header>
            <div className="ph-dashboard-calendar" aria-label={`Week of ${today}`}>{calendarDays.map((date) => { const isToday = date.toDateString() === now.toDateString(); const isSelected = date.toDateString() === selectedCalendarDate.toDateString(); const hasAppointment = appointments.some((appointment) => new Date(appointment.scheduled_start_at).toDateString() === date.toDateString()); return <button aria-label={`View schedule for ${new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }).format(date)}`} aria-pressed={isSelected} className={`${isToday ? 'is-today' : ''}${isSelected ? ' is-selected' : ''}${hasAppointment ? ' has-appointment' : ''}`} key={date.toISOString()} onClick={() => setSelectedCalendarDate(new Date(date))} type="button"><small>{new Intl.DateTimeFormat('en-PH', { weekday: 'narrow' }).format(date)}</small><b>{date.getDate()}</b></button>; })}</div>
            <div className="ph-dashboard-agenda__date">{selectedDateLabel}</div>
            {loading ? <p className="ph-dashboard-agenda__loading">Loading clinical priorities…</p> : null}
            {!loading && selectedIsToday && agenda.length === 0 ? <p className="ph-dashboard-agenda__loading">No clinical priorities for this day.</p> : null}
            {!loading && selectedIsToday && agenda.map((item, index) => <button type="button" onClick={() => navigate(item.route)} key={item.id}><time>{index === 0 ? 'Now' : index === 1 ? 'Next' : 'Later'}</time><span><strong>{item.title}</strong><small>{item.patient_code ? `${item.patient_code} · ` : ''}{item.detail}</small></span></button>)}
            {!loading && !selectedIsToday && selectedAppointments.length === 0 ? <p className="ph-dashboard-agenda__loading">No appointments scheduled for this day.</p> : null}
            {!loading && !selectedIsToday && selectedAppointments.map((appointment) => <button type="button" onClick={() => navigate('/pharmacist/appointments')} key={appointment.id}><time>{new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(new Date(appointment.scheduled_start_at))}</time><span><strong>Counseling appointment</strong><small>{appointment.patient_code || 'Open appointment details'}</small></span></button>)}
          </section>
        </div>
      </div>

      {!loading && ['pending_validations', 'open_inquiries', 'open_orders', 'followups'].every((key) => Number(summary[key] || 0) === 0) ? (
        <div className="ph-connected-empty">
          <ClipboardCheck size={34} />
          <strong>No pending clinical work</strong>
          <p>New validations, inquiries, orders, and alerts will appear here automatically.</p>
        </div>
      ) : null}
    </section>
  );
}
