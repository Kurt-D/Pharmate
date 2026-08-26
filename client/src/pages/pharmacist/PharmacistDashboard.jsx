import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api.js';
import pharmateLogo from '../../assets/pharmate-logo-transparent.png';
import pharmacistWelcome from '../../assets/pharmacist-welcome.png';
import '../../styles/pharmacist-dashboard.css';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'validation', label: 'Prescription Validation', icon: 'prescription' },
  { id: 'inquiries', label: 'Medication Inquiries', icon: 'chat' },
  { id: 'patients', label: 'Patients', icon: 'patients' },
  { id: 'adherence', label: 'Adherence Tracking', icon: 'report' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const MOCK_INTERVENTIONS = [
  {
    id: 'PT-1042',
    name: 'Patient PT-1042',
    age: 67,
    conditions: 'Type 2 diabetes, hypertension',
    regimen: ['Metformin', 'Losartan', 'Atorvastatin'],
    adherence: 62,
    missed: 'Metformin 500 mg · Today, 8:00 AM',
    tokens: 3,
    risk: 'High',
  },
  {
    id: 'PT-1178',
    name: 'Patient PT-1178',
    age: 72,
    conditions: 'Atrial fibrillation, dyslipidemia',
    regimen: ['Apixaban', 'Bisoprolol', 'Rosuvastatin'],
    adherence: 71,
    missed: 'Apixaban 5 mg · Yesterday, 8:00 PM',
    tokens: 2,
    risk: 'High',
  },
  {
    id: 'PT-1205',
    name: 'Patient PT-1205',
    age: 61,
    conditions: 'COPD, allergic rhinitis',
    regimen: ['Tiotropium', 'Montelukast'],
    adherence: 79,
    missed: 'Tiotropium 18 mcg · Yesterday, 7:00 AM',
    tokens: 1,
    risk: 'Moderate',
  },
  {
    id: 'PT-1239',
    name: 'Patient PT-1239',
    age: 69,
    conditions: 'Hypertension, osteoarthritis',
    regimen: ['Amlodipine', 'Celecoxib'],
    adherence: 83,
    missed: 'Amlodipine 5 mg · Aug 24, 9:00 AM',
    tokens: 1,
    risk: 'Moderate',
  },
];

const MOCK_PRESCRIPTIONS = [
  {
    id: 'RX-260824-019',
    patient: 'PT-1042',
    doctor: 'Dr. Maria L. Santos',
    license: 'PRC 0118427',
    drug: 'Atorvastatin 20 mg tablet',
    instruction: 'Take one tablet once daily at bedtime',
    frequency: 'Every 24 hours · 30 days',
    uploaded: 'Today, 8:42 AM',
    status: 'pending',
  },
  {
    id: 'RX-260824-021',
    patient: 'PT-1178',
    doctor: 'Dr. Rafael P. Cruz',
    license: 'PRC 0097611',
    drug: 'Apixaban 5 mg tablet',
    instruction: 'Take one tablet every 12 hours',
    frequency: 'Twice daily · 90 days',
    uploaded: 'Today, 9:18 AM',
    status: 'pending',
  },
  {
    id: 'RX-260824-024',
    patient: 'PT-1239',
    doctor: 'Dr. Elena G. Reyes',
    license: 'PRC 0142208',
    drug: 'Celecoxib 200 mg capsule',
    instruction: 'Take one capsule after a meal when needed',
    frequency: 'Maximum once daily · 14 days',
    uploaded: 'Today, 10:06 AM',
    status: 'pending',
  },
];

const INITIAL_PATIENTS = [
  {
    id: 'PT-1042',
    age: 67,
    gender: 'Female',
    phone: '+63 917 555 1042',
    email: 'pt1042@pharmate.test',
    conditions: 'Type 2 diabetes, hypertension',
    regimen: 'Metformin · Losartan · Atorvastatin',
    adherence: 62,
    priority: true,
    severity: 'High',
    tokens: 3,
    registered: 'Apr 12, 2026',
    lastVisit: 'Aug 24, 2026',
    lastNote: 'Reinforced evening statin schedule and glucose monitoring.',
    noteDate: 'Aug 24, 2026',
    returning: true,
    followUps: [{ medicine: 'Metformin 500 mg', time: '11:00 AM' }, { medicine: 'Atorvastatin 20 mg', time: '8:00 PM' }],
  },
  {
    id: 'PT-1094',
    age: 64,
    gender: 'Male',
    phone: '+63 917 555 1094',
    email: 'pt1094@pharmate.test',
    conditions: 'Type 2 diabetes',
    regimen: 'Metformin · Sitagliptin',
    adherence: 88,
    priority: true,
    severity: 'Moderate',
    tokens: 4,
    registered: 'May 08, 2026',
    lastVisit: 'Aug 26, 2026',
    lastNote: 'Confirmed vitamin spacing and after-breakfast routine.',
    noteDate: 'Aug 26, 2026',
    returning: true,
    followUps: [{ medicine: 'Metformin 500 mg', time: '10:30 AM' }],
  },
  {
    id: 'PT-1178',
    age: 72,
    gender: 'Female',
    phone: '+63 917 555 1178',
    email: 'pt1178@pharmate.test',
    conditions: 'Atrial fibrillation, dyslipidemia',
    regimen: 'Apixaban · Bisoprolol · Rosuvastatin',
    adherence: 71,
    priority: true,
    severity: 'Critical',
    tokens: 2,
    registered: 'Mar 19, 2026',
    lastVisit: 'Aug 23, 2026',
    lastNote: 'Reviewed 12-hour apixaban interval; caregiver included.',
    noteDate: 'Aug 23, 2026',
    returning: true,
    followUps: [{ medicine: 'Apixaban 5 mg', time: '9:30 AM' }, { medicine: 'Apixaban 5 mg', time: '9:30 PM' }],
  },
  {
    id: 'PT-1205',
    age: 61,
    gender: 'Male',
    phone: '+63 917 555 1205',
    email: 'pt1205@pharmate.test',
    conditions: 'COPD, allergic rhinitis',
    regimen: 'Tiotropium · Montelukast',
    adherence: 79,
    priority: false,
    severity: 'Standard',
    tokens: 0,
    registered: 'Jun 03, 2026',
    lastVisit: 'Aug 22, 2026',
    lastNote: 'Demonstrated inhaler timing and daily reminder setup.',
    noteDate: 'Aug 22, 2026',
    returning: true,
    followUps: [{ medicine: 'Tiotropium 18 mcg', time: '2:30 PM' }],
  },
  {
    id: 'PT-1239',
    age: 69,
    gender: 'Female',
    phone: '+63 917 555 1239',
    email: 'pt1239@pharmate.test',
    conditions: 'Hypertension, osteoarthritis',
    regimen: 'Amlodipine · Celecoxib',
    adherence: 83,
    priority: false,
    severity: 'Standard',
    tokens: 0,
    registered: 'Jun 21, 2026',
    lastVisit: 'Aug 20, 2026',
    lastNote: 'Reviewed food timing and maximum daily celecoxib dose.',
    noteDate: 'Aug 20, 2026',
    returning: true,
    followUps: [],
  },
];

const INITIAL_THREADS = [
  {
    id: 'INQ-1848', patient: 'PT-1178', subject: 'Missed anticoagulant dose', medicine: 'Apixaban 5 mg', unread: 2, updated: '10:48 AM', priority: true, tokens: 2,
    messages: [
      { id: 1, from: 'patient', text: 'I missed my apixaban dose this morning. When should I take the next one?', time: '10:41 AM' },
      { id: 2, from: 'patient', text: 'This happened once last week too.', time: '10:43 AM' },
    ],
  },
  {
    id: 'INQ-1845', patient: 'PT-1042', subject: 'Metformin dose timing', medicine: 'Metformin 500 mg', unread: 1, updated: '10:31 AM', priority: true, tokens: 3,
    messages: [{ id: 1, from: 'patient', text: 'Can I move my evening metformin closer to dinner?', time: '10:31 AM' }],
  },
  {
    id: 'INQ-1842', patient: 'PT-1094', subject: 'Spacing metformin and vitamins', medicine: 'Metformin 500 mg', unread: 0, updated: '10:12 AM', priority: true, tokens: 4,
    messages: [
      { id: 1, from: 'patient', text: 'Can I take my multivitamin with metformin?', time: '10:03 AM' },
      { id: 2, from: 'pharmacist', text: 'You may take them after breakfast. Keep the timing consistent and follow the dose on your prescription.', time: '10:10 AM' },
      { id: 3, from: 'patient', text: 'Thank you. I will keep the same schedule.', time: '10:12 AM' },
    ],
  },
  {
    id: 'INQ-1821', patient: 'PT-1239', subject: 'Medicine with food', medicine: 'Celecoxib 200 mg', unread: 0, updated: 'Yesterday', priority: false, tokens: 0,
    messages: [
      { id: 1, from: 'patient', text: 'Should this be taken before or after meals?', time: '4:12 PM' },
      { id: 2, from: 'pharmacist', text: 'Take it after a meal as written on the prescription, and do not exceed the listed daily dose.', time: '4:19 PM' },
    ],
  },
];

const PATIENT_ALERTS = [
  { id: 'ALT-1042', patient: 'PT-1042', medicine: 'Metformin 500 mg', reason: 'Missed dose', age: '5 min ago', tone: 'urgent' },
  { id: 'ALT-1178', patient: 'PT-1178', medicine: 'Apixaban 5 mg', reason: 'Missed dose', age: '12 min ago', tone: 'urgent' },
  { id: 'ALT-1205', patient: 'PT-1205', medicine: 'Tiotropium 18 mcg', reason: 'Late dose', age: '18 min ago', tone: 'warning' },
  { id: 'ALT-1239', patient: 'PT-1239', medicine: 'Amlodipine 5 mg', reason: 'Late dose', age: '25 min ago', tone: 'warning' },
];

function Icon({ name, size = 20 }) {
  const paths = {
    dashboard: <path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z" />,
    prescription: (
      <>
        <path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="M15 3v5h5M9 13h6M9 17h4" />
      </>
    ),
    chat: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8ZM8 9h8M8 13h5" />,
    patients: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M18 14a6 6 0 0 1 4 6" />
      </>
    ),
    report: <path d="M5 21V10M12 21V3M19 21v-7M3 21h18" />,
    priority: <path d="M12 3 3 7v6c0 5 3.8 8 9 9 5.2-1 9-4 9-9V7l-9-4Zm0 5v5m0 4h.01" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    accessibility: <path d="M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-7 6h14M12 9v12M8 21l4-7 4 7" />,
    token: <path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V7Zm8 2v8" />,
    download: <path d="M12 3v12m-4-4 4 4 4-4M5 21h14" />,
    alert: <path d="M12 3 2.7 20h18.6L12 3Zm0 6v5m0 3h.01" />,
    review: <path d="m9 12 2 2 4-5M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />,
    clock: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2" />,
    shield: <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Zm-3-10 2 2 4-5" />,
    note: <path d="M4 4h16v16H4V4Zm4 5h8M8 13h8M8 17h5" />,
    send: <path d="m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2" />,
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    logout: <path d="M10 17l5-5-5-5M15 12H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" />,
    moon: <path d="M21 15.2A9 9 0 1 1 8.8 3a7 7 0 0 0 12.2 12.2Z" />,
    search: <path d="m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
    user: <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    expand: <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />,
    minimize: <path d="M8 8H3V3M16 8h5V3M8 16H3v5M16 16h5v5" />,
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
    >
      {paths[name]}
    </svg>
  );
}

