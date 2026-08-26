import { useEffect, useState } from 'react';
import {
  CalendarDays,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  LockKeyhole,
  Package,
  Pencil,
  Pill,
  Plus,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import CaregiverRefillAlert, { RefillEmptyState } from './CaregiverRefillAlert.jsx';

const DOSE_STYLES = {
  upcoming: { title: 'Upcoming doses', color: 'text-amber-700', card: 'border-amber-200 bg-amber-50', badge: 'border-amber-200 bg-white text-amber-700' },
  overdue: { title: 'Missed doses', color: 'text-rose-700', card: 'border-rose-200 bg-rose-50', badge: 'border-rose-200 bg-white text-rose-700' },
  taken: { title: 'Taken doses', color: 'text-emerald-700', card: 'border-emerald-200 bg-emerald-50', badge: 'border-emerald-200 bg-white text-emerald-700' },
};

function DoseSection({ status, doses, onReminder }) {
  const style = DOSE_STYLES[status];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className={`m-0 text-base font-bold ${style.color}`}>{style.title}</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{doses.length}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {doses.length ? doses.slice(0, 3).map((dose) => (
          <article className={`rounded-xl border p-3 ${style.card}`} key={dose.id}>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-blue-600"><Pill className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-slate-900">{dose.medicine}</strong>
                <small className="mt-1 block font-medium leading-5 text-slate-600">{dose.instructions}</small>
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-slate-700"><Clock3 className="h-3.5 w-3.5" />{dose.time}</span>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${style.badge}`}>{status === 'overdue' ? 'Missed' : status === 'taken' ? 'Taken' : 'Upcoming'}</span>
            </div>
            {status !== 'taken' && (
              <button className="mt-3 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-sm font-bold text-blue-700 active:scale-[.99]" onClick={() => onReminder(dose)} type="button"><Send className="h-4 w-4" />Send notification reminder</button>
            )}
          </article>
        )) : <p className="m-0 rounded-xl bg-slate-50 p-4 text-center text-sm font-medium text-slate-600">No {style.title.toLowerCase()} today.</p>}
      </div>
    </section>
  );
}

function DoseCalendar({ timeline, onClose }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="caregiver-calendar-title" aria-modal="true" className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" role="dialog">
        <div className="flex items-start justify-between gap-3"><div><p className="m-0 text-xs font-bold uppercase tracking-wide text-blue-700">Patient schedule</p><h2 className="mb-0 mt-1 text-xl font-bold text-slate-900" id="caregiver-calendar-title">{now.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2></div><button aria-label="Close calendar" className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-700" onClick={onClose} type="button"><X className="h-5 w-5" /></button></div>
        <div className="mt-5 grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-500">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <span key={day}>{day}</span>)}{Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: days }, (_, index) => { const day = index + 1; const today = day === now.getDate(); return <span className={`grid min-h-[42px] place-items-center rounded-full ${today ? 'bg-blue-600 text-white' : 'text-slate-800'}`} key={day}>{day}</span>; })}</div>
        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4"><strong className="text-sm text-slate-900">Today’s doses</strong><div className="mt-2 flex flex-wrap gap-2"><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{timeline.filter((dose) => dose.status === 'upcoming').length} Upcoming</span><span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">{timeline.filter((dose) => dose.status === 'overdue').length} Missed</span><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">{timeline.filter((dose) => dose.status === 'taken').length} Taken</span></div></div>
      </section>
    </div>
  );
}

