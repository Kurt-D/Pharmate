import { useMemo, useState } from 'react';
import {
  Activity,
  BellRing,
  BellOff,
  ChevronDown,
  ChevronUp,
  Clock3,
  Link2,
  Package,
  Plus,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import CaregiverCareSummary from './CaregiverCareSummary.jsx';
import CaregiverRefillAlert from './CaregiverRefillAlert.jsx';

function PatientSwitcher({ patients, selectedCode, onSelect, onAdd }) {
  const selected = patients.find((patient) => patient.patient_code === selectedCode) || patients[0];
  return (
    <section className="cg-patient-switcher rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-blue-700">
            Currently monitoring
          </span>
          <span className="relative block">
            <select
              aria-label="Select linked patient"
              className="h-13 min-h-[52px] w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2 pl-3 pr-10 text-base font-bold text-slate-900 outline-none focus:border-[#4C8CE4] focus:ring-4 focus:ring-blue-100"
              onChange={(event) => onSelect(event.target.value)}
              value={selected?.patient_code || ''}
            >
              {patients.map((patient) => (
                <option key={patient.patient_code} value={patient.patient_code}>
                  {patient.displayLabel}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          </span>
        </label>
        <button
          className="mt-5 flex h-[52px] shrink-0 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 active:scale-95"
          onClick={onAdd}
          type="button"
        >
          <Plus className="h-5 w-5 stroke-[2.2]" />
          <span className="hidden min-[380px]:inline">Add</span>
        </button>
      </div>
    </section>
  );
}

export default function CaregiverDashboard({
  patients,
  pendingLinks = [],
  selectedCode,
  onSelectPatient,
  onAddPatient,
  timeline,
  previewMode,
  onVoiceReminder,
  sendingReminder = false,
  onSnooze,
  snoozedUntil,
  stockAlerts = [],
  patientLabel,
  onNavigate,
  notificationCount = 0,
  onOpenNotifications,
  realtimeStatus = 'connecting',
}) {
  const [showAllStock, setShowAllStock] = useState(false);
  const [dismissedStock, setDismissedStock] = useState([]);
  const visibleStockAlerts = useMemo(
    () => stockAlerts.filter((item) => !dismissedStock.includes(item.id)),
    [dismissedStock, stockAlerts]
  );
  const urgentDose =
    timeline.find((dose) => dose.status === 'overdue') ||
    timeline.find((dose) => dose.status === 'due') ||
    timeline.find(
      (dose) =>
        dose.status === 'upcoming' &&
        /due (right now|in ([1-9]|1[0-5])m)/i.test(dose.statusText || '')
    );

  if (!patients.length) {
    return (
      <main className="grid gap-4 px-4 pb-4 pt-5">
        <header>
          <p className="m-0 text-sm font-semibold text-blue-700">Caregiver Portal</p>
          <h1 className="mb-0 mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Patient monitoring
          </h1>
          <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
            Link a patient before medicine activity can be displayed.
          </p>
        </header>
        {pendingLinks.length > 0 && (
          <section
            className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm"
            role="status"
          >
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white text-amber-700 shadow-sm">
              <Clock3 className="h-8 w-8" />
            </span>
            <h2 className="mb-0 mt-4 text-xl font-bold text-slate-900">
              Waiting for patient approval
            </h2>
            <p className="mb-0 mt-2 text-sm font-medium leading-6 text-slate-700">
              Your code was accepted. The patient must open Profile → Caregiver Access and approve
              your request before monitoring begins.
            </p>
            {pendingLinks.map((request) => (
              <div
                className="mt-4 rounded-xl border border-amber-200 bg-white p-3 text-left"
                key={request.id}
              >
                <strong className="block text-sm text-slate-900">
                  Patient {request.patient_code}
                </strong>
                <small className="text-slate-600">{request.relationship} · Approval pending</small>
              </div>
            ))}
          </section>
        )}
        <section className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-blue-100 bg-blue-50 text-blue-600">
            <Link2 className="h-9 w-9 stroke-[2]" />
          </span>
          <h2 className="mb-0 mt-4 text-xl font-bold tracking-tight text-slate-900">
            {pendingLinks.length ? 'Link another patient' : 'No linked patient yet'}
          </h2>
          <p className="mx-auto mb-0 mt-2 max-w-xs text-sm font-medium leading-6 text-slate-600">
            {pendingLinks.length
              ? 'You can wait for approval or enter a code for another patient.'
              : 'Ask the patient for their secure 6-character code, then connect their account here.'}
          </p>
          <button
            className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white transition hover:bg-blue-700 active:scale-[.99]"
            onClick={onAddPatient}
            type="button"
          >
            <Plus className="h-5 w-5" />
            Link a Patient
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="grid gap-4 px-4 pb-4 pt-5">
      <header className="cg-home-hero">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="m-0 text-sm font-semibold">PharMate Family Care</p>
            <h1 className="mb-0 mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Hello, Caregiver
            </h1>
          </div>
          <button
            aria-label={`Open notifications${notificationCount ? `, ${notificationCount} unread` : ''}`}
            className="cg-home-hero__mark relative border-0"
            onClick={onOpenNotifications}
            type="button"
          >
            <BellRing className="h-6 w-6" />
            {notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 grid min-h-[20px] min-w-[20px] place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                {Math.min(99, notificationCount)}
              </span>
            )}
          </button>
        </div>
        <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
          Keep {patientLabel || 'your linked patient'} on track today.
        </p>
        <span className={`cg-live-status ${realtimeStatus === 'live' ? 'is-live' : 'is-preview'}`}>
          <Activity className="h-4 w-4" />
          {realtimeStatus === 'live'
            ? previewMode
              ? 'Live connection · No current schedule'
              : 'Live patient monitoring'
            : realtimeStatus === 'offline'
              ? 'Offline · Showing saved information'
              : 'Connecting live monitoring'}
        </span>
      </header>
      <PatientSwitcher
        patients={patients}
        selectedCode={selectedCode}
        onSelect={onSelectPatient}
        onAdd={onAddPatient}
      />
      {urgentDose && !snoozedUntil && (
        <section
          className="cg-dose-alert overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm"
          aria-labelledby="caregiver-dose-alert-title"
        >
          <div className="flex items-start gap-3 bg-rose-50 p-4">
            <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-700">
              <span
                className="absolute inset-0 animate-ping rounded-full bg-rose-200 opacity-60"
                aria-hidden="true"
              />
              <BellRing className="relative h-6 w-6 stroke-[2.3]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-lg font-bold text-rose-800" id="caregiver-dose-alert-title">
                  {urgentDose.status === 'overdue' ? 'Missed Dose' : 'Dose Due Now'}
                </h2>
                <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-bold text-rose-700">
                  Action needed
                </span>
              </div>
              <p className="mb-0 mt-1 text-sm font-semibold leading-5 text-slate-900">
                {patientLabel || 'Linked patient'} • {urgentDose.medicine}
              </p>
              <p className="mb-0 mt-1 text-sm font-medium leading-5 text-rose-700">
                {urgentDose.statusText} ({urgentDose.time})
              </p>
              <p className="mb-0 mt-1 text-xs font-medium leading-5 text-slate-600">
                {urgentDose.instructions}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            <button
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 active:scale-[.98]"
              onClick={() => onVoiceReminder(urgentDose)}
              disabled={sendingReminder}
              aria-busy={sendingReminder}
              type="button"
            >
              <Volume2 className="h-5 w-5 stroke-[2.2]" />
              {sendingReminder ? 'Sending…' : 'Send reminder'}
            </button>
            <button
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 active:scale-[.98]"
              onClick={() => onSnooze(urgentDose)}
              type="button"
            >
              <BellOff className="h-5 w-5 stroke-[2.2]" />
              Snooze 15 mins
            </button>
          </div>
        </section>
      )}
      {previewMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Preview schedule is shown while live patient data is unavailable.
        </div>
      )}

      <CaregiverCareSummary key={selectedCode} patientCode={selectedCode} refreshKey={timeline} />

      {visibleStockAlerts.length > 0 && (
        <section className="cg-refill-section">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="m-0 text-lg font-bold tracking-tight text-slate-900">Stock attention</h2>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
              {visibleStockAlerts.length}
            </span>
          </div>
          <div className="grid gap-3">
            {(showAllStock ? visibleStockAlerts : visibleStockAlerts.slice(0, 2)).map((item) => (
              <CaregiverRefillAlert
                item={item}
                key={item.id}
                onDismiss={() =>
                  setDismissedStock((current) => [...new Set([...current, item.id])])
                }
              />
            ))}
          </div>
          {visibleStockAlerts.length > 2 && (
            <button
              aria-expanded={showAllStock}
              className="mt-3 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-sm font-bold text-blue-700"
              onClick={() => setShowAllStock((value) => !value)}
              type="button"
            >
              {showAllStock ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
              {showAllStock ? 'Show less' : `See all ${visibleStockAlerts.length} stock alerts`}
            </button>
          )}
        </section>
      )}
      <section className="cg-pharmacy-support">
        <span>
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div>
          <small>PHARMATE SUPPORT</small>
          <h2>Medication care with pharmacist safeguards</h2>
          <p>
            Prescription refills and medicine concerns remain pharmacist-reviewed for patient
            safety.
          </p>
        </div>
        <button onClick={() => onNavigate('medication')} type="button">
          <Package className="h-4 w-4" /> View medicine care
        </button>
      </section>
    </main>
  );
}
