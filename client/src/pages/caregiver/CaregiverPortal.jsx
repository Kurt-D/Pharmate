import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { apiUrl } from '../../config.js';
import { useAccessibility } from '../../context/AccessibilityContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import CaregiverDashboard from './CaregiverDashboard.jsx';
import CaregiverNavbar from './CaregiverNavbar.jsx';
import CaregiverRefills from './CaregiverRefills.jsx';
import CaregiverSettings from './CaregiverSettings.jsx';
import CaregiverPatientInfo from './CaregiverPatientInfo.jsx';
import CaregiverOrders from './CaregiverOrders.jsx';
import LinkPatientModal from './LinkPatientModal.jsx';
import VoiceReminderModal from './VoiceReminderModal.jsx';
import RefillOrderSheet from './RefillOrderSheet.jsx';

const MOCK_TIMELINE = [
  {
    id: 'preview-1',
    period: 'morning',
    time: '8:00 AM',
    medicine: 'Amlodipine 5 mg',
    instructions: '1 tablet after breakfast',
    status: 'taken',
    statusText: 'Taken at 8:05 AM',
  },
  {
    id: 'preview-2',
    period: 'afternoon',
    time: '1:00 PM',
    medicine: 'Metformin 500 mg',
    instructions: '1 tablet after lunch',
    status: 'upcoming',
    statusText: 'Due in 45m',
  },
  {
    id: 'preview-3',
    period: 'evening',
    time: '6:00 PM',
    medicine: 'Metformin 500 mg',
    instructions: '1 tablet after dinner',
    status: 'overdue',
    statusText: 'Overdue by 30m',
  },
  {
    id: 'preview-4',
    period: 'night',
    time: '9:00 PM',
    medicine: 'Atorvastatin 20 mg',
    instructions: '1 tablet before bedtime',
    status: 'upcoming',
    statusText: 'Due tonight',
  },
];

const MOCK_STOCK = [
  {
    id: 'preview-stock-1',
    name: 'Metformin 500 mg',
    daysRemaining: 4,
    tabletsLeft: 8,
    isRx: true,
    medicationId: null,
  },
];

const CAREGIVER_PAGES = new Set(['home', 'medication', 'patient-info', 'orders', 'profile']);

function pageFromPath(pathname) {
  const page = pathname.split('/').filter(Boolean)[1] || 'home';
  return CAREGIVER_PAGES.has(page) ? page : 'home';
}

