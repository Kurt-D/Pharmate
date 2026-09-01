import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Clock3, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAccessibility } from '../../context/AccessibilityContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { scheduleCaregiverDoseAlerts } from '../../lib/notifications.js';
import { useRealtime } from '../../hooks/useRealtime.js';
import CaregiverDashboard from './CaregiverDashboard.jsx';
import CaregiverNavbar from './CaregiverNavbar.jsx';
import CaregiverRefills from './CaregiverRefills.jsx';
import CaregiverSettings from './CaregiverSettings.jsx';
import CaregiverPatientInfo from './CaregiverPatientInfo.jsx';
import CaregiverOrders from './CaregiverOrders.jsx';
import LinkPatientModal from './LinkPatientModal.jsx';
import VoiceReminderModal from './VoiceReminderModal.jsx';
import ElderlyTourGuide from '../../components/ElderlyTourGuide.jsx';
import { CAREGIVER_ELDERLY_TOUR_STEPS } from '../../config/elderlyTourSteps.js';
import '../../styles/caregiver-portal.css';
import '../../styles/elderly-tour.css';

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
        scheduledTime: Number.isNaN(scheduled.getTime()) ? null : scheduled.toISOString(),
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
  const [pendingLinks, setPendingLinks] = useState([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [medications, setMedications] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [orders, setOrders] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [voiceDose, setVoiceDose] = useState(null);
  const [snoozedUntil, setSnoozedUntil] = useState(null);
  const [toast, setToast] = useState(null);
  const [caregiverNotifications, setCaregiverNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(
    () => localStorage.getItem('pm_caregiver_elderly_tour') !== 'complete'
  );

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
      const [patientResult, profileResult, alertResult, pendingResult] = await Promise.allSettled([
        api('/api/caregiver/patients'),
        api('/api/caregiver/profile'),
        api('/api/caregiver/alerts'),
        api('/api/caregiver/link-requests'),
      ]);
      const linked = patientResult.status === 'fulfilled' ? patientResult.value.data : [];
      setPatients(linked.map((patient) => ({ ...patient, displayLabel: patientLabel(patient) })));
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value.data);
      if (alertResult.status === 'fulfilled') setCaregiverNotifications(alertResult.value.data);
      setPendingLinks(pendingResult.status === 'fulfilled' ? pendingResult.value.data : []);
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
    setTimeline(liveTimeline);
    setPreviewMode(false);
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);
  useEffect(() => {
    loadPatient(selectedCode);
  }, [selectedCode, loadPatient]);

  const realtimeStatus = useRealtime((event, payload) => {
    const patientEvents = new Set([
      'patient-activity',
      'DOSE_STATUS_CHANGED',
      'MEDICATION_CREATED',
      'MEDICATION_UPDATED',
      'MEDICATION_STOPPED',
      'SCHEDULE_CONFIRMED',
      'ORDER_STATUS_CHANGED',
      'PRESCRIPTION_STATUS_CHANGED',
    ]);
    if (event === 'CAREGIVER_LINK_UPDATED') {
      loadBase();
      if (selectedCode) loadPatient(selectedCode);
      return;
    }
    if (!patientEvents.has(event)) return;
    if (!selectedCode || !payload?.patientCode || payload.patientCode === selectedCode) {
      loadPatient(selectedCode);
    }
    loadBase();
  });

  const stockAlerts = useMemo(() => [], []);
  const selectedPatient = patients.find((patient) => patient.patient_code === selectedCode);

  useEffect(() => {
    if (!selectedCode || previewMode) return;
    scheduleCaregiverDoseAlerts(timeline, selectedPatient?.displayLabel || 'Linked patient');
  }, [previewMode, selectedCode, selectedPatient?.displayLabel, timeline]);

  async function connectPatient({ code, relationship }) {
    await api('/api/caregiver/link', { method: 'POST', body: { code, relationship } });
    showToast('Link request sent. Monitoring begins after the patient approves it.');
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

  async function updatePatientMedication(medicationId, body) {
    await api(`/api/caregiver/patients/${selectedCode}/medications/${medicationId}`, {
      method: 'PATCH',
      body,
    });
    showToast('Medication changes were saved for the patient.');
    await loadPatient(selectedCode);
  }

  async function stopPatientMedication(medication) {
    await api(`/api/caregiver/patients/${selectedCode}/medications/${medication.id}/stop`, {
      method: 'POST',
      body: { expected_updated_at: medication.updated_at },
    });
    showToast('Medication was removed from the active schedule.');
    await loadPatient(selectedCode);
  }

  const searchCaregiverDrugs = useCallback(async (query) => {
    const response = await api(`/api/caregiver/drugs?q=${encodeURIComponent(query)}&limit=8`);
    return response.data;
  }, []);

  async function addPatientMedicine(body) {
    await api(`/api/caregiver/patients/${selectedCode}/medications`, {
      method: 'POST',
      body,
    });
    showToast('Medicine added. You can now create a safe suggested schedule.');
    await loadPatient(selectedCode);
  }

  async function createSuggestedSchedule() {
    await api(`/api/caregiver/patients/${selectedCode}/schedule/suggested`, { method: 'POST' });
    showToast('The patient’s suggested medicine schedule is now active.');
    await loadPatient(selectedCode);
  }

  async function readCaregiverNotifications() {
    setNotificationsOpen(true);
    if (!caregiverNotifications.some((item) => item.status === 'unseen')) return;
    try {
      await api('/api/caregiver/alerts/read-all', { method: 'PATCH' });
      setCaregiverNotifications((items) => items.map((item) => ({ ...item, status: 'resolved' })));
    } catch {
      /* Keep the drawer usable if read-state syncing is temporarily unavailable. */
    }
  }

  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  const accessibilityClasses = [
    'cg-shell relative mx-auto min-h-screen max-w-md bg-slate-50 text-slate-900 shadow-md',
    'pm-phone',
    accessibility.highContrast && 'pm-a11y-high-contrast',
    accessibility.warmTint && 'pm-a11y-warm-tint',
    accessibility.darkMode && 'pm-a11y-dark-mode',
    accessibility.boldText && 'pm-a11y-bold-text',
    accessibility.largeTouch && 'pm-a11y-large-touch',
  ]
    .filter(Boolean)
    .join(' ');

  const changePage = useCallback(
    (page) => {
      setActivePage(page);
      navigate(`/caregiver/${page}`);
      window.scrollTo({ top: 0, behavior: accessibility.reduceMotion ? 'auto' : 'smooth' });
    },
    [accessibility.reduceMotion, navigate]
  );

  const handleTourStepChange = useCallback(
    (step) => {
      const page = pageFromPath(step.path);
      if (page !== activePage) changePage(page);
    },
    [activePage, changePage]
  );

  function closeTour() {
    localStorage.setItem('pm_caregiver_elderly_tour', 'complete');
    setTourOpen(false);
  }

  return (
    <div className="cg-portal min-h-screen bg-slate-50 font-caregiver">
      <div className={accessibilityClasses}>
        <div className="cg-scroll-area">
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
                  pendingLinks={pendingLinks}
                  selectedCode={selectedCode}
                  onSelectPatient={setSelectedCode}
                  onAddPatient={() => setLinkOpen(true)}
                  timeline={timeline}
                  previewMode={previewMode}
                  patientLabel={selectedPatient?.displayLabel}
                  notificationCount={
                    caregiverNotifications.filter((item) => item.status === 'unseen').length
                  }
                  onOpenNotifications={readCaregiverNotifications}
                  realtimeStatus={realtimeStatus}
                  onVoiceReminder={(dose) =>
                    setVoiceDose(dose || timeline.find((item) => item.status !== 'taken') || null)
                  }
                  onSnooze={snoozeAlert}
                  snoozedUntil={snoozedUntil}
                  stockAlerts={stockAlerts}
                  onNavigate={changePage}
                />
              )}
              {activePage === 'medication' && (
                <CaregiverRefills
                  medications={medications}
                  stockAlerts={stockAlerts}
                  orders={orders}
                  previewMode={previewMode}
                  timeline={timeline}
                  canManageMedications={Boolean(selectedPatient?.can_manage_medications)}
                  onUpdateMedication={updatePatientMedication}
                  onStopMedication={stopPatientMedication}
                  onSearchDrugs={searchCaregiverDrugs}
                  onAddMedicine={addPatientMedicine}
                  onCreateSuggestedSchedule={createSuggestedSchedule}
                  onSendReminder={(dose) => setVoiceDose(dose)}
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
            </>
          )}
        </div>
        {!loading && <CaregiverNavbar active={activePage} onChange={changePage} />}
      </div>
      <ElderlyTourGuide
        autoNarrate={Boolean(accessibility.ttsEnabled)}
        onClose={closeTour}
        onStepChange={handleTourStepChange}
        open={tourOpen}
        steps={CAREGIVER_ELDERLY_TOUR_STEPS}
      />
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
      {notificationsOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setNotificationsOpen(false)
          }
        >
          <section
            aria-labelledby="caregiver-notifications-title"
            aria-modal="true"
            className="max-h-[78vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-xs font-bold uppercase tracking-wide text-blue-700">
                  Linked patient updates
                </p>
                <h2
                  className="mb-0 mt-1 text-xl font-bold text-slate-900"
                  id="caregiver-notifications-title"
                >
                  Notifications
                </h2>
              </div>
              <button
                aria-label="Close notifications"
                className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-700"
                onClick={() => setNotificationsOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {caregiverNotifications.length ? (
                caregiverNotifications.slice(0, 20).map((item) => (
                  <article
                    className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50 p-3"
                    key={item.id}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-rose-600">
                      <AlertCircle className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <strong className="block text-sm text-slate-900">Missed medicine dose</strong>
                      <p className="mb-0 mt-1 text-xs font-medium leading-5 text-slate-700">
                        {item.patient_code} missed {item.drug_name || 'a scheduled medicine'}.
                      </p>
                      <small className="mt-1 inline-flex items-center gap-1 font-medium text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        {new Date(item.created_at).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </small>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center">
                  <Bell className="mx-auto h-8 w-8 text-slate-400" />
                  <strong className="mt-3 block text-sm text-slate-900">
                    No notifications yet
                  </strong>
                  <p className="mb-0 mt-1 text-xs font-medium text-slate-600">
                    Dose and patient updates will appear here.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
