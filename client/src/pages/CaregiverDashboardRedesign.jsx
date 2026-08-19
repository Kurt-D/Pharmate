import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import '../styles/caregiver.css';
import '../styles/caregiver-profile.css';

const NAV = [
  ['home', '⌂', 'Home'],
  ['medications', '▣', 'Medication'],
  ['patient', '♙', 'Patient Info'],
  ['orders', '▱', 'Orders'],
  ['profile', '○', 'Profile'],
];
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
      await api(`/api/caregiver/patients/${selected}/notify`, {
        method: 'POST',
        body: { drug_name: drug },
      });
      setMessage('Medication reminder sent to the patient.');
    } catch (e) {
      setError(e.message);
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
            <i>{icon}</i>
            <span>
              {language === 'fil'
                ? {
                    Home: 'Home',
                    Medication: 'Gamot',
                    'Patient Info': 'Impormasyon',
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
      <span>◉⌄</span>
    </header>
  );
}
function AlertCard({ alert, onNotify, onContact }) {
  const drug = alert?.drug_name || 'a scheduled medicine';
  return (
    <section className="cg-alert">
      <div>
        <i>!</i>
        <span>
          <strong>Patient missed {drug.toUpperCase()}</strong>
          <small>
            {alert?.scheduled_time
              ? new Date(alert.scheduled_time).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : 'Dose needs attention'}
          </small>
        </span>
      </div>
      <div>
        <button onClick={() => onNotify(drug)}>♧ Notify Patient</button>
        <button onClick={() => onContact(drug)}>⌕ Contact Pharmacist</button>
      </div>
    </section>
  );
}
function Home({ code, alerts, meds, onNotify, onContact, onView }) {
  const alert = alerts[0];
  return (
    <>
      <Header title="Welcome, Caregiver!" subtitle={`Monitoring: ${code}`} />
      {alert && <AlertCard alert={alert} onNotify={onNotify} onContact={onContact} />}
      <section className="cg-card">
        <div className="cg-section-title">
          <h2>Today’s Medication Status</h2>
          <button onClick={() => onView('medications')}>View all ›</button>
        </div>
        {meds.slice(0, 4).map((m, i) => (
          <div className="cg-med-row" key={m.id}>
            <i className={`c${i % 3}`}>◆</i>
            <span>
              <strong>{m.drug_name_raw}</strong>
              <small>{m.frequency || m.dosage_instruction || 'Active medicine'}</small>
            </span>
            <em className={alert?.drug_name === m.drug_name_raw ? 'missed' : 'pending'}>
              {alert?.drug_name === m.drug_name_raw ? 'Missed' : 'Pending'}
            </em>
          </div>
        ))}
      </section>
      <section className="cg-adherence">
        <div>
          <strong>🔥 {Math.max(0, 7 - alerts.length)}</strong>
          <small>Day Streak</small>
        </div>
        <div>
          <strong>⌁ {alerts.length ? Math.max(0, 100 - alerts.length * 10) : 100}%</strong>
          <small>Adherence this week</small>
        </div>
      </section>
      <div className="cg-home-links">
        <button onClick={() => onView('patient')}>
          ♙{' '}
          <span>
            <strong>View Patient Details</strong>
            <small>Profile, medicine, and history</small>
          </span>
          ›
        </button>
        <button onClick={() => onContact('')}>
          ☎{' '}
          <span>
            <strong>Contact Pharmacy</strong>
            <small>Call or message the pharmacist</small>
          </span>
          ›
        </button>
        <button onClick={() => onView('medications')}>
          ▤{' '}
          <span>
            <strong>Counseling &amp; Prescription Review</strong>
            <small>View medication status</small>
          </span>
          ›
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
      await api('/api/caregiver/link', { method: 'POST', body: { code: code.trim() } });
      setCode('');
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
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="XXXX-XXXX-XXXX"
        />
        {error && <small>{error}</small>}
        <button onClick={link}>{fil ? 'I-link ang Pasyente' : 'Link Patient'}</button>
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
    <section className="cg-empty">
      <h1>No linked patient yet</h1>
      <p>Open Profile and enter the secure code generated by the patient.</p>
      <button onClick={onProfile}>Link a Patient</button>
    </section>
  );
}
