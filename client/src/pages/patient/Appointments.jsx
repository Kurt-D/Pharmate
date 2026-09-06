import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import '../../styles/counseling.css';

function localInputValue(date = new Date(Date.now() + 86400000)) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

function appointmentLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Appointments() {
  const { language } = useLanguage();
  const tr = (english, filipino) => (language === 'fil' ? filipino : english);
  const [branches, setBranches] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState({
    branch_id: '',
    topic: 'POST_DISPENSING',
    modality: 'VIDEO',
    duration_minutes: 30,
    scheduled_start_at: localInputValue(),
  });

  async function load() {
    try {
      const [branchResponse, appointmentResponse, summaryResponse] = await Promise.all([
        api('/api/directory/branches'),
        api('/api/patient/appointments'),
        api('/api/patient/counseling-summaries'),
      ]);
      setBranches(branchResponse.data);
      setAppointments(appointmentResponse.data);
      setSummaries(summaryResponse.data);
      setForm((current) => ({
        ...current,
        branch_id: current.branch_id || branchResponse.data[0]?.id || '',
      }));
    } catch (error) {
      setNotice({ kind: 'error', message: error.message });
    }
  }

  useEffect(() => {
    load();
  }, []);

  const upcoming = useMemo(
    () =>
      appointments.filter(
        (appointment) =>
          ['REQUESTED', 'CONFIRMED'].includes(appointment.status) &&
          new Date(appointment.scheduled_start_at) >= new Date()
      ),
    [appointments]
  );

  async function requestAppointment(event) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await api('/api/patient/appointments', {
        method: 'POST',
        body: {
          ...form,
          duration_minutes: Number(form.duration_minutes),
          scheduled_start_at: new Date(form.scheduled_start_at).toISOString(),
        },
      });
      setNotice({
        kind: 'success',
        message: tr(
          'Appointment requested. A pharmacist will confirm the session details.',
          'Naipadala ang request. Kukumpirmahin ng parmasyutiko ang detalye ng session.'
        ),
      });
      setForm((current) => ({ ...current, scheduled_start_at: localInputValue() }));
      await load();
    } catch (error) {
      setNotice({ kind: 'error', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppointment(id) {
    setBusy(true);
    try {
      await api(`/api/patient/appointments/${id}/cancel`, { method: 'POST' });
      setNotice({
        kind: 'success',
        message: tr('Appointment cancelled.', 'Kinansela ang appointment.'),
      });
      await load();
    } catch (error) {
      setNotice({ kind: 'error', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pm-appointments">
      <header className="pm-appointments__header">
        <div>
          <span>{tr('Pharmacist follow-up', 'Follow-up sa parmasyutiko')}</span>
          <h1>{tr('Appointments', 'Mga Appointment')}</h1>
          <p>
            {tr(
              'Request a virtual medicine follow-up and read your reviewed counseling summaries.',
              'Humiling ng virtual na follow-up at basahin ang counseling summary na nirepaso.'
            )}
          </p>
        </div>
        <strong>
          {upcoming.length} {tr('upcoming', 'paparating')}
        </strong>
      </header>

      {notice && <div className={`pm-counsel-notice is-${notice.kind}`}>{notice.message}</div>}

      <section className="pm-counsel-card">
        <h2>{tr('Request a session', 'Humiling ng session')}</h2>
        <form className="pm-appointment-form" onSubmit={requestAppointment}>
          <label>
            {tr('Pharmacy branch', 'Sangay ng botika')}
            <select
              required
              value={form.branch_id}
              onChange={(event) => setForm({ ...form, branch_id: event.target.value })}
            >
              <option value="">{tr('Select a branch', 'Pumili ng sangay')}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr('Follow-up topic', 'Paksa ng follow-up')}
            <select
              value={form.topic}
              onChange={(event) => setForm({ ...form, topic: event.target.value })}
            >
              <option value="POST_DISPENSING">Post-dispensing counseling</option>
              <option value="MEDICATION_REVIEW">Medication review</option>
              <option value="MISSED_DOSE">Missed-dose support</option>
              <option value="SIDE_EFFECT_CONCERN">Side-effect concern</option>
              <option value="OTHER">Other medicine question</option>
            </select>
          </label>
          <label>
            {tr('Date and time', 'Petsa at oras')}
            <input
              required
              type="datetime-local"
              min={localInputValue(new Date(Date.now() + 30 * 60000))}
              value={form.scheduled_start_at}
              onChange={(event) => setForm({ ...form, scheduled_start_at: event.target.value })}
            />
          </label>
          <label>
            {tr('Session type', 'Uri ng session')}
            <select
              value={form.modality}
              onChange={(event) => setForm({ ...form, modality: event.target.value })}
            >
              <option value="VIDEO">Video</option>
              <option value="AUDIO">Audio</option>
              <option value="PHONE">Phone</option>
            </select>
          </label>
          <label>
            {tr('Duration', 'Tagal')}
            <select
              value={form.duration_minutes}
              onChange={(event) => setForm({ ...form, duration_minutes: event.target.value })}
            >
              {[15, 30, 45, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy || !form.branch_id}>
            {busy
              ? tr('Sending…', 'Ipinapadala…')
              : tr('Request Appointment', 'Humiling ng Appointment')}
          </button>
        </form>
      </section>

      <section className="pm-counsel-card">
        <h2>{tr('Your appointments', 'Iyong mga appointment')}</h2>
        <div className="pm-appointment-list">
          {appointments.length === 0 && (
            <p className="pm-counsel-empty">
              {tr('No appointments yet.', 'Wala pang appointment.')}
            </p>
          )}
          {appointments.map((appointment) => (
            <article key={appointment.id}>
              <div>
                <span className={`pm-counsel-status is-${appointment.status.toLowerCase()}`}>
                  {appointmentLabel(appointment.status)}
                </span>
                <h3>{appointmentLabel(appointment.topic)}</h3>
                <p>
                  {appointment.branch_name} · {appointmentLabel(appointment.modality)} ·{' '}
                  {appointment.duration_minutes} minutes
                </p>
                <time>{new Date(appointment.scheduled_start_at).toLocaleString()}</time>
                {appointment.decision_reason && <small>{appointment.decision_reason}</small>}
                {appointment.session_instructions && (
                  <small>{appointment.session_instructions}</small>
                )}
              </div>
              <div className="pm-appointment-actions">
                {appointment.status === 'CONFIRMED' && appointment.meeting_url && (
                  <a href={appointment.meeting_url} target="_blank" rel="noreferrer">
                    Join secure session
                  </a>
                )}
                {['REQUESTED', 'CONFIRMED'].includes(appointment.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => cancelAppointment(appointment.id)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="pm-counsel-card">
        <h2>{tr('Counseling summaries', 'Mga counseling summary')}</h2>
        <p className="pm-counsel-help">
          {tr(
            'Only summaries reviewed and published by a verified pharmacist appear here.',
            'Mga summary lamang na nirepaso at inilathala ng beripikadong parmasyutiko ang makikita rito.'
          )}
        </p>
        <div className="pm-summary-list">
          {summaries.length === 0 && (
            <p className="pm-counsel-empty">
              {tr('No published summaries yet.', 'Wala pang published summary.')}
            </p>
          )}
          {summaries.map((summary) => (
            <article key={summary.id}>
              <header>
                <strong>{appointmentLabel(summary.topic)}</strong>
                <time>{new Date(summary.published_at).toLocaleString()}</time>
              </header>
              <pre>{summary.summary_text}</pre>
              <footer>
                {summary.pharmacist_name} · {summary.branch_name} · {summary.template_version}
              </footer>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
