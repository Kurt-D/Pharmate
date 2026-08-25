import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { apiUrl } from '../config.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import '../styles/caregiver.css';
import '../styles/caregiver-profile.css';
import '../styles/caregiver-mobile.css';

const NAV = [
  ['home', 'home', 'Home'],
  ['medications', 'medicine', 'Medications'],
  ['patient', 'patients', 'Patient'],
  ['orders', 'delivery', 'Orders'],
  ['profile', 'profile', 'Profile'],
];

function CaregiverIcon({ name, size = 22 }) {
  const paths = {
    home: (
      <>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5.5 10v10h13V10M9.5 20v-6h5v6" />
      </>
    ),
    medicine: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 3v4h6V3M8 12h8M12 8v8M8 16h8" />
      </>
    ),
    patients: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20a6 6 0 0 1 12 0M17 11v6M14 14h6" />
      </>
    ),
    delivery: (
      <>
        <path d="M3 6h11v11H3zM14 10h4l3 4v3h-7z" />
        <circle cx="7" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 4.8 2.9 8.1 7 10 4.1-1.9 7-5.2 7-10V6z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    code: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m9 10-2 2 2 2M15 10l2 2-2 2M12.5 9l-1 6" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 2.8 19h18.4z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </>
    ),
    activity: (
      <>
        <path d="M3 12h4l2-6 4 12 2-6h6" />
      </>
    ),
    pill: (
      <>
        <path d="M8.5 4.5a5 5 0 0 1 7 0l4 4a5 5 0 0 1-7 7l-4-4a5 5 0 0 1 0-7z" />
        <path d="m9 12 6-6" />
      </>
    ),
    message: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.profile}
    </svg>
  );
}
export default function CaregiverDashboardRedesign() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const [view, setView] = useState('home');
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [meds, setMeds] = useState([]);
  const [orders, setOrders] = useState({ refills: [], deliveries: [] });
  const [branches, setBranches] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const loadPatient = useCallback(async (code) => {
    if (!code) {
      setMeds([]);
      setOrders({ refills: [], deliveries: [] });
      return;
    }
    try {
      const [m, o] = await Promise.all([
        api(`/api/caregiver/patients/${code}/medications`),
        api(`/api/caregiver/patients/${code}/orders`),
      ]);
      setMeds(m.data);
      setOrders(o.data);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  const load = useCallback(async () => {
    try {
      const [p, a, b] = await Promise.all([
        api('/api/caregiver/patients'),
        api('/api/caregiver/alerts'),
        api('/api/directory/branches'),
      ]);
      setPatients(p.data);
      setAlerts(a.data);
      setBranches(b.data);
      setSelected((current) => current || p.data[0]?.patient_code || '');
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadPatient(selected);
  }, [selected, loadPatient]);
  useEffect(() => {
    const token = sessionStorage.getItem('pm_token');
    if (!token) return undefined;
    const controller = new AbortController();

    async function listen() {
      const response = await fetch(apiUrl('/api/caregiver/events'), {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';
        for (const block of blocks) {
          const event = block.match(/^event:\s*(.+)$/m)?.[1];
          if (event === 'patient-linked') await load();
          if (event === 'adherence-updated') {
            await Promise.all([load(), loadPatient(selected)]);
          }
        }
      }
    }
    listen().catch((eventError) => {
      if (eventError.name !== 'AbortError') console.warn('Caregiver live updates paused');
    });
    return () => controller.abort();
  }, [load, loadPatient, selected]);
  const patientAlerts = alerts.filter((item) => !selected || item.patient_code === selected);
  const history = useMemo(
    () =>
      [
        ...orders.refills.map((item) => ({ ...item, kind: 'Pickup' })),
        ...orders.deliveries.map((item) => ({ ...item, kind: 'Delivery' })),
      ].sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at)),
    [orders]
  );
  async function notify(drug) {
    try {
      setError('');
      const response = await api(`/api/caregiver/patients/${selected}/notify`, {
        method: 'POST',
        body: { drug_name: drug },
      });
      if (!response.data.notified) {
        setMessage('The patient has medication reminders turned off in their settings.');
        return false;
      }
      setMessage(`Reminder for ${drug || 'the scheduled medicine'} sent to the patient.`);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }
  async function contactPharmacist(drug) {
    try {
      await api(`/api/caregiver/patients/${selected}/inquiries`, {
        method: 'POST',
        body: {
          subject: `Caregiver follow-up about ${drug || 'a missed dose'}`,
          drug_name: drug || null,
        },
      });
      setMessage('A follow-up was sent to the pharmacy.');
    } catch (e) {
      setError(e.message);
    }
  }
  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
  }
  return (
    <div className="cg-phone">
      <div className="cg-scroll">
        {error && <div className="pm-banner pm-banner--warn">{error}</div>}
        {message && <div className="pm-banner pm-banner--success">{message}</div>}
        {patients.length > 1 && (
          <select
            className="cg-patient-picker"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {patients.map((p) => (
              <option key={p.patient_code}>{p.patient_code}</option>
            ))}
          </select>
        )}
        {patients.length === 0 && view !== 'profile' ? (
          <EmptyLinked onProfile={() => setView('profile')} />
        ) : (
          <>
            {view === 'home' && (
              <Home
                code={selected}
                alerts={patientAlerts}
                meds={meds}
                onNotify={notify}
                onContact={contactPharmacist}
                onView={setView}
              />
            )}
            {view === 'medications' && (
              <Medications
                alerts={patientAlerts}
                meds={meds}
                onNotify={notify}
                onContact={contactPharmacist}
              />
            )}
            {view === 'patient' && (
              <PatientInfo
                code={selected}
                linkedAt={patients.find((p) => p.patient_code === selected)?.linked_at}
                meds={meds}
                alerts={patientAlerts}
              />
            )}
            {view === 'orders' && (
              <Orders
                code={selected}
                meds={meds}
                branches={branches}
                history={history}
                reload={() => loadPatient(selected)}
              />
            )}
          </>
        )}
        {view === 'profile' && (
          <Profile
            user={user}
            patients={patients}
            onLinked={load}
            onSelect={(code) => {
              setSelected(code);
              setView('home');
            }}
            onLogout={signOut}
            language={language}
            setLanguage={setLanguage}
          />
        )}
      </div>
      <nav className="cg-nav">
        {NAV.map(([id, icon, label]) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
            <i>
              <CaregiverIcon name={icon} />
            </i>
            <span>
              {language === 'fil'
                ? {
                    Home: 'Home',
                    Medications: 'Gamot',
                    Patient: 'Pasyente',
                    Orders: 'Mga Order',
                    Profile: 'Profile',
                  }[label] || label
                : label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Header({ title, subtitle }) {
  return (
    <header className="cg-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}
function AlertCard({ alert, onNotify, onContact }) {
  const drug = alert?.drug_name || 'a scheduled medicine';
  return (
    <section className="cg-alert cg-monitor-alert" role="alert">
      <div className="cg-monitor-alert-copy">
        <i>
          <CaregiverIcon name="alert" />
        </i>
        <span>
          <strong>Missed dose needs attention</strong>
          <small>
            {drug} was scheduled for{' '}
            {alert?.scheduled_time
              ? new Date(alert.scheduled_time).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : 'an earlier time'}
            .
          </small>
        </span>
      </div>
      <div className="cg-monitor-alert-actions">
        <button onClick={() => onNotify(drug)}>
          <CaregiverIcon name="bell" size={18} /> Send Reminder
        </button>
        <button onClick={() => onContact(drug)}>
          <CaregiverIcon name="message" size={18} /> Ask Pharmacist
        </button>
      </div>
    </section>
  );
}
function Home({ code, alerts, meds, onNotify, onContact, onView }) {
  const alert = alerts[0];
  const [reminderMedicine, setReminderMedicine] = useState('');
  const [sending, setSending] = useState(false);
  const missedMedicines = useMemo(() => new Set(alerts.map((item) => item.drug_name)), [alerts]);

  useEffect(() => {
    if (!reminderMedicine && meds[0]?.drug_name_raw) setReminderMedicine(meds[0].drug_name_raw);
  }, [meds, reminderMedicine]);

  async function sendSelectedReminder() {
    if (!reminderMedicine || sending) return;
    setSending(true);
    await onNotify(reminderMedicine);
    setSending(false);
  }

  return (
    <>
      <Header
        title="Patient Monitoring"
        subtitle="Medicine activity and alerts from your linked patient."
      />
      <section className="cg-monitor-patient">
        <div className="cg-monitor-avatar">
          <CaregiverIcon name="patients" size={27} />
        </div>
        <div>
          <small>Linked patient</small>
          <strong>{code}</strong>
          <span>
            <i /> Live monitoring active
          </span>
        </div>
        <button
          type="button"
          onClick={() => onView('patient')}
          aria-label="View linked patient details"
        >
          <CaregiverIcon name="arrow" />
        </button>
      </section>
      <section className="cg-monitor-summary" aria-label="Monitoring summary">
        <div>
          <i className="medicine">
            <CaregiverIcon name="pill" />
          </i>
          <strong>{meds.length}</strong>
          <span>Active medicines</span>
        </div>
        <div>
          <i className={alerts.length ? 'attention' : 'clear'}>
            <CaregiverIcon name={alerts.length ? 'alert' : 'check'} />
          </i>
          <strong>{alerts.length}</strong>
          <span>Missed alerts</span>
        </div>
        <div>
          <i className="activity">
            <CaregiverIcon name="activity" />
          </i>
          <strong>Live</strong>
          <span>Sync status</span>
        </div>
      </section>
      {alert && <AlertCard alert={alert} onNotify={onNotify} onContact={onContact} />}
      {!alert && (
        <section className="cg-monitor-clear">
          <CaregiverIcon name="check" />
          <span>
            <strong>No missed-dose alerts</strong>
            <small>There are no active alerts requiring your attention.</small>
          </span>
        </section>
      )}
      <section className="cg-card cg-monitor-medicines">
        <div className="cg-section-title">
          <div>
            <h2>Medicine monitoring</h2>
            <small>Current linked medicines</small>
          </div>
          <button onClick={() => onView('medications')}>See all</button>
        </div>
        {meds.slice(0, 3).map((m) => (
          <div className="cg-med-row" key={m.id}>
            <i className={m.source === 'OTC_SELF' ? 'otc' : 'rx'}>
              <CaregiverIcon name="pill" size={19} />
            </i>
            <span>
              <strong>{m.drug_name_raw}</strong>
              <small>{m.frequency || m.dosage_instruction || 'Active medicine'}</small>
            </span>
            <em className={missedMedicines.has(m.drug_name_raw) ? 'missed' : 'monitoring'}>
              {missedMedicines.has(m.drug_name_raw) ? 'Missed' : 'Monitoring'}
            </em>
          </div>
        ))}
        {!meds.length && (
          <p className="cg-monitor-empty-list">No active medicine is available to monitor.</p>
        )}
      </section>
      <section className="cg-reminder-card">
        <header>
          <i>
            <CaregiverIcon name="bell" />
          </i>
          <div>
            <h2>Notify your patient</h2>
            <p>Send a medicine reminder to the patient’s notification inbox.</p>
          </div>
        </header>
        <label>
          <span>Choose medicine</span>
          <select
            value={reminderMedicine}
            onChange={(event) => setReminderMedicine(event.target.value)}
            disabled={!meds.length}
          >
            {!meds.length && <option value="">No active medicines</option>}
            {meds.map((medicine) => (
              <option key={medicine.id} value={medicine.drug_name_raw}>
                {medicine.drug_name_raw}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={sendSelectedReminder}
          disabled={!reminderMedicine || sending}
        >
          <CaregiverIcon name="bell" size={20} />
          {sending ? 'Sending Reminder…' : 'Send Medicine Reminder'}
        </button>
        <small>The patient will receive a notification if reminders are enabled.</small>
      </section>
      <div className="cg-monitor-links">
        <button onClick={() => onView('patient')}>
          <i>
            <CaregiverIcon name="patients" />
          </i>
          <span>
            <strong>Patient details</strong>
            <small>Review linked information</small>
          </span>
          <CaregiverIcon name="arrow" size={19} />
        </button>
        <button onClick={() => onContact('')}>
          <i>
            <CaregiverIcon name="message" />
          </i>
          <span>
            <strong>Ask a pharmacist</strong>
            <small>Get help with a medicine concern</small>
          </span>
          <CaregiverIcon name="arrow" size={19} />
        </button>
      </div>
    </>
  );
}
function Medications({ alerts, meds, onNotify, onContact }) {
  const missed = new Set(alerts.map((a) => a.drug_name));
  return (
    <>
      <Header title="Medications" subtitle="Track your patient’s medicines." />
      {alerts[0] && <AlertCard alert={alerts[0]} onNotify={onNotify} onContact={onContact} />}
      <section className="cg-card">
        <div className="cg-section-title">
          <h2>All Medicines</h2>
          <span>{meds.length}</span>
        </div>
        {meds.map((m, i) => (
          <div className="cg-med-card" key={m.id}>
            <i className={`c${i % 3}`}>◆</i>
            <span>
              <strong>{m.drug_name_raw}</strong>
              <small>{m.dosage_instruction || 'Dosage on patient record'}</small>
              <small>{m.frequency || 'Active schedule'}</small>
            </span>
            <em className={missed.has(m.drug_name_raw) ? 'missed' : 'pending'}>
              {missed.has(m.drug_name_raw) ? 'Missed' : 'Active'}
            </em>
            <button onClick={() => onNotify(m.drug_name_raw)}>Remind</button>
          </div>
        ))}
      </section>
    </>
  );
}
function PatientInfo({ code, linkedAt, meds, alerts }) {
  return (
    <>
      <Header title={`Patient Info: ${code}`} subtitle="Authorized linked-patient information" />
      <section className="cg-identity">
        <i>○</i>
        <span>
          <strong>Patient {code}</strong>
          <small>Linked {linkedAt ? new Date(linkedAt).toLocaleDateString() : '—'}</small>
          <b>Patient ID: {code}</b>
        </span>
      </section>
      <section className="cg-card">
        <div className="cg-section-title">
          <h2>Medication List</h2>
          <span>{meds.length}</span>
        </div>
        {meds.map((m) => (
          <div className="cg-simple-row" key={m.id}>
            ◆{' '}
            <span>
              {m.drug_name_raw}
              <small>{m.frequency || m.dosage_instruction}</small>
            </span>
          </div>
        ))}
      </section>
      <section className="cg-card">
        <div className="cg-section-title">
          <h2>Missed Dose History</h2>
          <span>{alerts.length}</span>
        </div>
        {alerts.map((a) => (
          <div className="cg-missed-row" key={a.id}>
            ◆{' '}
            <span>
              <strong>{a.drug_name}</strong>
              <small>{new Date(a.created_at).toLocaleString()}</small>
            </span>
            <em>Missed</em>
          </div>
        ))}
      </section>
    </>
  );
}
function Orders({ code, meds, branches, history, reload }) {
  const [form, setForm] = useState({
    medication_id: '',
    branch_id: '',
    kind: 'refill',
    address: '',
  });
  const [error, setError] = useState('');
  async function submit() {
    if (!form.medication_id || !form.branch_id) return setError('Choose a medicine and branch.');
    try {
      await api(
        `/api/caregiver/patients/${code}/${form.kind === 'delivery' ? 'deliveries' : 'refills'}`,
        {
          method: 'POST',
          body: {
            medication_id: form.medication_id,
            branch_id: form.branch_id,
            address: form.address,
          },
        }
      );
      setForm((f) => ({ ...f, medication_id: '' }));
      setError('');
      reload();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <Header title="Orders" subtitle="Track your patient’s orders." />
      <section className="cg-order-form">
        <div>
          <button
            className={form.kind === 'refill' ? 'active' : ''}
            onClick={() => setForm({ ...form, kind: 'refill' })}
          >
            Current Orders
          </button>
          <button
            className={form.kind === 'delivery' ? 'active' : ''}
            onClick={() => setForm({ ...form, kind: 'delivery' })}
          >
            Delivery
          </button>
        </div>
        {error && <small>{error}</small>}
        <select
          value={form.medication_id}
          onChange={(e) => setForm({ ...form, medication_id: e.target.value })}
        >
          <option value="">Select medicine</option>
          {meds.map((m) => (
            <option key={m.id} value={m.id}>
              {m.drug_name_raw}
            </option>
          ))}
        </select>
        <select
          value={form.branch_id}
          onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
        >
          <option value="">Select branch</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {form.kind === 'delivery' && (
          <input
            placeholder="Delivery address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        )}
        <button className="cg-primary" onClick={submit}>
          Request Order
        </button>
      </section>
      {history.map((o) => (
        <section className="cg-track" key={`${o.kind}-${o.id}`}>
          <div>
            <strong>Track Order</strong>
            <small>Expected delivery</small>
          </div>
          <h2>▣ Order #{o.id.slice(0, 6).toUpperCase()}</h2>
          <p>
            {o.drug} · {o.kind}
          </p>
          <div className="cg-progress">
            <i />
            <i />
            <i />
            <i />
          </div>
          <span>{o.status.replaceAll('_', ' ')}</span>
        </section>
      ))}
    </>
  );
}
function Profile({ user, patients, onLinked, onSelect, onLogout, language, setLanguage }) {
  const fil = language === 'fil';
  const [code, setCode] = useState('');
  const [relationship, setRelationship] = useState('');
  const [error, setError] = useState('');
  const [panel, setPanel] = useState('');
  const [profile, setProfile] = useState({ display_name: '', email: user?.email || '' });
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    api('/api/caregiver/profile')
      .then((r) => {
        setProfile(r.data);
        setName(r.data.display_name || '');
      })
      .catch((e) => setError(e.message));
  }, []);
  async function link() {
    try {
      await api('/api/caregiver/link', {
        method: 'POST',
        body: { code: code.trim(), relationship },
      });
      setCode('');
      setRelationship('');
      setError('');
      setMessage(fil ? 'Nakonekta na ang pasyente.' : 'Patient linked successfully.');
      await onLinked();
    } catch (e) {
      setError(e.message);
    }
  }
  async function save() {
    try {
      const response = await api('/api/caregiver/profile', {
        method: 'PUT',
        body: { display_name: name },
      });
      setProfile((p) => ({ ...p, display_name: response.data.display_name }));
      setPanel('');
      setMessage(fil ? 'Nai-save na ang profile.' : 'Profile saved.');
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <Header
        title={fil ? 'PROFILE' : 'PROFILE'}
        subtitle={fil ? 'Pamahalaan ang caregiver account.' : 'Manage your caregiver account.'}
      />
      {message && <div className="pm-banner pm-banner--success">{message}</div>}
      <section className="cg-profile-card">
        <i>○</i>
        <span>
          <strong>{profile.display_name || profile.email || 'Caregiver'}</strong>
          <small>{fil ? 'Caregiver Account' : 'Caregiver Account'}</small>
        </span>
      </section>
      <h2 className="cg-label">{fil ? 'Mga Nakonektang Pasyente' : 'Linked Patients'}</h2>
      {patients.map((p) => (
        <section className="cg-linked" key={p.patient_code}>
          <i>○</i>
          <span>
            <strong>
              {fil ? 'Pasyente' : 'Patient'} {p.patient_code}
            </strong>
            <small>{fil ? 'Awtorisadong access' : 'Authorized access'}</small>
            <small>{p.relationship || (fil ? 'Caregiver' : 'Caregiver')}</small>
          </span>
          <button onClick={() => onSelect(p.patient_code)}>
            {fil ? 'Tingnan' : 'Check Patient'}
          </button>
        </section>
      ))}
      <section className="cg-link-form">
        <h2>{fil ? 'Mag-link ng isa pang pasyente' : 'Link another patient'}</h2>
        <input
          value={code}
          maxLength={7}
          inputMode="text"
          autoComplete="one-time-code"
          aria-label={fil ? 'Anim na character na link code' : 'Six-character link code'}
          onChange={(e) => {
            const raw = e.target.value
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '')
              .slice(0, 6);
            setCode(raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw);
          }}
          placeholder="ABC-123"
        />
        <label className="cg-link-relationship">
          <span>{fil ? 'Relasyon sa pasyente' : 'Relationship to patient'}</span>
          <select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
            <option value="">{fil ? 'Pumili ng relasyon' : 'Choose relationship'}</option>
            <option value="Mother">Mother</option>
            <option value="Father">Father</option>
            <option value="Daughter">Daughter</option>
            <option value="Son">Son</option>
            <option value="Spouse">Spouse</option>
            <option value="Sibling">Sibling</option>
            <option value="Other caregiver">Other caregiver</option>
          </select>
        </label>
        {error && <small>{error}</small>}
        <button
          disabled={code.replace(/[^A-Z0-9]/g, '').length !== 6 || !relationship}
          onClick={link}
        >
          {fil ? 'I-link ang Pasyente' : 'Link Patient'}
        </button>
      </section>
      <div className="cg-profile-menu">
        <button onClick={() => setPanel(panel === 'edit' ? '' : 'edit')}>
          ▣ {fil ? 'I-edit ang profile' : 'Edit profile'} ›
        </button>
        {panel === 'edit' && (
          <div className="cg-profile-panel">
            <label>
              {fil ? 'Pangalan na ipapakita' : 'Display name'}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={fil ? 'Iyong pangalan' : 'Your name'}
              />
            </label>
            <button onClick={save}>{fil ? 'I-save' : 'Save profile'}</button>
          </div>
        )}
        <button onClick={() => setPanel(panel === 'language' ? '' : 'language')}>
          ◉ {fil ? 'Wika' : 'Language'} ›
        </button>
        {panel === 'language' && (
          <div className="cg-profile-panel">
            <label>
              {fil ? 'Wika ng display' : 'Display language'}
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  setMessage(
                    e.target.value === 'fil'
                      ? 'Nakatakda na sa Filipino ang display.'
                      : 'Display language changed to English.'
                  );
                }}
              >
                <option value="en">English</option>
                <option value="fil">Filipino</option>
              </select>
            </label>
          </div>
        )}
        <button onClick={onLogout}>↪ {fil ? 'Mag-log out' : 'Log out'}</button>
      </div>
    </>
  );
}
function EmptyLinked({ onProfile }) {
  return (
    <>
      <Header title="Caregiver Home" subtitle="Monitor and support your linked patient." />
      <section className="cg-empty" aria-labelledby="cg-empty-title">
        <div className="cg-empty-art" aria-hidden="true">
          <CaregiverIcon name="patients" size={48} />
          <span>
            <CaregiverIcon name="link" size={20} />
          </span>
        </div>
        <small className="cg-empty-eyebrow">Patient connection</small>
        <h1 id="cg-empty-title">No patient linked yet</h1>
        <p>
          Connect with a patient to view their medicine schedule, dose updates, and important
          alerts.
        </p>
        <ol className="cg-empty-steps" aria-label="How to link a patient">
          <li>
            <span>1</span>
            <div>
              <strong>Ask for the secure code</strong>
              <small>The patient generates it from their Profile page.</small>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Enter the code</strong>
              <small>Open your Profile and choose your relationship.</small>
            </div>
          </li>
        </ol>
        <button type="button" onClick={onProfile}>
          <CaregiverIcon name="code" />
          <span>Link a Patient</span>
        </button>
        <div className="cg-empty-security">
          <CaregiverIcon name="shield" size={19} />
          <span>Codes are single-use and expire after 15 minutes.</span>
        </div>
      </section>
    </>
  );
}
