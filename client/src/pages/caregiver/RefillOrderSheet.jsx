import { useEffect, useState } from 'react';
import { MapPin, ShieldCheck, ShoppingBag, X } from 'lucide-react';

export default function RefillOrderSheet({ item, branches, onClose, onSubmit }) {
  const [branchId, setBranchId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setBranchId(branches[0]?.id || '');
    setError('');
  }, [item, branches]);
  if (!item) return null;

  async function submit() {
    if (!branchId) return setError('Choose a pharmacy branch.');
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ item, branchId });
      onClose();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:px-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        aria-labelledby="refill-sheet-title"
        aria-modal="true"
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div>
              <h2
                className="m-0 text-xl font-bold tracking-tight text-slate-900"
                id="refill-sheet-title"
              >
                Order refill
              </h2>
              <p className="mb-0 mt-1 text-sm font-medium text-slate-600">
                Request {item.name} for the linked patient.
              </p>
            </div>
          </div>
          <button
            aria-label="Close refill order"
            className="grid h-12 w-12 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <label className="mt-5 grid gap-2 text-sm font-semibold text-slate-800">
          <span className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            Pharmacy branch
          </span>
          <select
            className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-3 text-base font-medium text-slate-900 outline-none focus:border-[#4C8CE4] focus:ring-4 focus:ring-blue-100"
            onChange={(event) => setBranchId(event.target.value)}
            value={branchId}
          >
            <option value="">Choose branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <div
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700"
            role="alert"
          >
            {error}
          </div>
        )}
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm font-medium leading-5 text-slate-600">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <span>Prescription medicines remain pharmacist-gated before fulfillment.</span>
        </div>
        <button
          className="mt-4 h-14 w-full rounded-xl bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
          disabled={submitting}
          onClick={submit}
          type="button"
        >
          {submitting ? 'Submitting Request…' : 'Confirm Refill Request'}
        </button>
      </section>
    </div>
  );
}
