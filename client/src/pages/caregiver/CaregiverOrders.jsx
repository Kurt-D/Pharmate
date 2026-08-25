import { Check, CircleDollarSign, Clock3, PackageCheck, ReceiptText, Truck } from 'lucide-react';

const STEPS = [
  { id: 'pending', label: 'Order Placed', description: 'The pharmacy received the request.' },
  {
    id: 'processing',
    label: 'Pharmacist Verified / Packed',
    description: 'Items are reviewed and prepared.',
  },
  { id: 'out_for_delivery', label: 'Out for Delivery', description: 'The package is on the way.' },
  { id: 'delivered', label: 'Delivered', description: 'Order and payment completed.' },
];

const STATUS_INDEX = { pending: 0, processing: 1, ready: 1, out_for_delivery: 2, delivered: 3 };

function OrderCard({ order }) {
  const current = STATUS_INDEX[order.status] ?? 0;
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-slate-100 p-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
          {order.kind === 'Delivery' ? (
            <Truck className="h-6 w-6" />
          ) : (
            <PackageCheck className="h-6 w-6" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 truncate text-base font-bold text-slate-900">
              {order.drug || 'Medicine order'}
            </h2>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold capitalize text-blue-700">
              {String(order.status || 'pending').replaceAll('_', ' ')}
            </span>
          </div>
          <p className="mb-0 mt-1 text-xs font-medium text-slate-500">
            Order #
            {String(order.id || '')
              .slice(-8)
              .toUpperCase()}
          </p>
          <p className="mb-0 mt-1 text-sm font-medium text-slate-600">
            {order.branch || 'Selected PharMate branch'}
          </p>
        </div>
      </div>
      <div className="p-4">
        <div className="relative grid gap-0">
          {STEPS.map((step, index) => {
            const complete = index <= current;
            return (
              <div
                className="relative grid min-h-[70px] grid-cols-[34px_minmax(0,1fr)] gap-3 last:min-h-0"
                key={step.id}
              >
                <span
                  className={`z-10 grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold ${complete ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-500'}`}
                >
                  {complete && index < current ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                {index < STEPS.length - 1 && (
                  <span
                    className={`absolute bottom-0 left-[15px] top-8 w-0.5 ${index < current ? 'bg-blue-600' : 'bg-slate-200'}`}
                    aria-hidden="true"
                  />
                )}
                <div className="pb-4">
                  <strong
                    className={`block text-sm ${complete ? 'text-slate-900' : 'text-slate-500'}`}
                  >
                    {step.label}
                  </strong>
                  <small className="mt-1 block font-medium leading-5 text-slate-600">
                    {step.description}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
        <dl className="mb-0 mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="font-semibold text-slate-600">Order type</dt>
            <dd className="m-0 font-bold text-slate-900">{order.kind}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
            <dt className="font-semibold text-slate-600">Payment</dt>
            <dd className="m-0 font-bold text-slate-900">
              {order.payment || 'Managed by patient'}
            </dd>
          </div>
          {order.price && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
              <dt className="font-semibold text-slate-600">Total</dt>
              <dd className="m-0 font-bold text-slate-900">{order.price}</dd>
            </div>
          )}
        </dl>
      </div>
    </article>
  );
}

export default function CaregiverOrders({ orders }) {
  const active = orders.filter((order) => !['delivered', 'cancelled'].includes(order.status));
  const history = orders.filter((order) => ['delivered', 'cancelled'].includes(order.status));
  return (
    <main className="grid gap-4 px-4 pb-4 pt-5">
      <header>
        <p className="m-0 text-sm font-semibold text-blue-700">View-only tracking</p>
        <h1 className="mb-0 mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Patient Orders
        </h1>
        <p className="mb-0 mt-1 text-sm font-medium leading-5 text-slate-600">
          Follow pharmacy preparation and delivery without changing the patient’s order.
        </p>
      </header>
      <section className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <Truck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
        <div>
          <strong className="block text-sm text-blue-900">Live order progress</strong>
          <p className="mb-0 mt-1 text-sm font-medium leading-5 text-blue-800">
            Statuses update when the pharmacy verifies, packs, and dispatches an order.
          </p>
        </div>
      </section>
      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-lg font-bold text-slate-900">Active orders</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {active.length}
          </span>
        </div>
        {active.length ? (
          active.map((order) => <OrderCard key={`${order.kind}-${order.id}`} order={order} />)
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <Clock3 className="mx-auto h-9 w-9 text-slate-400" />
            <h3 className="mb-0 mt-3 text-base font-bold text-slate-900">No active order</h3>
            <p className="mb-0 mt-1 text-sm font-medium text-slate-600">
              Patient orders will appear here after checkout.
            </p>
          </div>
        )}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <ReceiptText className="h-5 w-5" />
          </span>
          <div>
            <h2 className="m-0 text-lg font-bold text-slate-900">Past orders</h2>
            <p className="mb-0 mt-1 text-sm font-medium text-slate-600">
              Delivered orders and digital receipts
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {history.length ? (
            history.map((order) => (
              <article
                className="flex min-h-[72px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                key={`${order.kind}-${order.id}`}
              >
                <CircleDollarSign className="h-5 w-5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-slate-900">
                    {order.drug || 'Medicine order'}
                  </strong>
                  <small className="font-medium text-slate-600">
                    {order.requested_at
                      ? new Date(order.requested_at).toLocaleDateString()
                      : 'Completed order'}
                  </small>
                </div>
                <span className="text-xs font-bold capitalize text-slate-600">{order.status}</span>
              </article>
            ))
          ) : (
            <p className="mb-0 rounded-xl bg-slate-50 p-4 text-center text-sm font-medium text-slate-600">
              No past orders yet.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