function statusForDose(dose) {
  if (['taken', 'taken_late'].includes(dose.status))
    return {
      status: 'taken',
      statusText: dose.logged_at
        ? `Taken at ${new Date(dose.logged_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : 'Taken',
    };
  const scheduled = new Date(dose.scheduled_time);
  const difference = scheduled.getTime() - Date.now();
  if (difference < 0)
    return {
      status: 'overdue',
      statusText: `Overdue by ${Math.max(1, Math.round(Math.abs(difference) / 60000))}m`,
    };
  return {
    status: 'upcoming',
    statusText:
      difference < 3600000 ? `Due in ${Math.max(1, Math.round(difference / 60000))}m` : 'Upcoming',
  };
}

function periodFor(date) {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 20) return 'evening';
  return 'night';
}

function normalizeTimeline(doses) {
  return (Array.isArray(doses) ? doses : [])
    .map((dose) => {
      const scheduled = new Date(dose.scheduled_time);
      return {
        id: dose.schedule_id || dose.id,
        medicine: dose.drug_name || dose.drug_name_raw || 'Medicine',
        instructions:
          dose.dosage_instruction || dose.frequency || 'Follow the saved medicine instructions',
        time: Number.isNaN(scheduled.getTime())
          ? 'Scheduled'
          : scheduled.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        period: Number.isNaN(scheduled.getTime()) ? 'morning' : periodFor(scheduled),
        ...statusForDose(dose),
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

function patientLabel(patient) {
  const relationship =
    patient.relationship && patient.relationship !== 'Caregiver' ? patient.relationship : 'Patient';
  return `${relationship} • ${patient.patient_code}`;
}

export default function CaregiverPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { preferences: accessibility, updatePreference } = useAccessibility();
  const [activePage, setActivePage] = useState(() => pageFromPath(location.pathname));
  const [patients, setPatients] = useState([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [medications, setMedications] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [orders, setOrders] = useState([]);
  const [branches, setBranches] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [voiceDose, setVoiceDose] = useState(null);
  const [refillItem, setRefillItem] = useState(null);
  const [snoozedUntil, setSnoozedUntil] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    setActivePage(pageFromPath(location.pathname));
  }, [location.pathname]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [patientResult, branchResult, profileResult] = await Promise.allSettled([
        api('/api/caregiver/patients'),
        api('/api/directory/branches'),
        api('/api/caregiver/profile'),
      ]);
      const linked = patientResult.status === 'fulfilled' ? patientResult.value.data : [];
      setPatients(linked.map((patient) => ({ ...patient, displayLabel: patientLabel(patient) })));
      setBranches(branchResult.status === 'fulfilled' ? branchResult.value.data : []);
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value.data);
      setSelectedCode((current) => current || linked[0]?.patient_code || '');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadPatient = useCallback(async (code) => {
    if (!code) {
      setMedications([]);
      setTimeline([]);
      setOrders([]);
      setPreviewMode(false);
      return;
    }
    const [medicationResult, orderResult, timelineResult] = await Promise.allSettled([
      api(`/api/caregiver/patients/${code}/medications`),
      api(`/api/caregiver/patients/${code}/orders`),
      api(`/api/caregiver/patients/${code}/today`),
    ]);
    const medicines = medicationResult.status === 'fulfilled' ? medicationResult.value.data : [];
    const orderPayload =
      orderResult.status === 'fulfilled' ? orderResult.value.data : { refills: [], deliveries: [] };
    const liveTimeline =
      timelineResult.status === 'fulfilled' ? normalizeTimeline(timelineResult.value.data) : [];
    setMedications(medicines);
    setOrders(
      [
        ...(orderPayload.refills || []).map((item) => ({ ...item, kind: 'Refill' })),
        ...(orderPayload.deliveries || []).map((item) => ({ ...item, kind: 'Delivery' })),
      ].sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at))
    );
    setTimeline(liveTimeline.length ? liveTimeline : MOCK_TIMELINE);
    setPreviewMode(!liveTimeline.length);
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);
  useEffect(() => {
    loadPatient(selectedCode);
  }, [selectedCode, loadPatient]);

  useEffect(() => {
    const token = sessionStorage.getItem('pm_token');
    if (!token) return undefined;
    const controller = new AbortController();
    async function subscribe() {
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
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const eventBlock of events) {
          const event = eventBlock.match(/^event:\s*(.+)$/m)?.[1];
          if (event === 'patient-linked') await loadBase();
          if (event === 'adherence-updated') await loadPatient(selectedCode);
        }
      }
    }
    subscribe().catch((error) => {
      if (error.name !== 'AbortError')
        showToast('Live monitoring paused. Refresh to reconnect.', 'error');
    });
    return () => controller.abort();
  }, [loadBase, loadPatient, selectedCode, showToast]);

  const stockAlerts = useMemo(
    () =>
      previewMode
        ? MOCK_STOCK.map((item) => ({
            ...item,
            medicationId:
              medications.find((medicine) =>
                medicine.drug_name_raw?.toLowerCase().includes('metformin')
              )?.id ||
              medications[0]?.id ||
              null,
          }))
        : [],
    [previewMode, medications]
  );
  const selectedPatient = patients.find((patient) => patient.patient_code === selectedCode);

  async function connectPatient({ code, relationship }) {
    await api('/api/caregiver/link', { method: 'POST', body: { code, relationship } });
    showToast('Patient linked successfully. Monitoring is now available.');
    await loadBase();
    navigate('/caregiver/home');
  }

  async function sendVoiceAlert({ message, medicine }) {
    const response = await api(`/api/caregiver/patients/${selectedCode}/notify`, {
      method: 'POST',
      body: { drug_name: medicine || 'scheduled medicine', voice_message: message },
    });
    if (!response.data.notified) throw new Error('The patient has reminders turned off.');
    const event = {
      id: crypto.randomUUID(),
      message,
      medicine: medicine || 'scheduled medicine',
      caregiverName: profile?.display_name || 'your caregiver',
      patientCode: selectedCode,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem('pm_caregiver_voice_alert', JSON.stringify(event));
    window.dispatchEvent(new CustomEvent('pm-caregiver-voice-alert', { detail: event }));
    try {
      const channel = new BroadcastChannel('pharmate-voice-alerts');
      channel.postMessage(event);
      channel.close();
    } catch {
      /* Browser fallback uses storage events. */
    }
    showToast(
      `Voice alert dispatched to ${selectedPatient?.displayLabel || 'the patient'}’s homepage.`
    );
  }

  function snoozeAlert() {
    const until = new Date(Date.now() + 15 * 60000).toISOString();
    setSnoozedUntil(until);
    showToast('Caregiver alert window snoozed for 15 minutes.');
    window.setTimeout(() => setSnoozedUntil(null), 15 * 60000);
  }

  async function submitRefill({ item, branchId }) {
    if (!item.medicationId)
      throw new Error('A live medicine record is required before requesting a refill.');
    await api(`/api/caregiver/patients/${selectedCode}/refills`, {
      method: 'POST',
      body: { medication_id: item.medicationId, branch_id: branchId },
    });
    showToast(`Refill request for ${item.name} submitted.`);
    await loadPatient(selectedCode);
  }

  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  const accessibilityClasses = [
    'relative mx-auto min-h-screen max-w-md bg-slate-50 text-slate-900 shadow-md',
    'pm-phone',
    accessibility.highContrast && 'pm-a11y-high-contrast',
    accessibility.warmTint && 'pm-a11y-warm-tint',
    accessibility.darkMode && 'pm-a11y-dark-mode',
    accessibility.boldText && 'pm-a11y-bold-text',
    accessibility.largeTouch && 'pm-a11y-large-touch',
  ]
    .filter(Boolean)
    .join(' ');

  function changePage(page) {
    setActivePage(page);
    navigate(`/caregiver/${page}`);
    window.scrollTo({ top: 0, behavior: accessibility.reduceMotion ? 'auto' : 'smooth' });
  }

  return (
    <div className="cg-portal min-h-screen bg-slate-200 font-caregiver">
      <div className={accessibilityClasses}>
        {loading && !patients.length ? (
          <div className="grid min-h-[70vh] place-items-center px-4">
            <div className="text-center">
              <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
              <p className="mb-0 mt-3 text-sm font-semibold text-slate-600">
                Loading caregiver portal…
              </p>
            </div>
          </div>
        ) : (
          <>
            {activePage === 'home' && (
              <CaregiverDashboard
                patients={patients}
                selectedCode={selectedCode}
                onSelectPatient={setSelectedCode}
                onAddPatient={() => setLinkOpen(true)}
                timeline={timeline}
                previewMode={previewMode}
                patientLabel={selectedPatient?.displayLabel}
                onVoiceReminder={(dose) =>
                  setVoiceDose(dose || timeline.find((item) => item.status !== 'taken') || null)
                }
                onSnooze={snoozeAlert}
                snoozedUntil={snoozedUntil}
                refillAlert={stockAlerts[0]}
                onOrderRefill={setRefillItem}
              />
            )}
            {activePage === 'medication' && (
              <CaregiverRefills
                medications={medications}
                stockAlerts={stockAlerts}
                orders={orders}
                previewMode={previewMode}
                onOrderRefill={setRefillItem}
              />
            )}
            {activePage === 'patient-info' && (
              <CaregiverPatientInfo
                patient={selectedPatient}
                onAddPatient={() => setLinkOpen(true)}
              />
            )}
            {activePage === 'orders' && <CaregiverOrders orders={orders} />}
            {activePage === 'profile' && (
              <CaregiverSettings
                profile={profile}
                patients={patients}
                language={language}
                onLanguage={setLanguage}
                accessibility={accessibility}
                onAccessibility={updatePreference}
                onAddPatient={() => setLinkOpen(true)}
                onSelectPatient={(code) => {
                  setSelectedCode(code);
                  changePage('home');
                }}
                onLogout={signOut}
              />
            )}
            <CaregiverNavbar active={activePage} onChange={changePage} />
          </>
        )}
      </div>
      {toast && (
        <div
          className={`fixed left-1/2 top-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-start gap-3 rounded-2xl border p-3 shadow-xl ${toast.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
          role={toast.type === 'error' ? 'alert' : 'status'}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="h-5 w-5 shrink-0" />
          ) : (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          )}
          <span className="flex-1 text-sm font-semibold leading-5">{toast.message}</span>
          <button
            aria-label="Dismiss message"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/60"
            onClick={() => setToast(null)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <LinkPatientModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        onConnect={connectPatient}
      />
      <VoiceReminderModal
        open={Boolean(voiceDose)}
        patientLabel={selectedPatient?.displayLabel || 'the patient'}
        medicine={voiceDose?.medicine}
        onClose={() => setVoiceDose(null)}
        onSend={sendVoiceAlert}
      />
      <RefillOrderSheet
        item={refillItem}
        branches={branches}
        onClose={() => setRefillItem(null)}
        onSubmit={submitRefill}
      />
    </div>
  );
}
