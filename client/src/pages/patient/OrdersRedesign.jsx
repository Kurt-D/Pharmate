import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';

const OTC_STEPS = [
  ['Order Placed', 'Order received by the pharmacy.'],
  ['Pharmacy Packing', 'Items are checked and prepared.'],
  ['Out for Delivery', 'Estimated arrival in 30–60 minutes.'],
  ['Delivered', 'Order and payment completed.'],
];
const RX_STEPS = [
  ['Prescription Under Review', 'A pharmacist is checking the prescription and quantity.'],
  ['Approved & Preparing', 'The pharmacist approved the order for packing.'],
  ['Out for Delivery', 'The rider has been dispatched.'],
  ['Delivered', 'Order received and payment confirmed.'],
];
function Icon({ name, size = 22 }) {
  const paths = {
    back: <path d="m15 18-6-6 6-6" />,
    delivery: (
      <>
        <path d="M3 6h11v11H3Z" />
        <path d="M14 10h4l3 3v4h-7Z" />
        <circle cx="7" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
      </>
    ),
    bag: (
      <>
        <path d="M6 8h12l1 13H5Z" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      </>
    ),
    box: (
      <>
        <path d="m4 7 8-4 8 4-8 4Z" />
        <path d="M4 7v10l8 4 8-4V7M12 11v10" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    store: (
      <>
        <path d="M4 10v10h16V10M3 10l2-6h14l2 6" />
        <path d="M8 20v-6h8v6" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.3"
    >
      {paths[name]}
    </svg>
  );
}
const money = (value) => `₱${Number(value || 0).toFixed(2)}`;
const terminalStatuses = new Set([
  'delivered', 'completed', 'ready', 'rejected', 'needs_resubmission', 'cancelled',
]);
const statusIndex = (status) =>
  ({
    order_placed: 0,
    pending: 0,
    submitted: 0,
    prescription_under_review: 0,
    needs_resubmission: 0,
    packing: 1,
    processing: 1,
    approved: 1,
    approved_preparing: 1,
    ready: 1,
    out_for_delivery: 2,
    in_transit: 2,
    delivered: 3,
    completed: 3,
    rejected: 3,
    needs_resubmission: 3,
    cancelled: 3,
  })[status] ?? 0;

function orderStatus(order) {
  if (['rejected', 'needs_resubmission'].includes(order.prescription_status))
    return order.prescription_status;
  if (order.prescription_status === 'approved' && order.status === 'pending') return 'approved';
  return order.status || 'order_placed';
}

function statusCopy(order) {
  const status = orderStatus(order);
  return ({
    order_placed: ['Checkout completed', 'The pharmacy received your order.'],
    pending: ['Order received', 'Your checkout is waiting for pharmacy review.'],
    submitted: ['Submitted', 'Your order was sent to the pharmacy.'],
    prescription_under_review: ['Under review', 'A pharmacist is reviewing the prescription.'],
    approved: ['Approved', 'The pharmacist approved the order for preparation.'],
    processing: ['Approved and preparing', 'The pharmacy is preparing your order.'],
    packing: ['Packing', 'The pharmacy is checking and packing the items.'],
    ready: ['Ready for pickup', 'The approved order is ready at the selected branch.'],
    out_for_delivery: ['Out for delivery', 'The approved order is on its way.'],
    in_transit: ['In transit', 'The approved order is on its way.'],
    delivered: ['Delivered', 'Checkout, delivery, and payment processing are complete.'],
    completed: ['Completed', 'The order was completed successfully.'],
    rejected: ['Disapproved', 'The pharmacist did not approve this prescription order.'],
    needs_resubmission: ['Needs a clearer prescription', 'Upload a clearer prescription to continue.'],
    cancelled: ['Cancelled', 'The order was cancelled and will not be fulfilled.'],
  })[status] || [String(status).replaceAll('_', ' '), 'The latest pharmacy status is shown here.'];
}

export default function OrdersRedesign() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [serverOrders, setServerOrders] = useState([]);
  const [expanded, setExpanded] = useState(params.get('placed') || '');
  const [view, setView] = useState(() => (params.get('view') === 'history' ? 'history' : 'active'));
  const [orderHistories, setOrderHistories] = useState({});
  useEffect(() => {
    api('/api/patient/orders')
      .then((response) => {
        const combined = [
          ...(response.data.deliveries || []).map((item) => ({
            ...item, fulfillment: 'delivery', order_kind: 'delivery',
          })),
          ...(response.data.refills || []).map((item) => ({
            ...item, fulfillment: 'pickup', order_kind: 'refill',
          })),
        ];
        setServerOrders(
          combined
            .map((order) => ({
              ...order,
              status: orderStatus(order),
              type: order.rx_class === 'RX' || order.source === 'RX_VALIDATED' ? 'rx' : 'otc',
              created_at: order.requested_at,
              items: [{ name: order.drug || 'Pharmacy order', quantity: Number(order.quantity || 1) }],
              payment: order.payment_method,
              contact: 'Saved patient contact',
              address: order.fulfillment === 'pickup' ? order.branch : 'Saved delivery address',
              total: null,
            }))
            .sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at))
        );
      })
      .catch(() => setServerOrders([]));
  }, []);
  const attention = useMemo(
    () =>
      serverOrders.filter((order) =>
        ['needs_resubmission', 'rejected'].includes(orderStatus(order))
      ),
    [serverOrders]
  );
  const active = useMemo(
    () =>
      serverOrders.filter(
        (order) => !terminalStatuses.has(orderStatus(order))
      ),
    [serverOrders]
  );
  const historyOrders = useMemo(
    () => serverOrders.slice().sort(
      (a, b) => new Date(b.created_at || b.requested_at) - new Date(a.created_at || a.requested_at)
    ),
    [serverOrders]
  );
  const placedOrder = useMemo(
    () => serverOrders.find((order) => order.id === params.get('placed')),
    [params, serverOrders]
  );
  async function toggleOrder(order) {
    const nextExpanded = expanded === order.id ? '' : order.id;
    setExpanded(nextExpanded);
    if (!nextExpanded || !order.order_kind || orderHistories[order.id]) return;
    try {
      const response = await api(
        `/api/patient/orders/${order.order_kind}/${encodeURIComponent(order.id)}/history`
      );
      setOrderHistories((current) => ({ ...current, [order.id]: response.data.history || [] }));
    } catch {
      setOrderHistories((current) => ({ ...current, [order.id]: [] }));
    }
  }
  function tracker(order) {
    const current = statusIndex(order.status);
    const steps = order.type === 'rx' ? RX_STEPS : OTC_STEPS;
    return (
      <div className="pm-order-stepper">
        {steps.map(([label, help], index) => (
          <div
            className={`${index < current ? 'complete' : ''} ${index === current ? 'active' : ''}`}
            key={label}
          >
            <span>{index < current ? <Icon name="check" size={18} /> : <b>{index + 1}</b>}</span>
            <div>
              <strong>{label}</strong>
              <small>{help}</small>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <main className="pm-tracker-page">
      <header className="pm-orders-header pm-orders-header--with-back">
        <button
          onClick={() => navigate('/patient/shop')}
          aria-label="Back to Pharmacy Shop"
          type="button"
        >
          <Icon name="back" />
        </button>
        <div>
          <h1>
            <span>
              <Icon name="delivery" size={24} />
            </span>
            Orders
          </h1>
          <p>Track pharmacy preparation and delivery.</p>
        </div>
      </header>
      {params.get('placed') && (
        <>
        <div className="pm-order-success" role="status">
          <span>
            <Icon name="check" />
          </span>
          <div>
            <strong>
              {params.get('type') === 'rx'
                ? 'Sent for pharmacist review'
                : 'Order placed successfully'}
            </strong>
            <p>
              {params.get('type') === 'rx'
                ? 'Payment and packing remain locked until a pharmacist approves the prescription.'
                : 'The pharmacy received your request and will begin checking the items.'}
            </p>
            <small>
              Receipt #{params.get('placed')}
              {placedOrder?.total != null ? ` · Total ${money(placedOrder.total)}` : ''}
            </small>
          </div>
        </div>
        {placedOrder && (
          <section className="pm-order-receipt" aria-label="Order receipt">
            <header>
              <div><small>Order receipt</small><h2>Order received</h2><p>Receipt #{placedOrder.id}</p></div>
              <time>{new Date(placedOrder.created_at).toLocaleString()}</time>
            </header>
            <ol className="pm-order-receipt__timeline"><li className="active">Order placed</li><li>Preparing</li><li>{placedOrder.fulfillment === 'pickup' ? 'Ready for pickup' : 'Out for delivery'}</li></ol>
            <div className="pm-order-receipt__store"><span><Icon name={placedOrder.fulfillment === 'pickup' ? 'store' : 'delivery'} /></span><div><strong>{placedOrder.fulfillment === 'pickup' ? placedOrder.branch : 'Doorstep delivery'}</strong><small>{placedOrder.fulfillment === 'pickup' ? 'Pick up when ready' : 'Deliver to your saved address'}</small></div></div>
            <div className="pm-order-receipt__items">{placedOrder.items.map((item) => <div key={`${item.id}-${item.pack}`}><span><Icon name="bag" /></span><p><strong>{item.name}</strong><small>{item.pack} · Qty {item.quantity}</small></p><b>{money(Number(item.unit_price || 0) * Number(item.quantity || 1))}</b></div>)}</div>
            <dl>
              <div><dt>Subtotal</dt><dd>{money(placedOrder.subtotal)}</dd></div>
              <div><dt>Delivery fee</dt><dd>{placedOrder.delivery_fee ? money(placedOrder.delivery_fee) : 'Free'}</dd></div>
              <div className="total"><dt>Total</dt><dd>{money(placedOrder.total)}</dd></div>
            </dl>
            <div className="pm-order-receipt__detail"><strong>Payment</strong><span>{String(placedOrder.payment || 'Cash').replaceAll('_', ' ')} · Pay on {placedOrder.fulfillment === 'pickup' ? 'pickup' : 'delivery'}</span></div>
            <div className="pm-order-receipt__detail"><strong>{placedOrder.fulfillment === 'pickup' ? 'Pickup branch' : 'Delivery address'}</strong><span>{placedOrder.fulfillment === 'pickup' ? placedOrder.branch : placedOrder.address}</span></div>
            {placedOrder.recipient_name && <div className="pm-order-receipt__detail"><strong>Recipient</strong><span>{placedOrder.recipient_name} · {placedOrder.contact}</span></div>}
          </section>
        )}
        </>
      )}
      {view === 'active' && attention.map((order) => (
        <div className="pm-rx-order-alert" role="alert" key={`alert-${order.id}`}>
          <strong>
            {order.status === 'rejected'
              ? 'Prescription order rejected'
              : 'A clearer prescription is required'}
          </strong>
          <p>
            {order.rejection_reason ||
              'Review the pharmacist feedback and upload a replacement prescription.'}
          </p>
          <button onClick={() => navigate('/patient/shop')} type="button">
            Return to Prescription Shop
          </button>
        </div>
      ))}
      <div className="pm-tracker-heading">
        <div>
          <h2>{view === 'active' ? 'Active Orders' : 'Order History'}</h2>
          <p>
            {view === 'history'
              ? `${historyOrders.length} checkout${historyOrders.length === 1 ? '' : 's'} recorded`
              : active.length
              ? `${active.length} order${active.length === 1 ? '' : 's'} in progress`
              : 'No orders in progress'}
          </p>
        </div>
        <div className="pm-order-view-tabs" role="tablist" aria-label="Order views">
          <button className={view === 'active' ? 'active' : ''} onClick={() => setView('active')} role="tab" aria-selected={view === 'active'} type="button">
            Active
          </button>
          <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')} role="tab" aria-selected={view === 'history'} type="button">
            History
          </button>
        </div>
      </div>
      {view === 'active' && active.length > 0 && (
        <section className="pm-active-orders">
          {active.map((order) => (
            <article key={order.id} className={expanded === order.id ? 'expanded' : ''}>
              <button
                className="pm-order-card-summary"
                onClick={() => toggleOrder(order)}
                type="button"
              >
                <span className="pm-order-type-icon">
                  <Icon name={order.fulfillment === 'pickup' ? 'store' : 'delivery'} />
                </span>
                <div>
                  <small>
                    {order.type === 'rx' ? 'Prescription order' : 'OTC order'} · #{order.id}
                  </small>
                  <h3>{order.items.map((item) => item.name.split(' (')[0]).join(', ')}</h3>
                  <p>
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)} units ·{' '}
                    {order.type === 'rx' && order.status === 'prescription_under_review'
                      ? 'Payment locked during review'
                      : order.fulfillment === 'pickup'
                        ? 'Branch pickup'
                        : 'Doorstep delivery'}
                  </p>
                </div>
                <strong>{order.total == null ? '' : money(order.total)}</strong>
              </button>
              {expanded === order.id && (
                <div className="pm-order-card-detail">
                  {tracker(order)}
                  <dl>
                    <div>
                      <dt>Contact</dt>
                      <dd>{order.contact}</dd>
                    </div>
                    <div>
                      <dt>{order.fulfillment === 'pickup' ? 'Pickup branch' : 'Deliver to'}</dt>
                      <dd>{order.fulfillment === 'pickup' ? order.branch : order.address}</dd>
                    </div>
                    <div>
                      <dt>Payment</dt>
                      <dd>
                        {order.type === 'rx' && order.status === 'prescription_under_review'
                          ? 'Available after approval'
                          : `${String(order.payment).toUpperCase()} on ${order.fulfillment === 'pickup' ? 'pickup' : 'delivery'}`}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
      {view === 'history' && historyOrders.length > 0 && (
        <section className="pm-order-history-new">
          {historyOrders.map((order) => {
            const [label, detail] = statusCopy(order);
            const history = orderHistories[order.id] || [];
            return (
              <article className={`status-${orderStatus(order)}`} key={`${order.fulfillment}-${order.id}`}>
                <button className="pm-order-history-summary" onClick={() => toggleOrder(order)} type="button">
                  <span><Icon name={order.fulfillment === 'pickup' ? 'store' : 'box'} /></span>
                  <div>
                    <strong>{order.items?.[0]?.name || order.drug || 'Pharmacy order'}</strong>
                    <small>{new Date(order.created_at || order.requested_at).toLocaleString()} · {order.branch || order.fulfillment}</small>
                    <small>{detail}</small>
                  </div>
                  <em>{label}</em>
                </button>
                {expanded === order.id && (
                  <div className="pm-order-history-detail">
                    <p><strong>Checkout:</strong> {order.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} unit(s) requested</p>
                    <p><strong>Payment:</strong> {order.payment_status ? String(order.payment_status).replaceAll('_', ' ') : order.payment ? String(order.payment).replaceAll('_', ' ') : 'Recorded at checkout'}</p>
                    {order.rejection_reason && <p><strong>Pharmacist feedback:</strong> {order.rejection_reason}</p>}
                    {history.map((event, index) => (
                      <p key={`${event.changed_at}-${index}`}>
                        <strong>{new Date(event.changed_at).toLocaleString()}:</strong>{' '}
                        {String(event.from_status || 'submitted').replaceAll('_', ' ')} → {String(event.to_status).replaceAll('_', ' ')}
                      </p>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
      {view === 'history' && historyOrders.length === 0 && (
        <div className="pm-no-active-orders">
          <Icon name="clock" size={30} />
          <strong>No order history yet</strong>
          <p>Completed checkouts and pharmacist decisions will appear here.</p>
        </div>
      )}
    </main>
  );
}
