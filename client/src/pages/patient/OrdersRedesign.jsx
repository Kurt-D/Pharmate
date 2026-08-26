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
  })[status] ?? 0;

export default function OrdersRedesign() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [localOrders, setLocalOrders] = useState([]);
  const [serverOrders, setServerOrders] = useState([]);
  const [expanded, setExpanded] = useState(params.get('placed') || '');
  useEffect(() => {
    try {
      const otc = JSON.parse(localStorage.getItem('pm_otc_orders') || '[]');
      const rx = JSON.parse(localStorage.getItem('pm_rx_orders') || '[]');
      setLocalOrders(
        [...rx, ...otc].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      );
    } catch {
      setLocalOrders([]);
    }
    api('/api/patient/orders')
      .then((response) => {
        const combined = [
          ...(response.data.deliveries || []).map((item) => ({ ...item, fulfillment: 'delivery' })),
          ...(response.data.refills || []).map((item) => ({ ...item, fulfillment: 'pickup' })),
        ];
        setServerOrders(
          combined.sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at))
        );
      })
      .catch(() => setServerOrders([]));
  }, []);
  const attention = useMemo(
    () => localOrders.filter((order) => ['needs_resubmission', 'rejected'].includes(order.status)),
    [localOrders]
  );
  const active = useMemo(
    () =>
      localOrders.filter(
        (order) => statusIndex(order.status) < 3 && order.status !== 'needs_resubmission'
      ),
    [localOrders]
  );
  const completed = useMemo(
    () => [...localOrders.filter((order) => statusIndex(order.status) === 3), ...serverOrders],
    [localOrders, serverOrders]
  );
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
          </div>
        </div>
      )}
      {attention.map((order) => (
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
          <h2>Active Orders</h2>
          <p>
            {active.length
              ? `${active.length} order${active.length === 1 ? '' : 's'} in progress`
              : 'No orders in progress'}
          </p>
        </div>
      </div>
      {active.length > 0 && (
        <section className="pm-active-orders">
          {active.map((order) => (
            <article key={order.id} className={expanded === order.id ? 'expanded' : ''}>
              <button
                className="pm-order-card-summary"
                onClick={() => setExpanded((value) => (value === order.id ? '' : order.id))}
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
                <strong>{money(order.total)}</strong>
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
      {completed.length > 0 && (
        <section className="pm-order-history-new">
          <h2>Order History</h2>
          {completed.slice(0, 8).map((order) => (
            <article key={`${order.fulfillment}-${order.id}`}>
              <span>
                <Icon name={order.fulfillment === 'pickup' ? 'store' : 'box'} />
              </span>
              <div>
                <strong>{order.items?.[0]?.name || order.drug || 'Pharmacy order'}</strong>
                <small>
                  {new Date(order.created_at || order.requested_at).toLocaleDateString()} ·{' '}
                  {order.branch || order.fulfillment}
                </small>
              </div>
              <em>{String(order.status || 'placed').replaceAll('_', ' ')}</em>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