export default function CaregiverRefills({
  medications,
  stockAlerts,
  orders,
  previewMode,
  timeline = [],
  canManageMedications = false,
  onUpdateMedication,
  onStopMedication,
  onSearchDrugs,
  onAddMedicine,
  onCreateSuggestedSchedule,
  onSendReminder,
}) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ dosage_instruction: '', frequency: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [drugQuery, setDrugQuery] = useState('');
  const [drugResults, setDrugResults] = useState([]);
  const [selectedDrug, setSelectedDrug] = useState(null);
  const [addBusy, setAddBusy] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [addError, setAddError] = useState('');
  const [showAllMedications, setShowAllMedications] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [addDraft, setAddDraft] = useState({
    frequency: 'Once daily',
    dosage_instruction: 'Take one dose',
    start_date: new Date().toISOString().slice(0, 10),
  });

  useEffect(() => {
    if (!canManageMedications) {
      setAdding(false);
      setEditing(null);
    }
  }, [canManageMedications]);

  useEffect(() => {
    const query = drugQuery.trim();
    if (!adding || selectedDrug || query.length < 1) {
      if (!query) setDrugResults([]);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      setAddBusy(true);
      setAddError('');
      try {
        setDrugResults(await onSearchDrugs(query));
      } catch (requestError) {
        setAddError(requestError.message);
      } finally {
        setAddBusy(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [adding, drugQuery, onSearchDrugs, selectedDrug]);

  function openEditor(medicine) {
    if (!canManageMedications) return;
    setEditing(medicine);
    setDraft({
      dosage_instruction: medicine.dosage_instruction || '',
      frequency: medicine.frequency || 'Once daily',
    });
    setError('');
  }

  async function saveEdit() {
    setSaving(true);
    setError('');
    try {
      await onUpdateMedication(editing.id, { ...draft, expected_updated_at: editing.updated_at });
      setEditing(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function stopMedicine() {
    if (!window.confirm(`Remove ${editing.drug_name_raw} from the active medication schedule?`))
      return;
    setSaving(true);
    setError('');
    try {
      await onStopMedication(editing);
      setEditing(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function addMedicine() {
    if (!canManageMedications) return;
    setAddBusy(true);
    setAddError('');
    try {
      await onAddMedicine({ drug_name: selectedDrug.generic_name, ...addDraft });
      setAdding(false);
      setSelectedDrug(null);
      setDrugQuery('');
      setDrugResults([]);
    } catch (requestError) {
      setAddError(requestError.message);
    } finally {
      setAddBusy(false);
    }
  }

  async function createSchedule() {
    if (!canManageMedications) return;
    if (
      !medications.length ||
      !window.confirm(
        'Create a safe suggested schedule for all active medicines? Existing upcoming reminder times will be replaced.'
      )
    )
      return;
    setScheduleBusy(true);
    try {
      await onCreateSuggestedSchedule();
    } catch (requestError) {
      window.alert(requestError.message);
    } finally {
      setScheduleBusy(false);
    }
  }
  return (
    <main className="grid gap-4 px-4 pb-4 pt-5">
      <header className="cg-page-header">
        <p className="m-0 text-sm font-semibold text-blue-700">Medicine monitoring</p>
        <h1 className="mb-0 mt-1 text-2xl font-bold tracking-tight text-slate-900">Medication</h1>
        <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
          Review prescriptions, schedules, medicine supply, and refill alerts.
        </p>
      </header>
      <section
        className={`flex items-start gap-3 rounded-2xl border p-4 shadow-sm ${canManageMedications ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}
      >
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${canManageMedications ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
        >
          {canManageMedications ? (
            <ShieldCheck className="h-5 w-5" />
          ) : (
            <LockKeyhole className="h-5 w-5" />
          )}
        </span>
        <div>
          <strong className="block text-sm text-slate-900">
            {canManageMedications
              ? 'Medication management authorized'
              : 'View-only medication access'}
          </strong>
          <p className="mb-0 mt-1 text-xs font-medium leading-5 text-slate-600">
            {canManageMedications
              ? 'The patient allowed you to edit OTC directions and remove medicines from the active schedule.'
              : 'The patient must enable medication editing from their Profile before changes can be made.'}
          </p>
        </div>
      </section>
      {canManageMedications && (
        <section
          className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
          aria-labelledby="medication-actions-title"
        >
          <h2 className="mb-3 mt-0 text-base font-bold text-slate-900" id="medication-actions-title">
            Medication actions
          </h2>
          <div className="grid gap-2">
            <button
              className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-left text-slate-900 active:scale-[.99]"
              onClick={() => setAdding(true)}
              type="button"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
                <Plus className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm">Add a medicine</strong>
                <small className="mt-1 block text-xs font-medium text-slate-600">
                  Choose a verified medicine for patient tracking
                </small>
              </span>
            </button>
            <button
              className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left text-slate-900 active:scale-[.99] disabled:opacity-50"
              disabled={!medications.length || scheduleBusy}
              onClick={createSchedule}
              type="button"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
                <CalendarPlus className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm">Create suggested schedule</strong>
                <small className="mt-1 block text-xs font-medium text-slate-600">
                  {scheduleBusy
                    ? 'Creating safe reminder times…'
                    : 'Generate safe reminder times for active medicines'}
                </small>
              </span>
            </button>
          </div>
        </section>
      )}
      {previewMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Preview stock information is shown while live balance data is unavailable.
        </div>
      )}
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div><span className="text-xs font-bold uppercase tracking-wide text-blue-700">Dose monitoring</span><h2 className="mb-0 mt-1 text-lg font-bold text-slate-900">Today’s medicine schedule</h2><p className="mb-0 mt-1 text-sm font-medium text-slate-600">Send the patient a reminder when a dose is due or missed.</p></div>
          <button aria-label="View medication calendar" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-blue-200 bg-white text-blue-700" onClick={() => setCalendarOpen(true)} type="button"><CalendarDays className="h-6 w-6" /></button>
        </div>
        <button className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white" onClick={() => setCalendarOpen(true)} type="button"><CalendarDays className="h-5 w-5" />View Calendar</button>
      </section>
      <DoseSection status="upcoming" doses={timeline.filter((dose) => dose.status === 'upcoming')} onReminder={onSendReminder} />
      <DoseSection status="overdue" doses={timeline.filter((dose) => dose.status === 'overdue')} onReminder={onSendReminder} />
      <DoseSection status="taken" doses={timeline.filter((dose) => dose.status === 'taken')} onReminder={onSendReminder} />
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-bold text-slate-900">Active medicines</h2>
            <p className="mb-0 mt-1 text-sm font-medium text-slate-600">
              Patient prescriptions and saved directions
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
            {medications.length}
          </span>
        </div>
        <div className="mt-4 grid gap-2">
          {medications.length ? (
            (showAllMedications ? medications : medications.slice(0, 3)).map((medicine) => {
              const isRx =
                String(medicine.rx_class || medicine.source || '')
                  .toLowerCase()
                  .includes('rx') || medicine.source === 'prescription';
              const canEditMedicine = canManageMedications && medicine.source === 'OTC_SELF';
              return (
                <article
                  className="flex min-h-[82px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                  key={medicine.id}
                >
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${isRx ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}
                  >
                    <Pill className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="truncate text-sm text-slate-900">
                        {medicine.drug_name_raw}
                      </strong>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isRx ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}
                      >
                        {isRx ? 'Rx' : 'OTC'}
                      </span>
                    </div>
                    <small className="mt-1 block font-medium leading-5 text-slate-600">
                      {medicine.dosage_instruction || 'Follow the saved medicine direction'}
                    </small>
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {medicine.frequency || 'Saved schedule'}
                    </span>
                  </div>
                  {canEditMedicine && (
                    <button
                      aria-label={`Edit ${medicine.drug_name_raw}`}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-blue-200 bg-white text-blue-700"
                      onClick={() => openEditor(medicine)}
                      type="button"
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                  )}
                  {canManageMedications && !canEditMedicine && (
                    <span
                      aria-label="Pharmacist-managed prescription"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500"
                      role="img"
                    >
                      <LockKeyhole className="h-5 w-5" />
                    </span>
                  )}
                </article>
              );
            })
          ) : (
            <div className="py-5 text-center">
              <Pill className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mb-0 mt-2 text-sm font-medium text-slate-600">
                No active medicine records available.
              </p>
            </div>
          )}
        </div>
        {medications.length > 3 && (
          <button
            aria-expanded={showAllMedications}
            className="mt-3 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700"
            onClick={() => setShowAllMedications((value) => !value)}
            type="button"
          >
            {showAllMedications ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            {showAllMedications ? 'Show fewer medications' : `See all ${medications.length} medications`}
          </button>
        )}
      </section>
      {calendarOpen && <DoseCalendar timeline={timeline} onClose={() => setCalendarOpen(false)} />}
      {editing && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setEditing(null)}
        >
          <section
            aria-labelledby="caregiver-edit-medicine-title"
            aria-modal="true"
            className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-xs font-bold uppercase tracking-wide text-blue-700">
                  Authorized medication care
                </p>
                <h2
                  className="mb-0 mt-1 text-xl font-bold text-slate-900"
                  id="caregiver-edit-medicine-title"
                >
                  Edit {editing.drug_name_raw}
                </h2>
              </div>
              <button
                aria-label="Close editor"
                className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-700"
                onClick={() => setEditing(null)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-bold text-slate-900">
                Dose instructions
                <textarea
                  className="min-h-[88px] rounded-xl border border-slate-300 p-3 text-base font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  onChange={(event) =>
                    setDraft((value) => ({ ...value, dosage_instruction: event.target.value }))
                  }
                  value={draft.dosage_instruction}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-900">
                Frequency
                <select
                  className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-3 text-base font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  onChange={(event) =>
                    setDraft((value) => ({ ...value, frequency: event.target.value }))
                  }
                  value={draft.frequency}
                >
                  <option value="Once daily">Once daily</option>
                  <option value="Twice daily">Twice daily</option>
                  <option value="3 times daily">3 times daily</option>
                  <option value="Every other day">Every other day</option>
                  <option value="Every 8 hours">Every 8 hours</option>
                  <option value="Every 12 hours">Every 12 hours</option>
                </select>
              </label>
              {error && (
                <p
                  className="m-0 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700"
                  role="alert"
                >
                  {error}
                </p>
              )}
              <p className="m-0 rounded-xl bg-blue-50 p-3 text-xs font-medium leading-5 text-blue-800">
                <ShieldCheck className="mr-1 inline h-4 w-4" /> Prescription medicines remain locked
                for pharmacist review.
              </p>
              <button
                className="min-h-[56px] rounded-xl bg-blue-600 px-4 font-bold text-white disabled:opacity-60"
                disabled={saving || !draft.dosage_instruction || !draft.frequency}
                onClick={saveEdit}
                type="button"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 font-bold text-rose-700 disabled:opacity-60"
                disabled={saving}
                onClick={stopMedicine}
                type="button"
              >
                <Trash2 className="h-5 w-5" /> Remove from active schedule
              </button>
            </div>
          </section>
        </div>
      )}
      {adding && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setAdding(false)}
        >
          <section
            aria-labelledby="caregiver-add-medicine-title"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-xs font-bold uppercase tracking-wide text-blue-700">
                  Patient medication
                </p>
                <h2
                  className="mb-0 mt-1 text-xl font-bold text-slate-900"
                  id="caregiver-add-medicine-title"
                >
                  Add a medicine
                </h2>
                <p className="mb-0 mt-1 text-xs font-medium leading-5 text-slate-600">
                  Choose a verified medicine. Create its suggested schedule after saving.
                </p>
              </div>
              <button
                aria-label="Close add medicine"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"
                onClick={() => setAdding(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-bold text-slate-900">
                Medicine name
                <div className="relative">
                  <input
                    aria-autocomplete="list"
                    className="min-h-[52px] w-full rounded-xl border border-slate-300 px-3 pr-12 text-base font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    onChange={(event) => {
                      setDrugQuery(event.target.value);
                      setSelectedDrug(null);
                    }}
                    placeholder="Start typing a medicine name"
                    value={selectedDrug?.generic_name || drugQuery}
                  />
                  <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-600" />
                </div>
                <small className="font-medium text-slate-500">
                  Matching medicines appear automatically as you type.
                </small>
              </label>
              {!selectedDrug && drugResults.length > 0 && (
                <div
                  className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"
                  role="listbox"
                >
                  {drugResults.map((drug) => (
                    <button
                      className="min-h-[52px] rounded-xl bg-white px-3 text-left text-sm font-semibold text-slate-900 shadow-sm"
                      key={drug.id}
                      onClick={() => {
                        setSelectedDrug(drug);
                        setDrugResults([]);
                      }}
                      type="button"
                    >
                      <strong className="block">{drug.generic_name}</strong>
                      <small className="mt-1 block font-medium text-slate-600">
                        {drug.common_strength || 'Select the strength on the label'} •{' '}
                        {drug.rx_class || 'Medicine'}
                      </small>
                    </button>
                  ))}
                </div>
              )}
              {selectedDrug && (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
                  <span>
                    <strong className="block text-sm text-slate-900">
                      {selectedDrug.generic_name}
                    </strong>
                    <small className="text-xs font-medium text-emerald-800">
                      Verified medicine selected
                    </small>
                  </span>
                </div>
              )}
              <label className="grid gap-2 text-sm font-bold text-slate-900">
                How often?
                <select
                  className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-3 text-base font-medium"
                  onChange={(event) =>
                    setAddDraft((value) => ({ ...value, frequency: event.target.value }))
                  }
                  value={addDraft.frequency}
                >
                  <option>Once daily</option>
                  <option>Twice daily</option>
                  <option>3 times daily</option>
                  <option>Every other day</option>
                  <option>Every 8 hours</option>
                  <option>Every 12 hours</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-900">
                Label instructions
                <select
                  className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-3 text-base font-medium"
                  onChange={(event) =>
                    setAddDraft((value) => ({ ...value, dosage_instruction: event.target.value }))
                  }
                  value={addDraft.dosage_instruction}
                >
                  <option>Take one dose</option>
                  <option>Take in the morning</option>
                  <option>Take after food</option>
                  <option>Take before food</option>
                  <option>Take at bedtime</option>
                  <option>Take as directed</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold text-slate-900">
                Reminder start date
                <input
                  className="min-h-[52px] rounded-xl border border-slate-300 px-3 text-base font-medium"
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) =>
                    setAddDraft((value) => ({ ...value, start_date: event.target.value }))
                  }
                  type="date"
                  value={addDraft.start_date}
                />
              </label>
              {addError && (
                <p
                  className="m-0 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700"
                  role="alert"
                >
                  {addError}
                </p>
              )}
              <button
                className="min-h-[56px] rounded-xl bg-blue-600 px-4 font-bold text-white disabled:opacity-50"
                disabled={!selectedDrug || addBusy}
                onClick={addMedicine}
                type="button"
              >
                {addBusy ? 'Adding medicine…' : 'Add medicine'}
              </button>
            </div>
          </section>
        </div>
      )}
      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold text-slate-900">Pill balance and refills</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {stockAlerts.length}
          </span>
        </div>
        {stockAlerts.length ? (
          stockAlerts.map((item) => (
            <CaregiverRefillAlert item={item} key={item.id} />
          ))
        ) : (
          <RefillEmptyState />
        )}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <ReceiptText className="h-5 w-5" />
          </span>
          <div>
            <h2 className="m-0 text-lg font-bold text-slate-900">Recent refill requests</h2>
            <p className="mb-0 mt-1 text-sm font-medium text-slate-600">
              Pharmacy activity for this patient
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {orders
            .filter((order) => order.kind === 'Refill')
            .slice(0, 4)
            .map((order) => (
              <article
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                key={`${order.kind}-${order.id}`}
              >
                <Package className="h-5 w-5 shrink-0 text-blue-600" />
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-slate-900">
                    {order.drug || 'Medicine refill'}
                  </strong>
                  <small className="font-medium text-slate-600">
                    {order.branch || 'PharMate branch'}
                  </small>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold capitalize text-amber-700">
                  {String(order.status || 'pending').replaceAll('_', ' ')}
                </span>
              </article>
            ))}
          {!orders.some((order) => order.kind === 'Refill') && (
            <div className="py-5 text-center">
              <Plus className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mb-0 mt-2 text-sm font-medium text-slate-600">
                No refill requests yet.
              </p>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-medium leading-5 text-blue-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          Prescription refills remain pharmacist-gated before fulfillment.
        </div>
      </section>
    </main>
  );
}
