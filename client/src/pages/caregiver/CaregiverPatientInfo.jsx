import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import '../../styles/caregiver-patient-info.css';
import {
  AlertTriangle,
  ContactRound,
  HeartPulse,
  Link2,
  Plus,
  Save,
  ShieldCheck,
  Smile,
  Trash2,
  Utensils,
  Users,
} from 'lucide-react';

const OBSERVATIONS = [
  { id: 'mood', label: 'Good mood', icon: Smile },
  { id: 'bp', label: 'Blood pressure checked', icon: HeartPulse },
  { id: 'dizzy', label: 'Felt dizzy', icon: AlertTriangle },
  { id: 'meals', label: 'Finished meals', icon: Utensils },
];

function storageKey(accountId, patientCode) {
  return `pm_caregiver_notes_v2_${encodeURIComponent(accountId)}_${encodeURIComponent(patientCode)}`;
}

export default function CaregiverPatientInfo({ patient, onAddPatient }) {
  const { user } = useAuth();
  return (
    <PatientInfo
      key={`${user?.id || ''}:${patient?.patient_code || ''}`}
      patient={patient}
      onAddPatient={onAddPatient}
      accountId={user?.id}
    />
  );
}

function PatientInfo({ patient, onAddPatient, accountId }) {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const patientCode = patient?.patient_code || '';
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    try {
      if (!accountId || !patientCode) return;
      const saved = JSON.parse(localStorage.getItem(storageKey(accountId, patientCode)) || '[]');
      if (
        !Array.isArray(saved) ||
        saved.some(
          (note) =>
            !note ||
            typeof note.id !== 'string' ||
            typeof note.text !== 'string' ||
            !Array.isArray(note.tags) ||
            !Number.isFinite(new Date(note.createdAt).getTime())
        )
      )
        throw new Error('Invalid notes');
      setNotes(saved);
      setStorageReady(true);
    } catch {
      setNotes([]);
      setError('Saved notes could not be opened. Reload to try again. Nothing has been changed.');
    }
    setDraft('');
    setSelectedTags([]);
  }, [accountId, patientCode]);

  function toggleTag(id) {
    setSelectedTags((current) =>
      current.includes(id) ? current.filter((tag) => tag !== id) : [...current, id]
    );
  }

  async function saveNote() {
    const text = draft.trim();
    if ((!text && !selectedTags.length) || !storageReady || saving) return;
    setSaving(true);
    setMessage('');
    setError('');
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    try {
      const updated = [
        { id: crypto.randomUUID(), text, tags: selectedTags, createdAt: new Date().toISOString() },
        ...notes,
      ];
      localStorage.setItem(storageKey(accountId, patientCode), JSON.stringify(updated));
      setNotes(updated);
      setDraft('');
      setSelectedTags([]);
      setMessage('Care note saved on this device.');
    } catch {
      setError(
        'Could not save the note on this device. Your text is still here. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  }

  function removeNote(id) {
    if (!window.confirm('Delete this care note? This cannot be undone.')) return;
    try {
      const updated = notes.filter((note) => note.id !== id);
      localStorage.setItem(storageKey(accountId, patientCode), JSON.stringify(updated));
      setNotes(updated);
      setMessage('Care note deleted from this device.');
    } catch {
      setError('Could not delete the note. Please try again.');
    }
  }

  // Patient records come from the active-link-only caregiver endpoint.
  if (!patient || (patient.status && patient.status !== 'active'))
    return (
      <main className="cg-patient-info-screen">
        <header className="cg-page-header">
          <p className="m-0 text-sm font-semibold text-blue-700">Patient information</p>
          <h1 className="mb-0 mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Patient information
          </h1>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Users className="mx-auto h-10 w-10 text-blue-600" />
          <h2 className="mb-0 mt-3 text-lg font-bold text-slate-900">No linked patient</h2>
          <p className="mb-0 mt-2 text-sm text-slate-600">
            Link a patient to view their profile and keep daily care notes.
          </p>
          <button
            className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white"
            onClick={onAddPatient}
            type="button"
          >
            <Plus className="h-5 w-5" />
            Link a Patient
          </button>
        </section>
      </main>
    );

  return (
    <main className="cg-patient-info-screen">
      <header className="cg-page-header">
        <p className="m-0 text-sm font-semibold text-blue-700">Linked patient</p>
        <h1 className="mb-0 mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Patient information
        </h1>
        <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
          Keep everyday care details in one place.
        </p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-blue-600 text-white">
            <ContactRound className="h-8 w-8" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-lg font-bold text-slate-900">
              {patient.relationship || 'Linked patient'}
            </h2>
            <p className="mb-0 mt-1 text-sm font-medium text-slate-600">Patient connection</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              Patient connection active
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <Link2 className="h-4 w-4 text-blue-600" />
              Patient code
            </span>
            <strong className="text-sm text-slate-900">{patient.patient_code}</strong>
          </div>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="m-0 text-lg font-bold text-slate-900">How is your patient today?</h2>
          <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
            Write changes you want to remember for the next consultation.
          </p>
        </div>
        <div className="cg-observation-grid" aria-label="Quick observations (optional)">
          {OBSERVATIONS.map(({ id, label, icon: Icon }) => {
            const active = selectedTags.includes(id);
            return (
              <button
                aria-pressed={active}
                disabled={saving || !storageReady}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700'}`}
                key={id}
                onClick={() => toggleTag(id)}
                type="button"
              >
                <Icon className="h-4 w-4" />
                {label}
                {active && <span aria-hidden="true"> ✓</span>}
              </button>
            );
          })}
        </div>
        <label className="mt-4 grid gap-2 text-sm font-semibold text-slate-800">
          Add a care note
          <textarea
            disabled={saving || !storageReady}
            className="min-h-28 resize-y rounded-xl border border-slate-300 bg-white p-3 text-base font-medium leading-6 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write what you noticed today…"
            value={draft}
          />
        </label>
        {!draft.trim() && !selectedTags.length && (
          <p className="cg-note-help">Write a note or select an observation to enable saving.</p>
        )}
        <p role="status" className="cg-note-success">
          {message}
        </p>
        {error && (
          <p role="alert" className="cg-note-error">
            {error}
          </p>
        )}
        <button
          className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
          disabled={saving || !storageReady || (!draft.trim() && !selectedTags.length)}
          onClick={saveNote}
          type="button"
        >
          <Save className="h-5 w-5" />
          {saving ? 'Saving…' : 'Save note'}
        </button>
        <p className="mb-0 mt-2 text-xs font-medium leading-5 text-slate-500">
          Saved on this device only. Not automatically shared with the pharmacist.
        </p>
      </section>
      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold text-slate-900">Saved care notes</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {notes.length}
          </span>
        </div>
        {notes.length ? (
          notes.map((note) => (
            <article
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              key={note.id}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  {note.tags?.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {note.tags.map((tag) => {
                        const observation = OBSERVATIONS.find((item) => item.id === tag);
                        if (!observation) return null;
                        const Icon = observation.icon;
                        return (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                            key={tag}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {observation.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <p className="m-0 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-800">
                    {note.text || 'Quick observation recorded.'}
                  </p>
                  <time className="mt-2 block text-xs font-medium text-slate-500">
                    {new Date(note.createdAt).toLocaleString()}
                  </time>
                </div>
                <button
                  aria-label="Delete care note"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  onClick={() => removeNote(note.id)}
                  type="button"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
            <p className="mb-0 mt-2 text-sm font-medium text-slate-600">
              No notes yet. Add your first care note above.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
