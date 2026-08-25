import { useEffect, useState } from 'react';
import { FileText, Plus, Save, Trash2 } from 'lucide-react';

function storageKey(patientCode) {
  return `pm_caregiver_notes_${patientCode || 'unlinked'}`;
}

export default function CareNotes({ patientCode }) {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    try {
      setNotes(JSON.parse(localStorage.getItem(storageKey(patientCode)) || '[]'));
    } catch {
      setNotes([]);
    }
    setDraft('');
  }, [patientCode]);

  function saveNote() {
    const text = draft.trim();
    if (!text) return;
    const updated = [
      { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() },
      ...notes,
    ];
    setNotes(updated);
    localStorage.setItem(storageKey(patientCode), JSON.stringify(updated));
    setDraft('');
  }

  function removeNote(id) {
    const updated = notes.filter((note) => note.id !== id);
    setNotes(updated);
    localStorage.setItem(storageKey(patientCode), JSON.stringify(updated));
  }

  return (
    <main className="grid gap-4 px-4 pb-4 pt-5">
      <header>
        <p className="m-0 text-sm font-semibold text-blue-700">Private caregiver notes</p>
        <h1 className="mb-0 mt-1 text-2xl font-bold tracking-tight text-slate-900">Care notes</h1>
        <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
          Record observations and questions for the linked patient.
        </p>
      </header>
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <label className="grid gap-2 text-sm font-semibold text-slate-800">
          New note
          <textarea
            className="min-h-28 resize-y rounded-xl border border-slate-300 bg-white p-3 text-base font-medium leading-6 text-slate-900 outline-none focus:border-[#4C8CE4] focus:ring-4 focus:ring-blue-100"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Example: Patient felt dizzy after the morning dose. Ask the pharmacist."
            value={draft}
          />
        </label>
        <button
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
          disabled={!draft.trim()}
          onClick={saveNote}
          type="button"
        >
          <Save className="h-5 w-5" />
          Save Note
        </button>
        <p className="mb-0 mt-2 text-xs font-medium leading-5 text-slate-500">
          Notes stay on this device and are not automatically sent to the pharmacist.
        </p>
      </section>
      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold text-slate-900">Saved notes</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {notes.length}
          </span>
        </div>
        {notes.length ? (
          notes.map((note) => (
            <article
              className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
              key={note.id}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 whitespace-pre-wrap text-sm font-medium leading-6 text-slate-800">
                    {note.text}
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
            <Plus className="mx-auto h-7 w-7 text-slate-400" />
            <p className="mb-0 mt-2 text-sm font-medium text-slate-600">No care notes saved yet.</p>
          </div>
        )}
      </section>
    </main>
  );
}