function MetricCard({ label, value, detail, tone, icon }) {
  return (
    <article className={`phd-metric phd-metric--${tone}`}>
      <span className="phd-metric__icon">
        <Icon name={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function Progress({ value }) {
  const tone = value < 70 ? 'danger' : value < 85 ? 'warning' : 'success';
  return (
    <div className="phd-progress" aria-label={`${value}% adherence`}>
      <div>
        <span className={`phd-progress__bar ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <strong>{value}%</strong>
    </div>
  );
}

function Overview({ metrics, onNavigate, pharmacistName }) {
  return (
    <div className="phd-section-stack">
      <section className="phd-overview-hero">
        <div className="phd-overview-hero__copy">
          <span className="phd-overview-hero__status"><i /> Pharmacist workstation ready</span>
          <h2>Welcome, {pharmacistName}</h2>
          <p>Your clinical queue is organized by medication risk and priority access. Start with the items that need a pharmacist’s attention today.</p>
          <div><button onClick={() => onNavigate('validation')} type="button"><Icon name="prescription" size={17} /> Review {metrics.pendingRx} prescriptions</button><button onClick={() => onNavigate('inquiries')} type="button"><Icon name="chat" size={17} /> Open inquiries</button></div>
        </div>
        <div className="phd-overview-hero__art" aria-hidden="true"><span /><span /><img alt="" src={pharmacistWelcome} /></div>
      </section>
      <section className="phd-metrics" aria-label="Pharmacy triage summary">
        <MetricCard label="High-Risk Patients" value={metrics.highRisk} detail="Require intervention today" tone="red" icon="alert" />
        <MetricCard label="Pending Rx Reviews" value={metrics.pendingRx} detail="Oldest waiting 38 minutes" tone="blue" icon="prescription" />
        <MetricCard label="Open Inquiries" value={metrics.inquiries} detail="2 priority conversations" tone="teal" icon="chat" />
        <MetricCard label="Today's Missed Doses" value={metrics.missed} detail="Across 7 monitored patients" tone="amber" icon="clock" />
      </section>

      <section className="phd-card">
        <div className="phd-card__header">
          <div>
            <span className="phd-eyebrow">Clinical triage</span>
            <h2>Priority Intervention Queue</h2>
            <p>Patients ranked by severe clinical risk, recent missed doses, and priority token access.</p>
          </div>
          <button className="phd-button phd-button--quiet" onClick={() => onNavigate('patients')} type="button">
            View patient roster <Icon name="chevron" size={16} />
          </button>
        </div>
        <div className="phd-table-wrap">
          <table className="phd-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Clinical context</th>
                <th>Active regimen</th>
                <th>Adherence</th>
                <th>Latest missed dose</th>
                <th>Priority</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {MOCK_INTERVENTIONS.map((patient) => (
                <tr key={patient.id}>
                  <td>
                    <strong>{patient.id}</strong>
                    <small>{patient.age} years old</small>
                  </td>
                  <td>
                    <span>{patient.conditions}</span>
                    <small className={`phd-risk phd-risk--${patient.risk.toLowerCase()}`}>{patient.risk} risk</small>
                  </td>
                  <td>
                    <div className="phd-regimen">
                      {patient.regimen.map((medicine) => <span key={medicine}>{medicine}</span>)}
                    </div>
                  </td>
                  <td><Progress value={patient.adherence} /></td>
                  <td><span className="phd-missed">{patient.missed}</span></td>
                  <td><span className="phd-token">{patient.tokens} tokens</span></td>
                  <td>
                    <button className="phd-icon-button" aria-label={`Open ${patient.id} inquiry`} onClick={() => onNavigate('inquiries')} type="button">
                      <Icon name="chevron" size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PrescriptionValidation({ prescriptions, selectedId, setSelectedId, reviewLogs, setReviewLogs, onDecision, feedback }) {
  const selected = prescriptions.find((item) => item.id === selectedId) || prescriptions[0];
  const pending = prescriptions.filter((item) => item.status === 'pending').length;
  const [isDocumentExpanded, setIsDocumentExpanded] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionDraft, setRejectionDraft] = useState('');
  const [rejectionError, setRejectionError] = useState('');

  function openRejectionModal(id) {
    setRejectingId(id);
    setRejectionDraft('');
    setRejectionError('');
  }

  function closeRejectionModal() {
    setRejectingId(null);
    setRejectionDraft('');
    setRejectionError('');
  }

  function confirmRejection() {
    if (!reviewLogs[rejectingId]?.trim()) {
      setRejectionError('Complete the pharmacist review log before rejecting this prescription.');
      return;
    }
    if (!rejectionDraft.trim()) {
      setRejectionError('Enter a clear reason for rejecting this prescription.');
      return;
    }
    if (onDecision(rejectingId, 'rejected', rejectionDraft.trim())) closeRejectionModal();
  }

  return (
    <div className="phd-section-stack">
      {feedback && <div className="phd-feedback" role="status">{feedback}</div>}
      <section className="phd-verification-workspace">
        <aside className="phd-verification-queue">
          <header><div><span className="phd-eyebrow">Review queue</span><h2>Pending Verification</h2></div><b>{pending}</b></header>
          <div className="phd-verification-queue__list">
            {prescriptions.map((rx, index) => (
              <button className={rx.id === selected.id ? 'active' : ''} key={rx.id} onClick={() => setSelectedId(rx.id)} type="button">
                <span className={`phd-patient-dot phd-patient-dot--${index % 3}`}><Icon name="prescription" size={17} /></span>
                <span><strong>{rx.patient}</strong><small>{rx.id}</small></span>
                <span className="phd-queue-time"><i className={`phd-status phd-status--${rx.status}`}>{rx.status}</i><small>{rx.uploaded}</small></span>
              </button>
            ))}
          </div>
        </aside>

        <div className="phd-verification-main">
          {isDocumentExpanded && <button aria-label="Minimize prescription viewer" className="phd-document-viewer-backdrop" onClick={() => setIsDocumentExpanded(false)} type="button" />}
          <article aria-modal={isDocumentExpanded || undefined} className={`phd-card phd-verification-preview${isDocumentExpanded ? ' is-document-expanded' : ''}`} role={isDocumentExpanded ? 'dialog' : undefined}>
            <div className="phd-card__header">
              <div><span className="phd-eyebrow">Uploaded prescription / e-RX</span><h2>{selected.patient} · {selected.id}</h2><p>Uploaded {selected.uploaded}</p></div>
              <div className="phd-preview-heading-actions"><span className={`phd-status phd-status--${selected.status}`}>{selected.status}</span><button aria-pressed={isDocumentExpanded} onClick={() => setIsDocumentExpanded((current) => !current)} type="button"><Icon name={isDocumentExpanded ? 'minimize' : 'expand'} size={16} /> {isDocumentExpanded ? 'Minimize' : 'View full'}</button></div>
            </div>
            <div className="phd-rx-document" role="img" aria-label={`Prescription document preview for ${selected.id}`}>
              <div className="phd-rx-document__heading"><strong>℞</strong><span>Date: Aug 26, 2026</span></div>
              <p className="phd-rx-document__patient">Patient: {selected.patient}</p>
              <div className="phd-rx-document__body">
                <strong>{selected.drug}</strong>
                <p>{selected.instruction}</p>
                <p>{selected.frequency}</p>
              </div>
              <div className="phd-rx-document__signature"><span>{selected.doctor}</span><small>{selected.license}</small></div>
            </div>
            <div className="phd-document-tools" aria-label="Document controls"><button onClick={() => setIsDocumentExpanded((current) => !current)} type="button"><Icon name={isDocumentExpanded ? 'minimize' : 'expand'} size={15} /> {isDocumentExpanded ? 'Minimize' : 'View full'}</button><button type="button">100%</button><button type="button"><Icon name="download" size={15} /> Download</button></div>
          </article>

          <div className="phd-verification-bottom">
            <article className="phd-card phd-verification-details">
              <div className="phd-card__header"><div><span className="phd-eyebrow">Prescription details</span><h2>Order Information</h2></div></div>
              <dl>
                <div><dt>Order ID</dt><dd>{selected.id}</dd></div>
                <div><dt>Patient</dt><dd>{selected.patient}</dd></div>
                <div><dt>Prescriber</dt><dd>{selected.doctor}<small>{selected.license}</small></dd></div>
                <div><dt>Medication</dt><dd>{selected.drug}</dd></div>
                <div><dt>Directions</dt><dd>{selected.instruction}</dd></div>
              </dl>
            </article>
            <article className="phd-card phd-verification-actions">
              <div className="phd-card__header"><div><span className="phd-eyebrow">Pharmacist action</span><h2>Verification Decision</h2></div><span className="phd-safety-chip"><Icon name="shield" size={15} /> Review required</span></div>
              <label className="phd-review-log"><span>Required pharmacist review log</span><textarea disabled={selected.status !== 'pending'} onChange={(event) => setReviewLogs((logs) => ({ ...logs, [selected.id]: event.target.value }))} placeholder="Record patient, prescriber, dose, interval, and document checks…" rows="4" value={reviewLogs[selected.id] || ''} /></label>
              <div className="phd-rx-actions">
                <button className="phd-button phd-button--success" disabled={selected.status !== 'pending'} onClick={() => onDecision(selected.id, 'approved')} type="button"><Icon name="review" size={17} /> Validate & Approve</button>
                <button className="phd-button phd-button--danger-outline" disabled={selected.status !== 'pending'} onClick={() => openRejectionModal(selected.id)} type="button">Reject Rx</button>
              </div>
            </article>
          </div>
        </div>
      </section>
      {rejectingId && (
        <div className="phd-rejection-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeRejectionModal()}>
          <section aria-labelledby="phd-rejection-title" aria-modal="true" className="phd-rejection-modal" role="dialog">
            <header><span><Icon name="alert" size={21} /></span><div><small>Prescription {rejectingId}</small><h2 id="phd-rejection-title">Reject Prescription</h2><p>Document the exact issue so the patient and prescribing team understand what must be corrected.</p></div><button aria-label="Close rejection dialog" onClick={closeRejectionModal} type="button"><Icon name="close" size={19} /></button></header>
            <label><span>Required rejection reason</span><textarea autoFocus onChange={(event) => { setRejectionDraft(event.target.value); setRejectionError(''); }} placeholder="Example: Prescriber license is missing, dosage is unclear, or the document is unreadable…" rows="5" value={rejectionDraft} /></label>
            {rejectionError && <div className="phd-rejection-modal__error" role="alert"><Icon name="alert" size={16} /> {rejectionError}</div>}
            <aside><Icon name="shield" size={17} /><p>This reason is saved with the frontend review record and shown in the prescription status.</p></aside>
            <footer><button className="phd-button phd-button--quiet" onClick={closeRejectionModal} type="button">Cancel</button><button className="phd-button phd-button--danger" disabled={!rejectionDraft.trim()} onClick={confirmRejection} type="button">Confirm Rejection</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}

function Consultation({ threads, patients, activeChatId, setActiveChatId, draft, setDraft, onSend, onAddNote }) {
  const orderedThreads = [...threads].sort((a, b) => Number(b.priority) - Number(a.priority));
  const active = threads.find((thread) => thread.id === activeChatId) || orderedThreads[0];
  const patient = patients.find((item) => item.id === active.patient);
  const replied = threads.filter((thread) => thread.messages.some((message) => message.from === 'pharmacist')).length;

  return (
    <div className="phd-section-stack">
      <section className="phd-inquiry-metrics" aria-label="Inquiry summary">
        <MetricCard label="Total inquiries" value={threads.length} detail="One unified queue" tone="blue" icon="chat" />
        <MetricCard label="Replied" value={replied} detail="Responses recorded" tone="teal" icon="review" />
        <MetricCard label="Awaiting reply" value={threads.length - replied} detail="Needs pharmacist response" tone="amber" icon="clock" />
        <MetricCard label="Priority patients" value={threads.filter((thread) => thread.priority).length} detail="Shown first in the same list" tone="red" icon="priority" />
      </section>
      <aside className="phd-scope-notice">
        <span><Icon name="shield" /></span>
        <div><strong>Medication inquiry support only</strong><p>Answer medicine usage, dose timing, interaction spacing, and adherence questions. Do not diagnose conditions or prescribe new therapy.</p></div>
      </aside>
      <section className="phd-unified-inquiries">
        <aside className="phd-thread-list phd-unified-inquiries__list">
          <div className="phd-thread-list__header"><div><span className="phd-eyebrow">Priority ordered</span><h2>Active Inquiries</h2></div><span>{threads.length}</span></div>
          <label className="phd-search"><Icon name="search" size={17} /><input aria-label="Search inquiries" placeholder="Search patient or medicine" type="search" /></label>
          <div className="phd-thread-list__items">
            {orderedThreads.map((thread) => (
              <button className={thread.id === active.id ? 'active' : ''} key={thread.id} onClick={() => setActiveChatId(thread.id)} type="button">
                <span className="phd-thread-avatar"><Icon name="user" size={17} /></span>
                <span><strong>{thread.patient}{thread.priority && <i className="phd-inline-priority">Priority</i>}</strong><b>{thread.subject}</b><small>{thread.medicine}</small></span>
                <span className="phd-thread-meta"><time>{thread.updated}</time>{thread.unread > 0 && <i>{thread.unread}</i>}</span>
              </button>
            ))}
          </div>
        </aside>

        <aside className="phd-inquiry-context">
          <header><span className="phd-eyebrow">Patient context</span><h2>{patient?.id}</h2>{patient?.returning && <span className="phd-returning"><Icon name="review" size={14} /> Returning patient</span>}</header>
          <dl>
            <div><dt>Age / gender</dt><dd>{patient?.age} · {patient?.gender}</dd></div>
            <div><dt>Condition</dt><dd>{patient?.conditions}</dd></div>
            <div><dt>Active regimen</dt><dd>{patient?.regimen}</dd></div>
            <div><dt>Adherence</dt><dd><Progress value={patient?.adherence || 0} /></dd></div>
          </dl>
          <div className="phd-previous-note">
            <span><Icon name="note" size={16} /> Previous pharmacist note</span>
            <p>{patient?.lastNote || 'No previous pharmacist note.'}</p>
            <small>{patient?.noteDate || 'No date recorded'}</small>
          </div>
          <button className="phd-button phd-button--quiet" onClick={() => patient && onAddNote(patient)} type="button"><Icon name="plus" size={15} /> Add note</button>
        </aside>

        <div className="phd-chat-panel phd-unified-inquiries__chat">
          <header><span className="phd-chat-avatar"><Icon name="user" /></span><div><h2>{active.patient}</h2><p>{active.subject} · {active.medicine}</p></div>{active.priority && <span className="phd-inquiry-state priority">Priority</span>}</header>
          <div className="phd-messages" aria-live="polite">
            {active.messages.map((message) => <div className={`phd-message phd-message--${message.from}`} key={message.id}><div>{message.text}</div><time>{message.from === 'pharmacist' ? 'You' : active.patient} · {message.time}</time></div>)}
          </div>
          <form className="phd-composer" onSubmit={onSend}>
            <textarea aria-label="Response message" onChange={(event) => setDraft(event.target.value)} placeholder="Write a medication-focused response…" rows="2" value={draft} />
            <div><small>Responses are recorded in the inquiry history.</small><button className="phd-button phd-button--primary" disabled={!draft.trim()} type="submit">Send response <Icon name="send" size={16} /></button></div>
          </form>
        </div>
      </section>
    </div>
  );
}

function PatientRegistry({ patients, selectedId, setSelectedId, search, setSearch, onAddNote, onOpenInquiry }) {
  const filtered = patients
    .filter((patient) => [patient.id, patient.conditions, patient.regimen, patient.lastNote].some((value) => value.toLowerCase().includes(search.trim().toLowerCase())))
    .sort((a, b) => Number(b.priority) - Number(a.priority) || a.id.localeCompare(b.id));
  const selected = patients.find((patient) => patient.id === selectedId) || filtered[0] || patients[0];
  const alerts = PATIENT_ALERTS.filter((alert) => alert.patient === selected.id || alert.tone === 'urgent');

  return (
    <div className="phd-section-stack">
      <section className="phd-patient-metrics" aria-label="Patient registry summary">
        <MetricCard label="Total patients" value={patients.length} detail="Enrolled in PharMate" tone="blue" icon="patients" />
        <MetricCard label="Active patients" value={patients.length - 1} detail="Medication schedules active" tone="teal" icon="user" />
        <MetricCard label="Priority patients" value={patients.filter((patient) => patient.priority).length} detail="Placed first in the roster" tone="red" icon="priority" />
      </section>
      <label className="phd-search phd-patient-search"><Icon name="search" size={17} /><input aria-label="Search patient registry" onChange={(event) => setSearch(event.target.value)} placeholder="Search patient ID, condition, medicine, or note" type="search" value={search} /></label>

      <section className="phd-patient-workspace">
        <aside className="phd-patient-list">
          <header><div><span className="phd-eyebrow">Priority ordered</span><h2>Patient List</h2></div><b>{filtered.length}</b></header>
          <div>
            {filtered.map((patient, index) => (
              <button className={patient.id === selected.id ? 'active' : ''} key={patient.id} onClick={() => setSelectedId(patient.id)} type="button">
                <span className={`phd-patient-avatar phd-patient-avatar--${index % 3}`}>{patient.id.replace('PT-', '')}</span>
                <span><strong>{patient.id}{patient.priority && <i className="phd-inline-priority">Priority</i>}</strong><small>{patient.age} years · {patient.gender}</small><small>{patient.phone}</small></span>
              </button>
            ))}
          </div>
          {filtered.length === 0 && <div className="phd-empty">No patients match your search.</div>}
        </aside>

        <article className="phd-patient-profile">
          <header><div><span className="phd-eyebrow">Patient record</span><h2>{selected.id}</h2></div>{selected.priority && <span className="phd-inquiry-state priority"><Icon name="priority" size={14} /> Priority</span>}</header>
          <section className="phd-patient-information">
            <h3><Icon name="user" size={17} /> Patient Information</h3>
            <dl>
              <div><dt>Patient ID</dt><dd>{selected.id}</dd></div><div><dt>Age / gender</dt><dd>{selected.age} · {selected.gender}</dd></div>
              <div><dt>Phone</dt><dd>{selected.phone}</dd></div><div><dt>Email</dt><dd>{selected.email}</dd></div>
              <div><dt>Registered</dt><dd>{selected.registered}</dd></div><div><dt>Last visit</dt><dd>{selected.lastVisit}</dd></div>
              <div><dt>Primary condition</dt><dd>{selected.conditions}</dd></div><div><dt>Adherence</dt><dd><Progress value={selected.adherence} /></dd></div>
            </dl>
          </section>
          <section className="phd-patient-note"><div><span><Icon name="note" size={16} /> Latest pharmacist note</span><small>{selected.noteDate}</small></div><p>{selected.lastNote}</p><button className="phd-button phd-button--quiet" onClick={() => onAddNote(selected)} type="button"><Icon name="plus" size={15} /> Add note</button></section>
          <section className="phd-patient-followups">
            <header><h3><Icon name="clock" size={17} /> Follow-ups Due Today</h3><span>{selected.followUps.length}</span></header>
            {selected.followUps.length > 0 ? selected.followUps.map((followUp) => <div key={`${followUp.medicine}-${followUp.time}`}><span><strong>{followUp.medicine}</strong><small>{selected.id}</small></span><time>{followUp.time}</time><button onClick={() => onOpenInquiry(selected)} type="button">Open inquiry</button></div>) : <p>No follow-ups due today.</p>}
          </section>
        </article>

        <aside className="phd-patient-alerts">
          <header><div><span className="phd-eyebrow">Attention</span><h2>Missed Dose Alerts</h2></div><b>{alerts.length}</b></header>
          <div>
            {alerts.map((alert) => <article className={`phd-patient-alert phd-patient-alert--${alert.tone}`} key={alert.id}><header><strong>{alert.patient}</strong><time>{alert.age}</time></header><dl><div><dt>Medicine</dt><dd>{alert.medicine}</dd></div><div><dt>Reason</dt><dd>{alert.reason}</dd></div></dl><button onClick={() => onOpenInquiry(patients.find((patient) => patient.id === alert.patient) || selected)} type="button"><Icon name="chat" size={14} /> Open inquiry</button></article>)}
          </div>
        </aside>
      </section>
    </div>
  );
}

function SettingToggle({ checked, description, icon, label, onChange }) {
  return (
    <div className="phd-setting-row">
      <span><Icon name={icon} size={18} /></span>
      <div><strong>{label}</strong><p>{description}</p></div>
      <button aria-checked={checked} aria-label={`${label}: ${checked ? 'on' : 'off'}`} className={checked ? 'is-on' : ''} onClick={() => onChange(!checked)} role="switch" type="button"><i /></button>
    </div>
  );
}

function Settings({ settings, setSettings, saved, onSave }) {
  const set = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  return (
    <div className="phd-settings-layout">
      <section className="phd-card phd-settings-profile">
        <div className="phd-card__header"><div><span className="phd-eyebrow">Workstation profile</span><h2>Pharmacist Availability</h2><p>Frontend preference used to communicate your current queue capacity.</p></div></div>
        <div className="phd-settings-profile__body">
          <label><span>Current status</span><select onChange={(event) => set('status', event.target.value)} value={settings.status}><option>On duty</option><option>Available for inquiries</option><option>Reviewing prescriptions</option><option>Temporarily unavailable</option></select></label>
          <label><span>Shift focus</span><select onChange={(event) => set('shiftFocus', event.target.value)} value={settings.shiftFocus}><option>Balanced queue</option><option>High-risk interventions</option><option>Prescription validation</option><option>Medication inquiries</option></select></label>
          <div className="phd-workstation-preview"><span><i /></span><div><small>Profile preview</small><strong>{settings.status}</strong><p>{settings.shiftFocus}</p></div></div>
        </div>
      </section>

      <section className="phd-card phd-settings-card">
        <div className="phd-card__header"><div><span className="phd-eyebrow">Accessibility</span><h2>Display & Interaction</h2><p>Adjust the clinical workstation without changing system data.</p></div><span className="phd-accessible-badge"><Icon name="accessibility" size={16} /> WCAG-minded controls</span></div>
        <div className="phd-settings-rows">
          <SettingToggle checked={settings.darkMode} description="Use a low-glare dark workspace. The standard interface remains the light clinical theme." icon="moon" label="Dark mode" onChange={(value) => set('darkMode', value)} />
          <SettingToggle checked={settings.largeText} description="Increase table, card, and navigation text for easier reading." icon="accessibility" label="Larger clinical text" onChange={(value) => set('largeText', value)} />
          <SettingToggle checked={settings.highContrast} description="Strengthen borders, text, and focus visibility throughout the dashboard." icon="shield" label="High-contrast mode" onChange={(value) => set('highContrast', value)} />
          <SettingToggle checked={settings.comfortableDensity} description="Add space between dense clinical records and action controls." icon="report" label="Comfortable information density" onChange={(value) => set('comfortableDensity', value)} />
          <SettingToggle checked={settings.reduceMotion} description="Remove decorative movement and interface transitions." icon="settings" label="Reduce motion" onChange={(value) => set('reduceMotion', value)} />
        </div>
      </section>

      <section className="phd-card phd-settings-card">
        <div className="phd-card__header"><div><span className="phd-eyebrow">Attention controls</span><h2>Alerts & Queue Signals</h2><p>Choose which frontend reminders stay prominent during your shift.</p></div></div>
        <div className="phd-settings-rows">
          <SettingToggle checked={settings.desktopAlerts} description="Show visual reminders for new validation and inquiry items." icon="alert" label="Workstation alert cards" onChange={(value) => set('desktopAlerts', value)} />
          <SettingToggle checked={settings.soundAlerts} description="Play a short sound only for critical missed-dose events." icon="priority" label="Critical alert sound" onChange={(value) => set('soundAlerts', value)} />
          <SettingToggle checked={settings.tokenSignals} description="Display priority token badges alongside clinical severity." icon="token" label="Priority token indicators" onChange={(value) => set('tokenSignals', value)} />
        </div>
      </section>

      <div className="phd-settings-save">
        <span role="status">{saved}</span>
        <button className="phd-button phd-button--primary" onClick={onSave} type="button"><Icon name="review" size={17} /> Save frontend preferences</button>
      </div>
    </div>
  );
}

function AdherenceTracking() {
  const [data, setData] = useState({ summary: {}, trend: [], patients: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let active = true;
    api('/api/pharmacist/adherence')
      .then((response) => { if (active) { setData(response.data); setError(''); } })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filteredPatients = data.patients.filter((patient) => {
    if (filter === 'attention') return patient.adherence_pct < 80 || patient.missed > 0;
    if (filter === 'on-track') return patient.adherence_pct >= 80 && patient.missed === 0;
    return true;
  });

  function downloadReport() {
    const headers = ['patient_code', 'scheduled', 'taken', 'taken_late', 'missed', 'adherence_pct'];
    const rows = data.patients.map((item) => [item.patient_code, item.scheduled, item.taken, item.taken_late, item.missed, item.adherence_pct].join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'pharmate-adherence-report.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="phd-section-stack">
      <section className="phd-report-toolbar">
        <div><span className="phd-eyebrow">Medication safety monitoring</span><h2>Patient Adherence Tracking</h2><p>Review privacy-safe dose completion and missed-dose signals from the last seven days.</p></div>
        <div><label><span>Patient view</span><select onChange={(event) => setFilter(event.target.value)} value={filter}><option value="all">All monitored patients</option><option value="attention">Needs attention</option><option value="on-track">On track</option></select></label><button className="phd-button phd-button--quiet" disabled={!data.patients.length} onClick={downloadReport} type="button"><Icon name="download" size={16} /> Export CSV</button></div>
      </section>
      {error && <div className="phd-feedback" role="alert">{error}</div>}
      <section className="phd-report-metrics">
        <article><span><Icon name="report" /></span><div><small>Seven-day adherence rate</small><strong>{loading ? '—' : `${data.summary.adherence_pct || 0}%`}</strong><p>{data.summary.completed || 0} of {data.summary.scheduled || 0} doses completed</p></div></article>
        <article><span><Icon name="review" /></span><div><small>Doses completed</small><strong>{loading ? '—' : data.summary.completed || 0}</strong><p>Includes on-time and late dose records</p></div></article>
        <article><span><Icon name="alert" /></span><div><small>Missed doses</small><strong>{loading ? '—' : data.summary.missed || 0}</strong><p>{data.summary.needs_attention || 0} patients need pharmacist attention</p></div></article>
      </section>
      <div className="phd-report-grid">
        <section className="phd-card phd-chart-card">
          <div className="phd-card__header"><div><span className="phd-eyebrow">Seven-day safety view</span><h2>Daily adherence rate</h2><p>Percentage of scheduled doses recorded as taken or taken late.</p></div><span className="phd-safety-chip">Target ≥ 80%</span></div>
          <div className="phd-bar-chart" role="img" aria-label="Seven day interval adherence chart">
            {data.trend.map((item) => <div key={item.date}><span><i style={{ height: `${Math.max(2, item.adherence_pct)}%` }} /><b>{item.adherence_pct}%</b></span><small>{new Date(`${item.date}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short' })}</small></div>)}
          </div>
        </section>
        <section className="phd-card phd-safety-table phd-adherence-roster">
          <div className="phd-card__header"><div><span className="phd-eyebrow">Follow-up list</span><h2>Patient adherence summary</h2><p>Patient codes only; no names or diagnoses.</p></div><b>{filteredPatients.length}</b></div>
          <div className="phd-table-wrap"><table><thead><tr><th>Patient</th><th>Completed</th><th>Missed</th><th>Rate</th></tr></thead><tbody>{filteredPatients.map((patient) => <tr key={patient.patient_code}><td><strong>{patient.patient_code}</strong></td><td>{patient.taken + patient.taken_late}/{patient.scheduled}</td><td><span className={patient.missed ? 'phd-adherence-alert' : 'phd-adherence-ok'}>{patient.missed}</span></td><td><Progress value={patient.adherence_pct} /></td></tr>)}</tbody></table></div>
          {!loading && !filteredPatients.length && <p className="px-empty">No patients match this adherence filter.</p>}
        </section>
      </div>
    </div>
  );
}

function NoteDrawer({ patient, note, setNote, noteType, setNoteType, onClose, onSave }) {
  if (!patient) return null;
  return (
    <div className="phd-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside aria-labelledby="clinical-note-title" aria-modal="true" className="phd-note-drawer" role="dialog">
        <header><div><span className="phd-eyebrow">Patient {patient.id}</span><h2 id="clinical-note-title">Add Clinical Note</h2><p>Document medication inquiry guidance and adherence support.</p></div><button aria-label="Close clinical note" onClick={onClose} type="button"><Icon name="close" /></button></header>
        <div className="phd-note-patient"><span><Icon name="user" /></span><div><strong>{patient.id}</strong><small>{patient.age} years · {patient.conditions}</small></div></div>
        <label><span>Note category</span><select onChange={(event) => setNoteType(event.target.value)} value={noteType}><option>Inquiry summary</option><option>Dose timing guidance</option><option>Interaction spacing</option><option>Adherence intervention</option><option>Caregiver coordination</option></select></label>
        <label><span>Clinical note</span><textarea autoFocus onChange={(event) => setNote(event.target.value)} placeholder="Record the inquiry summary, timing plan, or spacing instruction…" rows="8" value={note} /></label>
        <div className="phd-note-guidance"><Icon name="shield" size={18} /><p>Do not enter diagnoses or new prescribing instructions. Notes become part of the pharmacist audit record.</p></div>
        <footer><button className="phd-button phd-button--quiet" onClick={onClose} type="button">Cancel</button><button className="phd-button phd-button--primary" disabled={!note.trim()} onClick={onSave} type="button"><Icon name="note" size={17} /> Save clinical note</button></footer>
      </aside>
    </div>
  );
}

export default function PharmacistDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [prescriptions, setPrescriptions] = useState(MOCK_PRESCRIPTIONS);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState(MOCK_PRESCRIPTIONS[0].id);
  const [reviewLogs, setReviewLogs] = useState({});
  const [decisionFeedback, setDecisionFeedback] = useState('');
  const [threads, setThreads] = useState(INITIAL_THREADS);
  const [activeChatId, setActiveChatId] = useState(INITIAL_THREADS[0].id);
  const [draft, setDraft] = useState('');
  const [patients, setPatients] = useState(INITIAL_PATIENTS);
  const [selectedPatientId, setSelectedPatientId] = useState(INITIAL_PATIENTS[0].id);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteType, setNoteType] = useState('Inquiry summary');
  const [settingsSaved, setSettingsSaved] = useState('');
  const [settings, setSettings] = useState({
    status: 'On duty',
    shiftFocus: 'Balanced queue',
    darkMode: false,
    largeText: false,
    highContrast: false,
    comfortableDensity: true,
    reduceMotion: false,
    desktopAlerts: true,
    soundAlerts: false,
    tokenSignals: true,
  });

  const metrics = useMemo(() => ({
    highRisk: patients.filter((patient) => ['Critical', 'High'].includes(patient.severity)).length,
    pendingRx: prescriptions.filter((item) => item.status === 'pending').length,
    inquiries: threads.length,
    missed: 9,
  }), [patients, prescriptions, threads.length]);

  const title = NAV_ITEMS.find((item) => item.id === activeTab)?.label || 'Overview';
  const pharmacistName = user?.name || user?.full_name || user?.email?.split('@')[0] || 'Clinical Pharmacist';
  const licenseNumber = user?.license_number || user?.licenseNo || 'PRC-0123456';

  function selectTab(tab) {
    setActiveTab(tab);
    setSidebarOpen(false);
  }

  function decidePrescription(id, status, rejectionReason = '') {
    if (!reviewLogs[id]?.trim()) {
      setDecisionFeedback('Enter a pharmacist review log before approving or rejecting a prescription.');
      return false;
    }
    if (status === 'rejected' && !rejectionReason.trim()) {
      setDecisionFeedback('Enter a clear rejection reason before rejecting this prescription.');
      return false;
    }
    setPrescriptions((items) => items.map((item) => item.id === id ? { ...item, status, rejectionReason: status === 'rejected' ? rejectionReason.trim() : '' } : item));
    setDecisionFeedback(`${id} was ${status}. The pharmacist review${status === 'rejected' ? ' and rejection reason were' : ' was'} recorded.`);
    return true;
  }

  function sendMessage(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setThreads((items) => items.map((thread) => thread.id === activeChatId ? { ...thread, unread: 0, updated: time, messages: [...thread.messages, { id: Date.now(), from: 'pharmacist', text: draft.trim(), time }] } : thread));
    setDraft('');
  }

  function openNote(patient) {
    setSelectedPatient(patient);
    setNoteDraft('');
    setNoteType('Inquiry summary');
    setShowModal(true);
  }

  function saveNote() {
    if (!selectedPatient || !noteDraft.trim()) return;
    const note = `${noteType}: ${noteDraft.trim()}`;
    const noteDate = new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    setPatients((items) => items.some((patient) => patient.id === selectedPatient.id)
      ? items.map((patient) => patient.id === selectedPatient.id ? { ...patient, lastNote: note, noteDate } : patient)
      : [{ ...selectedPatient, lastNote: note, noteDate }, ...items]);
    setShowModal(false);
    setSelectedPatient(null);
    setNoteDraft('');
  }

  function openInquiry(patient) {
    const existing = threads.find((thread) => thread.patient === patient.id);
    if (existing) {
      setActiveChatId(existing.id);
    } else {
      const newId = `INQ-${patient.id}`;
      setThreads((items) => [{
        id: newId,
        patient: patient.id,
        subject: 'Medication follow-up inquiry',
        medicine: patient.regimen,
        unread: 0,
        updated: 'Now',
        priority: patient.priority,
        tokens: patient.tokens,
        messages: [],
      }, ...items]);
      setActiveChatId(newId);
    }
    selectTab('inquiries');
  }

  function saveSettings() {
    setSettingsSaved('Preferences saved for this frontend session.');
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className={`phd-shell${settings.darkMode ? ' is-dark-mode' : ''}${settings.largeText ? ' is-large-text' : ''}${settings.highContrast ? ' is-high-contrast' : ''}${settings.comfortableDensity ? '' : ' is-compact-density'}${settings.reduceMotion ? ' is-reduced-motion' : ''}`}>
      <button aria-label="Open pharmacist navigation" className="phd-mobile-menu" onClick={() => setSidebarOpen(true)} type="button"><Icon name="menu" /></button>
      {sidebarOpen && <button aria-label="Close navigation overlay" className="phd-sidebar-overlay" onClick={() => setSidebarOpen(false)} type="button" />}
      <aside className={`phd-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="phd-brand"><span><img alt="PharMate" src={pharmateLogo} /></span><div><strong>PharMate</strong><small>Clinical Portal</small></div></div>
        <div className="phd-nav-label">Clinical workspace</div>
        <nav aria-label="Pharmacist dashboard modules">
          {NAV_ITEMS.map((item) => <button aria-current={activeTab === item.id ? 'page' : undefined} className={activeTab === item.id ? 'active' : ''} key={item.id} onClick={() => selectTab(item.id)} type="button"><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'validation' && metrics.pendingRx > 0 && <b>{metrics.pendingRx}</b>}</button>)}
        </nav>
        <div className="phd-sidebar__footer">
          <span className="phd-profile-avatar">{pharmacistName.slice(0, 2).toUpperCase()}</span>
          <div><strong>{pharmacistName}</strong><small>{licenseNumber}</small><em><i /> {settings.status}</em></div>
          <button aria-label="Log out" onClick={handleLogout} type="button"><Icon name="logout" size={18} /></button>
        </div>
      </aside>

      <main className="phd-main">
        <header className="phd-topbar">
          <div><span className="phd-eyebrow">PharMate pharmacist workstation</span><h1>{title}</h1><p>{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
          <div className="phd-topbar__status"><span><i /> Clinical systems operational</span><button aria-label="View alerts" onClick={() => selectTab('overview')} type="button"><Icon name="alert" /><b>{metrics.missed}</b></button></div>
        </header>
        <div className="phd-workstation">
          {activeTab === 'overview' && <Overview metrics={metrics} onNavigate={selectTab} pharmacistName={pharmacistName} />}
          {activeTab === 'validation' && <PrescriptionValidation feedback={decisionFeedback} onDecision={decidePrescription} prescriptions={prescriptions} reviewLogs={reviewLogs} selectedId={selectedPrescriptionId} setReviewLogs={setReviewLogs} setSelectedId={setSelectedPrescriptionId} />}
          {activeTab === 'inquiries' && <Consultation activeChatId={activeChatId} draft={draft} onAddNote={openNote} onSend={sendMessage} patients={patients} setActiveChatId={setActiveChatId} setDraft={setDraft} threads={threads} />}
          {activeTab === 'patients' && <PatientRegistry onAddNote={openNote} onOpenInquiry={openInquiry} patients={patients} search={patientSearch} selectedId={selectedPatientId} setSearch={setPatientSearch} setSelectedId={setSelectedPatientId} />}
          {activeTab === 'adherence' && <AdherenceTracking />}
          {activeTab === 'settings' && <Settings onSave={saveSettings} saved={settingsSaved} setSettings={setSettings} settings={settings} />}
        </div>
      </main>
      {showModal && <NoteDrawer note={noteDraft} noteType={noteType} onClose={() => setShowModal(false)} onSave={saveNote} patient={selectedPatient} setNote={setNoteDraft} setNoteType={setNoteType} />}
    </div>
  );
}
