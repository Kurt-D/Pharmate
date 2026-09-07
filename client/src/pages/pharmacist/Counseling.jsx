import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import '../../styles/counseling.css';

function label(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Counseling() {
  const [appointments, setAppointments] = useState([]);
  const [credential, setCredential] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState('ALL');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [reason, setReason] = useState('');
  const [summaryText, setSummaryText] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load(preferredId = null) {
    try {
      const [appointmentResponse, credentialResponse] = await Promise.all([
        api('/api/pharmacist/appointments'),
        api('/api/pharmacist/credential'),
      ]);
      setAppointments(appointmentResponse.data);
      setCredential(credentialResponse.data);
      setSelectedId((current) => preferredId || current || appointmentResponse.data[0]?.id || null);
    } catch (error) {
      setNotice({ kind: 'error', message: error.message });
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(
    () => appointments.filter((appointment) => status === 'ALL' || appointment.status === status),
    [appointments, status]
  );
  const selected = appointments.find((appointment) => appointment.id === selectedId) || null;

  useEffect(() => {
    setMeetingUrl(selected?.meeting_url || '');
    setInstructions(selected?.session_instructions || '');
    setReason(selected?.decision_reason || '');
    setSummaryText(selected?.summary_text || '');
  }, [selected]);

  async function run(action) {
    if (!selected) return;
    setBusy(true);
    setNotice(null);
    try {
      if (action === 'CONFIRM' || action === 'DECLINE') {
        await api(`/api/pharmacist/appointments/${selected.id}/decision`, {
          method: 'POST',
          body: {
            action,
            meeting_url: meetingUrl,
            session_instructions: instructions,
            reason,
          },
        });
      } else if (action === 'COMPLETE') {
        await api(`/api/pharmacist/appointments/${selected.id}/complete`, { method: 'POST' });
      } else if (action === 'SAVE') {
        await api(`/api/pharmacist/counseling-summaries/${selected.summary_id}`, {
          method: 'PUT',
          body: { summary_text: summaryText },
        });
      } else if (action === 'PUBLISH') {
        await api(`/api/pharmacist/counseling-summaries/${selected.summary_id}/publish`, {
          method: 'POST',
        });
      }
      setNotice({ kind: 'success', message: `${label(action)} completed.` });
      await load(selected.id);
    } catch (error) {
      setNotice({ kind: 'error', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="px-counseling">
      {!credential?.credential_valid && (
        <div className="px-counsel-credential">
          Clinical counseling decisions are locked until your pharmacist credential is verified and
          current.
        </div>
      )}
      {notice && <div className={`pm-counsel-notice is-${notice.kind}`}>{notice.message}</div>}
      <div className="px-counsel-toolbar">
        {['ALL', 'REQUESTED', 'CONFIRMED', 'COMPLETED'].map((item) => (
          <button
            key={item}
            className={status === item ? 'active' : ''}
            onClick={() => setStatus(item)}
            type="button"
          >
            {label(item)}
          </button>
        ))}
        <button type="button" onClick={() => load(selectedId)}>
          Refresh
        </button>
      </div>
      <div className="px-counsel-grid">
        <section className="px-counsel-queue">
          <header>
            <h2>Appointment queue</h2>
            <span>{visible.length}</span>
          </header>
          {visible.length === 0 && (
            <p className="pm-counsel-empty">No appointments in this view.</p>
          )}
          {visible.map((appointment) => (
            <button
              className={selectedId === appointment.id ? 'selected' : ''}
              key={appointment.id}
              onClick={() => setSelectedId(appointment.id)}
              type="button"
            >
              <span className={`pm-counsel-status is-${appointment.status.toLowerCase()}`}>
                {label(appointment.status)}
              </span>
              <strong>{appointment.patient_code}</strong>
              <small>{label(appointment.topic)}</small>
              <time>{new Date(appointment.scheduled_start_at).toLocaleString()}</time>
            </button>
          ))}
        </section>
        <section className="px-counsel-detail">
          {!selected ? (
            <p className="pm-counsel-empty">Select an appointment.</p>
          ) : (
            <>
              <header>
                <div>
                  <small>Patient code</small>
                  <h2>{selected.patient_code}</h2>
                </div>
                <span className={`pm-counsel-status is-${selected.status.toLowerCase()}`}>
                  {label(selected.status)}
                </span>
              </header>
              <dl>
                <div>
                  <dt>Topic</dt>
                  <dd>{label(selected.topic)}</dd>
                </div>
                <div>
                  <dt>Session</dt>
                  <dd>
                    {label(selected.modality)} · {selected.duration_minutes} minutes
                  </dd>
                </div>
                <div>
                  <dt>When</dt>
                  <dd>{new Date(selected.scheduled_start_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Branch</dt>
                  <dd>{selected.branch_name}</dd>
                </div>
              </dl>
              {selected.status === 'REQUESTED' && (
                <div className="px-counsel-decision">
                  <label>
                    Secure HTTPS meeting link
                    <input
                      value={meetingUrl}
                      onChange={(event) => setMeetingUrl(event.target.value)}
                      placeholder="https://…"
                    />
                  </label>
                  <label>
                    Session instructions
                    <textarea
                      value={instructions}
                      onChange={(event) => setInstructions(event.target.value)}
                      rows={2}
                      placeholder="How the patient should join"
                    />
                  </label>
                  <label>
                    Reason when declining
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={2}
                    />
                  </label>
                  <div>
                    <button
                      disabled={busy || !credential?.credential_valid}
                      onClick={() => run('CONFIRM')}
                      type="button"
                    >
                      Confirm
                    </button>
                    <button
                      className="danger"
                      disabled={busy || !credential?.credential_valid || !reason.trim()}
                      onClick={() => run('DECLINE')}
                      type="button"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}
              {selected.status === 'CONFIRMED' && (
                <div className="px-counsel-session">
                  {selected.meeting_url && (
                    <a href={selected.meeting_url} target="_blank" rel="noreferrer">
                      Open secure session
                    </a>
                  )}
                  <p>{selected.session_instructions}</p>
                  <button
                    disabled={busy || !credential?.credential_valid}
                    onClick={() => run('COMPLETE')}
                    type="button"
                  >
                    Complete visit & generate draft
                  </button>
                </div>
              )}
              {selected.summary_id && (
                <div className="px-counsel-summary">
                  <div>
                    <h3>Post-dispensing summary</h3>
                    <span
                      className={`pm-counsel-status is-${selected.summary_status.toLowerCase()}`}
                    >
                      {label(selected.summary_status)}
                    </span>
                  </div>
                  <p>
                    The draft is generated only from stored medication directions. Review every line
                    before publishing.
                  </p>
                  <textarea
                    value={summaryText}
                    onChange={(event) => setSummaryText(event.target.value)}
                    rows={14}
                    readOnly={selected.summary_status !== 'DRAFT'}
                  />
                  {selected.summary_status === 'DRAFT' && (
                    <div>
                      <button
                        disabled={busy || !credential?.credential_valid}
                        onClick={() => run('SAVE')}
                        type="button"
                      >
                        Save draft
                      </button>
                      <button
                        disabled={
                          busy || !credential?.credential_valid || summaryText.trim().length < 40
                        }
                        onClick={() => run('PUBLISH')}
                        type="button"
                      >
                        Publish to patient
                      </button>
                    </div>
                  )}
                  {selected.summary_status === 'PUBLISHED' && (
                    <small>Published {new Date(selected.published_at).toLocaleString()}</small>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
