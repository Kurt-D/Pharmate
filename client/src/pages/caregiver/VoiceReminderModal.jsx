import { useEffect, useMemo, useState } from 'react';
import { Check, Droplets, HeartPulse, Pill, Volume2, X } from 'lucide-react';

function reminderPresets(patientLabel, medicine) {
  const patient = String(patientLabel || 'Patient')
    .split('•')[0]
    .trim();
  const drug = medicine || 'maintenance medicine';
  return [
    {
      id: 'medicine',
      icon: Pill,
      message: `${patient}, oras na po para inumin ang inyong ${drug} pagkatapos kumain.`,
    },
    {
      id: 'water',
      icon: Droplets,
      message: 'Paalala po: Uminom ng gamot at uminom ng sapat na tubig.',
    },
    {
      id: 'maintenance',
      icon: HeartPulse,
      message:
        'Oras na po ng inyong maintenance medicine. Pakisunod ang tagubilin sa inyong schedule.',
    },
  ];
}

export default function VoiceReminderModal({ open, patientLabel, medicine, onClose, onSend }) {
  const presets = useMemo(() => reminderPresets(patientLabel, medicine), [patientLabel, medicine]);
  const [selectedId, setSelectedId] = useState('medicine');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) setSelectedId('medicine');
  }, [open]);
  if (!open) return null;

  const selected = presets.find((preset) => preset.id === selectedId) || presets[0];

  async function send() {
    setSending(true);
    try {
      await onSend({ message: selected.message, medicine });
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:px-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        aria-labelledby="voice-reminder-title"
        aria-modal="true"
        className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <Volume2 className="h-5 w-5 stroke-[2.2]" />
            </span>
            <div>
              <h2
                className="m-0 text-xl font-bold tracking-tight text-slate-900"
                id="voice-reminder-title"
              >
                Choose a voice reminder
              </h2>
              <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
                The selected message will appear and play on {patientLabel}’s homepage.
              </p>
            </div>
          </div>
          <button
            aria-label="Close voice reminder"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        {medicine && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
            Scheduled medicine: {medicine}
          </div>
        )}
        <div className="mt-4 grid gap-3" role="radiogroup" aria-label="Voice reminder messages">
          {presets.map((preset) => {
            const active = selectedId === preset.id;
            const Icon = preset.icon;
            return (
              <button
                aria-checked={active}
                className={`flex min-h-[76px] items-start gap-3 rounded-xl border p-3 text-left text-sm font-medium leading-5 transition active:scale-[.99] ${active ? 'border-blue-500 bg-blue-50 text-slate-900 ring-2 ring-blue-100' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'}`}
                key={preset.id}
                onClick={() => setSelectedId(preset.id)}
                role="radio"
                type="button"
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex-1">{preset.message}</span>
                <span
                  className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}
                >
                  {active && <Check className="h-4 w-4" />}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mb-0 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium leading-5 text-amber-800">
          Voice alerts require the patient’s reminder and listening settings to be enabled.
        </p>
        <button
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[.99] disabled:bg-slate-300"
          disabled={sending}
          onClick={send}
          type="button"
        >
          <Volume2 className="h-5 w-5 stroke-[2.2]" />
          {sending ? 'Dispatching Voice Alert…' : 'Send Voice Reminder'}
        </button>
      </section>
    </div>
  );
}

export { reminderPresets };
