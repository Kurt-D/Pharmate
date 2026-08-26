import { AlertTriangle, Package, X } from 'lucide-react';

export default function CaregiverRefillAlert({ item, onDismiss }) {
  return (
    <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-amber-700">
          <AlertTriangle className="h-5 w-5 stroke-[2.2]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="m-0 text-base font-bold text-slate-900">{item.name}</h3>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-bold text-amber-700">
                Low stock
              </span>
              {onDismiss && (
                <button
                  aria-label={`Dismiss stock alert for ${item.name}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-amber-200 bg-white text-slate-600 active:scale-95"
                  onClick={onDismiss}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <p className="mb-0 mt-1 text-sm font-medium leading-5 text-amber-800">
            {item.daysRemaining} days remaining ({item.tabletsLeft} tablets left)
          </p>
          <p className="mb-0 mt-1 text-xs font-medium text-slate-600">
            {item.isRx ? 'Prescription verification may be required.' : 'Eligible for OTC reorder.'}
          </p>
        </div>
      </div>
    </article>
  );
}

export function RefillEmptyState() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
      <Package className="mx-auto h-8 w-8 text-emerald-600" />
      <h3 className="mb-0 mt-3 text-base font-bold text-slate-900">
        Medicine stock looks sufficient
      </h3>
      <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
        No refill reminders need your attention right now.
      </p>
    </div>
  );
}
