import {
  BellRing,
  Languages,
  Link2,
  LogOut,
  Moon,
  ShieldCheck,
  Touchpad,
  UserRound,
  Volume2,
} from 'lucide-react';

const ACCESSIBILITY_ROWS = [
  ['ttsEnabled', 'Voice read-aloud', 'Hear important medicine alerts.', Volume2],
  ['largeTouch', 'Large touch targets', 'Increase button and control sizes.', Touchpad],
  ['darkMode', 'Dark mode', 'Use a darker low-glare display.', Moon],
  ['enhancedFocus', 'Clear focus indicators', 'Show stronger keyboard focus outlines.', BellRing],
];

export default function CaregiverSettings({
  profile,
  patients,
  language,
  onLanguage,
  onAddPatient,
  onSelectPatient,
  onLogout,
  accessibility,
  onAccessibility,
}) {
  return (
    <main className="grid gap-4 px-4 pb-4 pt-5">
      <header className="cg-page-header">
        <p className="m-0 text-sm font-semibold text-blue-700">Caregiver account</p>
        <h1 className="mb-0 mt-1 text-2xl font-bold tracking-tight text-slate-900">Profile</h1>
        <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
          Manage linked patients, alerts, language, and accessibility.
        </p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 text-white">
            <UserRound className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 truncate text-lg font-bold text-slate-900">
              {profile?.display_name || 'Caregiver'}
            </h2>
            <p className="mb-0 mt-1 truncate text-sm font-medium text-slate-600">
              {profile?.email || 'Caregiver account'}
            </p>
          </div>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold text-slate-900">Linked patients</h2>
            <p className="mb-0 mt-1 text-sm font-medium text-slate-600">
              Authorized monitoring access
            </p>
          </div>
          <button
            className="flex h-12 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            onClick={onAddPatient}
            type="button"
          >
            <Link2 className="h-5 w-5" />
            Add
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {patients.length ? (
            patients.map((patient) => (
              <button
                className="flex min-h-[60px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-blue-300 hover:bg-blue-50"
                key={patient.patient_code}
                onClick={() => onSelectPatient(patient.patient_code)}
                type="button"
              >
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-slate-900">
                    {patient.displayLabel}
                  </strong>
                  <small className="font-medium text-slate-600">
                    Linked{' '}
                    {patient.linked_at
                      ? new Date(patient.linked_at).toLocaleDateString()
                      : 'patient'}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p className="mb-0 rounded-xl bg-slate-50 p-3 text-sm font-medium text-slate-600">
              No linked patients.
            </p>
          )}
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="grid gap-2 text-sm font-semibold text-slate-800">
          <span className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-blue-600" />
            Display language
          </span>
          <select
            className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-3 text-base font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => onLanguage(event.target.value)}
            value={language}
          >
            <option value="en">English</option>
            <option value="fil">Filipino</option>
          </select>
        </label>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="m-0 text-lg font-bold text-slate-900">Alerts and accessibility</h2>
          <p className="mb-0 mt-1 text-sm font-medium text-slate-600">
            These preferences apply across the caregiver portal.
          </p>
        </div>
        <div className="mt-3 divide-y divide-slate-100">
          {ACCESSIBILITY_ROWS.map(([key, title, description, Icon]) => (
            <div className="flex min-h-[68px] items-center gap-3 py-2" key={key}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-slate-900">{title}</strong>
                <small className="font-medium leading-5 text-slate-600">{description}</small>
              </span>
              <button
                aria-label={`${title}: ${accessibility?.[key] ? 'on' : 'off'}`}
                aria-pressed={Boolean(accessibility?.[key])}
                className={`relative h-8 min-h-8 w-14 shrink-0 rounded-full border-0 p-1 transition ${accessibility?.[key] ? 'bg-blue-600' : 'bg-slate-300'}`}
                onClick={() => onAccessibility(key, !accessibility?.[key])}
                type="button"
              >
                <span
                  className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${accessibility?.[key] ? 'translate-x-6' : 'translate-x-0'}`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>
      <button
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-base font-semibold text-rose-700 hover:bg-rose-100"
        onClick={onLogout}
        type="button"
      >
        <LogOut className="h-5 w-5" />
        Log Out
      </button>
    </main>
  );
}
