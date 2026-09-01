import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eye,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  Search,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../../api.js';
import '../../styles/admin-orders.css';

const FILTERS = [
  ['all', 'All orders'],
  ['pending', 'Needs action'],
  ['processing', 'Processing'],
  ['dispatch', 'For delivery'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];
const STATUS_LABELS = {
  pending: 'Awaiting acceptance',
  processing: 'Being prepared',
  ready: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const STATUS_STEPS = {
  refill: ['pending', 'processing', 'ready'],
  delivery: ['pending', 'processing', 'out_for_delivery', 'delivered'],
};

function nextAction(order) {
  if (order.status === 'pending') return { status: 'processing', label: 'Accept order' };
  if (order.status === 'processing' && order.kind === 'refill')
    return { status: 'ready', label: 'Mark ready for pickup' };
  if (order.status === 'processing' && order.kind === 'delivery')
    return { status: 'out_for_delivery', label: 'Dispatch order' };
  if (order.status === 'out_for_delivery')
    return { status: 'delivered', label: 'Mark as delivered' };
  return null;
}
function orderReference(order) {
  return `PM-${order.kind === 'delivery' ? 'D' : 'R'}-${String(order.id).slice(0, 8).toUpperCase()}`;
}
function formatDate(value) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );
}
function StatusBadge({ status }) {
  const Icon =
    status === 'delivered' || status === 'ready'
      ? CheckCircle2
      : status === 'out_for_delivery'
        ? Truck
        : status === 'cancelled'
          ? XCircle
          : status === 'processing'
            ? PackageOpen
            : Clock3;
  return (
    <span className={`admin-order-status is-${status}`}>
      <Icon size={14} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}
function OrderTimeline({ order }) {
  const steps = STATUS_STEPS[order.kind];
  const current = steps.indexOf(order.status);
  return (
    <ol className="admin-order-timeline" aria-label="Order progress">
      {steps.map((step, index) => {
        const complete = order.status !== 'cancelled' && index < current;
        const active = order.status !== 'cancelled' && index === current;
        return (
          <li className={complete ? 'complete' : active ? 'active' : ''} key={step}>
            <span>{complete ? <CheckCircle2 size={15} /> : index + 1}</span>
            <div>
              <b>{STATUS_LABELS[step]}</b>
              <small>
                {index === 0
                  ? formatDate(order.requested_at)
                  : active
                    ? 'Current stage'
                    : 'Next stage'}
              </small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function Orders() {
  const [data, setData] = useState({ counts: {}, orders: [] });
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await api('/api/admin/orders');
      setData(response.data);
      setSelected((current) =>
        current ? response.data.orders.find((order) => order.id === current.id) || null : null
      );
      setLastUpdated(new Date());
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(() => load({ quiet: true }), 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  const visibleOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.orders.filter((order) => {
      const statusMatches =
        filter === 'all' ||
        (filter === 'pending' && order.status === 'pending') ||
        (filter === 'processing' && order.status === 'processing') ||
        (filter === 'dispatch' && order.status === 'out_for_delivery') ||
        (filter === 'completed' && ['ready', 'delivered'].includes(order.status)) ||
        (filter === 'cancelled' && order.status === 'cancelled');
      if (!statusMatches) return false;
      return (
        !needle ||
        [order.id, order.patient_code, order.drug, order.branch, order.kind]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      );
    });
  }, [data.orders, filter, query]);

  async function processOrder() {
    if (!confirmAction) return;
    setSaving(true);
    try {
      await api(`/api/admin/orders/${confirmAction.order.kind}/${confirmAction.order.id}/status`, {
        method: 'POST',
        body: { status: confirmAction.status },
      });
      setNotice(
        confirmAction.status === 'cancelled'
          ? `${orderReference(confirmAction.order)} was cancelled.`
          : `${orderReference(confirmAction.order)} moved to ${STATUS_LABELS[confirmAction.status].toLowerCase()}.`
      );
      setConfirmAction(null);
      await load({ quiet: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  const metrics = [
    { label: 'Needs action', value: data.counts.pending || 0, Icon: Clock3, tone: 'amber' },
    {
      label: 'Being prepared',
      value: data.counts.processing || 0,
      Icon: PackageOpen,
      tone: 'blue',
    },
    {
      label: 'For dispatch',
      value: data.counts.out_for_delivery || 0,
      Icon: Truck,
      tone: 'violet',
    },
    { label: 'Completed', value: data.counts.completed || 0, Icon: PackageCheck, tone: 'green' },
  ];

  return (
    <section className="admin-order-workspace">
      <header className="admin-order-heading">
        <div>
          <span>ADMIN ORDER OPERATIONS</span>
          <h2>Monitor and process orders</h2>
          <p>
            Accept incoming requests, monitor preparation, and advance each order through
            fulfilment.
          </p>
        </div>
        <button type="button" onClick={() => load()} disabled={loading}>
          <RefreshCw size={17} className={loading ? 'is-spinning' : ''} />
          Refresh orders
        </button>
      </header>

      {error && (
        <div className="admin-order-message is-error" role="alert">
          <CircleAlert size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="admin-order-message is-success" role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="admin-order-metrics">
        {metrics.map(({ label, value, Icon, tone }) => (
          <article className={`tone-${tone}`} key={label}>
            <span>
              <Icon size={21} />
            </span>
            <div>
              <strong>{value}</strong>
              <small>{label}</small>
            </div>
          </article>
        ))}
      </div>

      <section className="admin-order-flow" aria-label="Order fulfilment workflow">
        <div>
          <small>ORDER WORKFLOW</small>
          <strong>From request to completion</strong>
        </div>
        {[
          ['1', 'Accept', 'Confirm the request'],
          ['2', 'Prepare', 'Check and pack'],
          ['3', 'Dispatch', 'Release for delivery'],
          ['4', 'Complete', 'Confirm handover'],
        ].map(([number, title, note], index) => (
          <article key={title}>
            <span>{index === 3 ? <CheckCircle2 size={16} /> : number}</span>
            <div>
              <b>{title}</b>
              <small>{note}</small>
            </div>
            {index < 3 ? <ChevronRight size={16} aria-hidden="true" /> : null}
          </article>
        ))}
      </section>

      <div className="admin-order-panel">
        <div className="admin-order-toolbar">
          <nav aria-label="Order status filters">
            {FILTERS.map(([value, label]) => (
              <button
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
                type="button"
                key={value}
              >
                {label}
                {value === 'pending' && data.counts.pending > 0 ? (
                  <span>{data.counts.pending}</span>
                ) : null}
              </button>
            ))}
          </nav>
          <label>
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search order, patient code, or medicine"
            />
          </label>
        </div>
        <div className="admin-order-table-wrap">
          <table className="admin-order-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Patient</th>
                <th>Medicine</th>
                <th>Fulfilment</th>
                <th>Status</th>
                <th>Requested</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }, (_, index) => (
                  <tr className="admin-order-skeleton" key={index}>
                    <td colSpan="7">
                      <span />
                    </td>
                  </tr>
                ))
              ) : visibleOrders.length ? (
                visibleOrders.map((order) => {
                  const action = nextAction(order);
                  const isRx = order.rx_class === 'RX' || order.source === 'RX_VALIDATED';
                  return (
                    <tr key={`${order.kind}-${order.id}`}>
                      <td>
                        <button
                          className="admin-order-ref"
                          type="button"
                          onClick={() => setSelected(order)}
                        >
                          {orderReference(order)}
                        </button>
                      </td>
                      <td>
                        <span className="admin-account-code">{order.patient_code}</span>
                      </td>
                      <td>
                        <strong>{order.drug}</strong>
                        <small>{isRx ? 'Rx verified' : 'OTC medicine'}</small>
                      </td>
                      <td>
                        <b className={`admin-order-kind is-${order.kind}`}>
                          {order.kind === 'delivery' ? (
                            <Truck size={14} />
                          ) : (
                            <PackageOpen size={14} />
                          )}
                          {order.kind}
                        </b>
                        <small>{order.branch}</small>
                      </td>
                      <td>
                        <StatusBadge status={order.status} />
                      </td>
                      <td>
                        <span>{formatDate(order.requested_at)}</span>
                      </td>
                      <td>
                        <div className="admin-order-actions">
                          <button className="view" onClick={() => setSelected(order)} type="button">
                            <Eye size={17} />
                            <span>View</span>
                          </button>
                          {action ? (
                            <button
                              className="primary"
                              onClick={() => setConfirmAction({ order, ...action })}
                              type="button"
                            >
                              {action.label}
                              <ChevronRight size={16} />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7">
                    <div className="admin-order-empty">
                      <PackageOpen size={32} />
                      <strong>No matching orders</strong>
                      <p>Try another status filter or search term.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="admin-order-panel-footer">
          <span>
            Showing {visibleOrders.length} of {data.orders.length} orders
          </span>
          <span>
            {lastUpdated
              ? `Last updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Loading order queue…'}
          </span>
        </footer>
      </div>

      {selected &&
        createPortal(
          <div
            className="admin-order-drawer-backdrop"
            onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}
          >
            <aside
              className="admin-order-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="order-detail-title"
            >
              <header>
                <div>
                  <small>ORDER DETAILS</small>
                  <h3 id="order-detail-title">{orderReference(selected)}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close order details"
                >
                  <X size={20} />
                </button>
              </header>
              <section className="admin-order-drawer-summary">
                <StatusBadge status={selected.status} />
                <h4>{selected.drug}</h4>
                <p>
                  {selected.kind === 'delivery'
                    ? 'Doorstep delivery request'
                    : 'Branch refill request'}{' '}
                  for <b>{selected.patient_code}</b>.
                </p>
              </section>
              <dl>
                <div>
                  <dt>Patient code</dt>
                  <dd>{selected.patient_code}</dd>
                </div>
                <div>
                  <dt>Order type</dt>
                  <dd>{selected.kind}</dd>
                </div>
                <div>
                  <dt>Pharmacy branch</dt>
                  <dd>{selected.branch}</dd>
                </div>
                <div>
                  <dt>Medicine class</dt>
                  <dd>
                    {selected.rx_class === 'RX' || selected.source === 'RX_VALIDATED'
                      ? 'Prescription verified'
                      : 'OTC'}
                  </dd>
                </div>
                <div>
                  <dt>Requested</dt>
                  <dd>{formatDate(selected.requested_at)}</dd>
                </div>
                <div>
                  <dt>Last status update</dt>
                  <dd>{formatDate(selected.updated_at)}</dd>
                </div>
              </dl>
              <section className="admin-order-progress">
                <h4>Fulfilment progress</h4>
                <OrderTimeline order={selected} />
              </section>
              <footer>
                {nextAction(selected) ? (
                  <button
                    className="primary"
                    type="button"
                    onClick={() => setConfirmAction({ order: selected, ...nextAction(selected) })}
                  >
                    {nextAction(selected).label}
                    <ChevronRight size={17} />
                  </button>
                ) : null}
                {!['ready', 'delivered', 'cancelled'].includes(selected.status) ? (
                  <button
                    className="danger"
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        order: selected,
                        status: 'cancelled',
                        label: 'Cancel order',
                      })
                    }
                  >
                    Cancel order
                  </button>
                ) : null}
              </footer>
            </aside>
          </div>,
          document.body
        )}

      {confirmAction &&
        createPortal(
          <div className="admin-order-confirm-backdrop">
            <section
              className="admin-order-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-order-title"
            >
              <span className={confirmAction.status === 'cancelled' ? 'danger' : ''}>
                {confirmAction.status === 'cancelled' ? (
                  <XCircle size={25} />
                ) : (
                  <PackageCheck size={25} />
                )}
              </span>
              <h3 id="confirm-order-title">{confirmAction.label}?</h3>
              <p>
                {confirmAction.status === 'cancelled'
                  ? 'This removes the order from active fulfilment. The patient will need to place a new request.'
                  : `This will move ${orderReference(confirmAction.order)} to “${STATUS_LABELS[confirmAction.status]}”.`}
              </p>
              <div>
                <button type="button" onClick={() => setConfirmAction(null)} disabled={saving}>
                  Go back
                </button>
                <button
                  className={confirmAction.status === 'cancelled' ? 'danger' : 'primary'}
                  type="button"
                  onClick={processOrder}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : confirmAction.label}
                </button>
              </div>
            </section>
          </div>,
          document.body
        )}
    </section>
  );
}
