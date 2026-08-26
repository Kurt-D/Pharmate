import {
  Activity,
  AlertTriangle,
  BellRing,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Link2,
  Moon,
  Package,
  Plus,
  ShieldCheck,
  Sunrise,
  SunMedium,
  Sunset,
  Volume2,
} from 'lucide-react';
import CaregiverRefillAlert from './CaregiverRefillAlert.jsx';

const PERIOD_ICONS = { morning: Sunrise, afternoon: SunMedium, evening: Sunset, night: Moon };

function StatusBadge({ dose }) {
  const variants = {
    taken: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    upcoming: 'border-amber-200 bg-amber-50 text-amber-700',
    overdue: 'border-rose-200 bg-rose-50 text-rose-700',
  };
  const Icon = dose.status === 'taken' ? CheckCircle2 : Clock3;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${variants[dose.status] || variants.upcoming}`}
    >
      <Icon className="h-4 w-4 stroke-[2.2]" />
      {dose.statusText}
    </span>
  );
}

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
  selectedCode,
  onSelectPatient,
  onAddPatient,
  timeline,
  previewMode,
  onVoiceReminder,
  onSnooze,
  snoozedUntil,
  refillAlert,
  onOrderRefill,
  patientLabel,
  onNavigate,
}) {
  const completed = timeline.filter((dose) => dose.status === 'taken').length;
  const upcoming = timeline.filter((dose) => dose.status === 'upcoming').length;
  const overdue = timeline.filter((dose) => dose.status === 'overdue').length;
  const adherence = timeline.length ? Math.round((completed / timeline.length) * 100) : 0;
  const nextDue = timeline.find((dose) => dose.status === 'upcoming' || dose.status === 'overdue');
  const urgentDose =
    timeline.find((dose) => dose.status === 'overdue') ||
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
        <section className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-blue-100 bg-blue-50 text-blue-600">
            <Link2 className="h-9 w-9 stroke-[2]" />
          </span>
          <h2 className="mb-0 mt-4 text-xl font-bold tracking-tight text-slate-900">
            No linked patient yet
          </h2>
          <p className="mx-auto mb-0 mt-2 max-w-xs text-sm font-medium leading-6 text-slate-600">
            Ask the patient for their secure 6-character code, then connect their account here.
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
          <span className="cg-home-hero__mark"><ShieldCheck className="h-7 w-7" /></span>
        </div>
        <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
          Keep {patientLabel || 'your linked patient'} on track today.
        </p>
        <span className={`cg-live-status ${previewMode ? 'is-preview' : 'is-live'}`}><Activity className="h-4 w-4" />{previewMode ? 'Preview information' : 'Live patient monitoring'}</span>
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
                  Dose Due Now
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
              type="button"
            >
              <Volume2 className="h-5 w-5 stroke-[2.2]" />
              Send Voice Reminder
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

      <section
        aria-labelledby="patient-adherence-summary"
        className="cg-adherence-card rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              className="m-0 text-lg font-bold tracking-tight text-slate-900"
              id="patient-adherence-summary"
            >
              Today’s care summary
            </h2>
            <p className="mb-0 mt-1 text-sm font-medium text-slate-600">
              Today’s scheduled medicines
            </p>
          </div>
          <Activity className="h-6 w-6 shrink-0 text-blue-600" />
        </div>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <p className="m-0 text-sm font-semibold text-slate-600">Doses completed</p>
            <p className="mb-0 mt-1 text-2xl font-bold tracking-tight text-slate-900">
              <span className="text-blue-600">{completed}</span>/{timeline.length || 0}
            </p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">
            {adherence}% Adherence
          </span>
        </div>
        <div
          aria-label={`${adherence}% of doses completed`}
          aria-valuemax="100"
          aria-valuemin="0"
          aria-valuenow={adherence}
          className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
        >
          <span
            className="block h-full rounded-full bg-blue-600 transition-[width] duration-500"
            style={{ width: `${adherence}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <div className="flex min-h-[82px] flex-col items-center justify-center px-2 py-3 text-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <strong className="mt-1 text-lg text-emerald-700">{completed}</strong>
            <span className="text-xs font-semibold text-slate-600">Taken</span>
          </div>
          <div className="flex min-h-[82px] flex-col items-center justify-center border-x border-slate-200 px-2 py-3 text-center">
            <Clock3 className="h-5 w-5 text-amber-600" />
            <strong className="mt-1 text-lg text-amber-700">{upcoming}</strong>
            <span className="text-xs font-semibold text-slate-600">Upcoming</span>
          </div>
          <div className="flex min-h-[82px] flex-col items-center justify-center px-2 py-3 text-center">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            <strong className="mt-1 text-lg text-rose-700">{overdue}</strong>
            <span className="text-xs font-semibold text-slate-600">Overdue</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[.98] disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!nextDue}
            onClick={() => onVoiceReminder(nextDue)}
            type="button"
          >
            <Volume2 className="h-5 w-5 stroke-[2.2]" />
            Send Voice Reminder
          </button>
          <button
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[.98] disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={!nextDue}
            onClick={() => onSnooze(nextDue)}
            type="button"
          >
            <BellOff className="h-5 w-5 stroke-[2.2]" />
            Snooze 15m
          </button>
        </div>
        {snoozedUntil && (
          <p className="mb-0 mt-3 rounded-lg bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-600">
            Alerts snoozed until{' '}
            {new Date(snoozedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
          </p>
        )}
      </section>

      <section className="cg-timeline-card rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold tracking-tight text-slate-900">
              Today’s Dose Checklist
            </h2>
            <p className="mb-0 mt-1 text-sm font-medium text-slate-600">
              Chronological schedule for today
            </p>
          </div>
          <span className="cg-checklist-icon"><ClipboardCheck className="h-6 w-6" /></span>
        </div>
        <div className="relative mt-4 grid gap-3 before:absolute before:bottom-5 before:left-[19px] before:top-5 before:w-px before:bg-slate-200">
          {timeline.length ? (
            timeline.map((dose) => {
              const PeriodIcon = PERIOD_ICONS[dose.period] || SunMedium;
              const overdue = dose.status === 'overdue';
              return (
                <article
                  className={`relative grid grid-cols-[40px_minmax(0,1fr)] gap-3 rounded-2xl border p-3 ${overdue ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-slate-50'}`}
                  key={dose.id}
                >
                  <span
                    className={`z-10 grid h-10 w-10 place-items-center rounded-xl border bg-white ${overdue ? 'border-rose-200 text-rose-600' : 'border-blue-100 text-blue-600'}`}
                  >
                    <PeriodIcon className="h-5 w-5 stroke-[2.2]" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="m-0 text-xs font-bold uppercase tracking-wide text-slate-500">
                          {dose.period} • {dose.time}
                        </p>
                        <h3 className="mb-0 mt-1 truncate text-base font-bold text-slate-900">
                          {dose.medicine}
                        </h3>
                      </div>
                      <StatusBadge dose={dose} />
                    </div>
                    <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
                      {dose.instructions}
                    </p>
                    {overdue && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700"
                          onClick={() => onVoiceReminder(dose)}
                          type="button"
                        >
                          <Volume2 className="h-4 w-4" />
                          Trigger Voice Reminder
                        </button>
                        <button
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          onClick={() => onSnooze(dose)}
                          type="button"
                        >
                          <BellOff className="h-4 w-4" />
                          Snooze 15m
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
              <p className="m-0 text-sm font-semibold text-slate-700">
                No medicine schedule for today.
              </p>
            </div>
          )}
        </div>
      </section>

      {refillAlert && (
        <section className="cg-refill-section">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="m-0 text-lg font-bold tracking-tight text-slate-900">Stock attention</h2>
          </div>
          <CaregiverRefillAlert item={refillAlert} onOrderRefill={onOrderRefill} />
        </section>
      )}
      <section className="cg-pharmacy-support">
        <span><ShieldCheck className="h-6 w-6" /></span>
        <div><small>PHARMATE SUPPORT</small><h2>Medication care with pharmacist safeguards</h2><p>Prescription refills and medicine concerns remain pharmacist-reviewed for patient safety.</p></div>
        <button onClick={() => onNavigate('medication')} type="button"><Package className="h-4 w-4" /> View medicine care</button>
      </section>
    </main>
  );
}
