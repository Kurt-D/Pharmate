import { CalendarClock, Package, Pill, Plus, ReceiptText, ShieldCheck } from 'lucide-react';
import CaregiverRefillAlert, { RefillEmptyState } from './CaregiverRefillAlert.jsx';

export default function CaregiverRefills({
  medications,
  stockAlerts,
  orders,
  previewMode,
  onOrderRefill,
}) {
  return (
    <main className="grid gap-4 px-4 pb-4 pt-5">
      <header>
        <p className="m-0 text-sm font-semibold text-blue-700">Medicine monitoring</p>
        <h1 className="mb-0 mt-1 text-2xl font-bold tracking-tight text-slate-900">Medication</h1>
        <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
          Review prescriptions, schedules, medicine supply, and refill alerts.
        </p>
      </header>
      {previewMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Preview stock information is shown while live balance data is unavailable.
        </div>
      )}
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
            medications.map((medicine) => {
              const isRx =
                String(medicine.rx_class || medicine.source || '')
                  .toLowerCase()
                  .includes('rx') || medicine.source === 'prescription';
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
      </section>
      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold text-slate-900">Pill balance and refills</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {stockAlerts.length}
          </span>
        </div>
        {stockAlerts.length ? (
          stockAlerts.map((item) => (
            <CaregiverRefillAlert item={item} key={item.id} onOrderRefill={onOrderRefill} />
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
