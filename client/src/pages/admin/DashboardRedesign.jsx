import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  PackageOpen,
  Pill,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '../../api.js';
import '../../styles/admin-dashboard.css';

function RateChart({ data }) {
  const points = data.map((entry, index) => ({
    ...entry,
    x: 54 + (index * 612) / Math.max(data.length - 1, 1),
    y: 22 + ((100 - Number(entry.pct || 0)) * 188) / 100,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = points.length ? `54,210 ${line} ${points.at(-1).x},210` : '';
  return (
    <div className="admin-rate-chart">
      <svg viewBox="0 0 720 255" role="img" aria-label="Adherence percentage over time">
        <defs>
          <linearGradient id="adherenceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4c8ce4" stopOpacity=".24" />
            <stop offset="1" stopColor="#4c8ce4" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((value) => {
          const y = 22 + ((100 - value) * 188) / 100;
          return (
            <g key={value}>
              <line x1="54" x2="666" y1={y} y2={y} />
              <text x="44" y={y + 4}>
                {value}%
              </text>
            </g>
          );
        })}
        {area && <polygon points={area} fill="url(#adherenceFill)" />}
        {line && (
          <polyline
            points={line}
            fill="none"
            stroke="#4c8ce4"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {points.map((point) => (
          <g key={String(point.date)}>
            <circle cx={point.x} cy={point.y} r="5" />
            <text className="date" x={point.x} y="239">
              {new Date(point.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
            </text>
            <title>{`${new Date(point.date).toLocaleDateString()}: ${point.pct ?? 0}% adherence`}</title>
          </g>
        ))}
      </svg>
      {!points.length && (
        <div className="empty">
          <TrendingUp size={28} />
          <b>No adherence data yet</b>
          <span>The chart will update when patients begin logging doses.</span>
        </div>
      )}
    </div>
  );
}

const ALERT_ICONS = {
  adherence: Activity,
  order: ShoppingBag,
  inventory: Pill,
  prescription: ShieldCheck,
  account: Users,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState({
    agg: null,
    trend: [],
    alerts: [],
    alertCounts: {},
    orders: [],
  });
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aggregates, trend, alerts, orders] = await Promise.all([
        api('/api/admin/aggregates'),
        api(`/api/admin/adherence-trend?days=${days}`),
        api('/api/admin/alerts'),
        api('/api/admin/orders'),
      ]);
      setData({
        agg: aggregates.data,
        trend: trend.data,
        alerts: alerts.data.alerts.slice(0, 5),
        alertCounts: alerts.data.counts,
        orders: orders.data.orders.slice(0, 5),
      });
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);
  const average = useMemo(
    () =>
      data.trend.length
        ? Math.round(
            data.trend.reduce((sum, row) => sum + Number(row.pct || 0), 0) / data.trend.length
          )
        : null,
    [data.trend]
  );
  if (!data.agg && loading) return <div className="admin-empty">Loading monitoring dashboard…</div>;
  const aggregate = data.agg || {};
  const openOrders = Object.entries(aggregate.refills || {})
    .concat(Object.entries(aggregate.deliveries || {}))
    .filter(([status]) => !['ready', 'delivered', 'cancelled'].includes(status))
    .reduce((sum, [, count]) => sum + Number(count || 0), 0);
  const stats = [
    ['Patients', aggregate.patients || 0, Users, '/admin/users', 'blue'],
    ['Active medicines', aggregate.active_medications || 0, Pill, '/admin/medicines', 'teal'],
    [
      'Average adherence',
      aggregate.adherence?.average_pct == null ? '—' : `${aggregate.adherence.average_pct}%`,
      CheckCircle2,
      '/admin/alerts',
      'green',
    ],
    ['Open orders', openOrders, PackageOpen, '/admin/orders', 'amber'],
    ['System alerts', data.alertCounts.total || 0, BellRing, '/admin/alerts', 'red'],
  ];

  return (
    <section className="admin-monitor-dashboard">
      <section className="admin-monitor-hero">
        <div>
          <span>
            <i />
            System monitoring active
          </span>
          <h2>PharMate System Control Center</h2>
          <p>
            See adherence performance, operational alerts, medicine inventory, and order activity
            from one privacy-conscious workspace.
          </p>
          <nav>
            <button onClick={() => navigate('/admin/alerts')} type="button">
              <BellRing size={16} />
              Review system alerts
            </button>
            <button onClick={() => navigate('/admin/orders')} type="button">
              <PackageOpen size={16} />
              Open order operations
            </button>
          </nav>
        </div>
        <aside>
          <ShieldCheck size={46} />
          <small>Protected monitoring</small>
          <b>Role-based controls active</b>
        </aside>
      </section>
      {error && (
        <div className="admin-dashboard-error">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}
      <div className="admin-monitor-stats">
        {stats.map(([label, value, Icon, path, tone]) => (
          <button
            className={`tone-${tone}`}
            onClick={() => navigate(path)}
            type="button"
            key={label}
          >
            <span>
              <Icon size={21} />
            </span>
            <div>
              <strong>{value}</strong>
              <small>{label}</small>
            </div>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>

      <div className="admin-monitor-grid">
        <section className="admin-monitor-card chart-card">
          <header>
            <div>
              <span>
                <TrendingUp size={18} />
              </span>
              <div>
                <h3>Adherence rate</h3>
                <p>Percentage of scheduled doses taken</p>
              </div>
            </div>
            <nav>
              {[7, 14, 30].map((value) => (
                <button
                  className={days === value ? 'active' : ''}
                  onClick={() => setDays(value)}
                  type="button"
                  key={value}
                >
                  {value} days
                </button>
              ))}
              <button onClick={load} type="button" aria-label="Refresh dashboard">
                <RefreshCw size={16} className={loading ? 'is-spinning' : ''} />
              </button>
            </nav>
          </header>
          <div className="chart-summary">
            <div>
              <small>Period average</small>
              <strong>{average == null ? '—' : `${average}%`}</strong>
            </div>
            <span className={average >= 80 ? 'good' : 'attention'}>
              {average == null
                ? 'Waiting for data'
                : average >= 80
                  ? 'Healthy adherence'
                  : 'Needs attention'}
            </span>
          </div>
          <RateChart data={data.trend} />
        </section>
        <section className="admin-monitor-card alerts-card">
          <header>
            <div>
              <span>
                <BellRing size={18} />
              </span>
              <div>
                <h3>Recent system alerts</h3>
                <p>Across all operational areas</p>
              </div>
            </div>
            <button onClick={() => navigate('/admin/alerts')} type="button">
              View all <ArrowRight size={15} />
            </button>
          </header>
          <div className="alert-counts">
            <span className="critical">
              <b>{data.alertCounts.critical || 0}</b> Critical
            </span>
            <span className="warning">
              <b>{data.alertCounts.warning || 0}</b> Warning
            </span>
            <span>
              <b>{data.alertCounts.info || 0}</b> Information
            </span>
          </div>
          <div className="dashboard-alert-list">
            {data.alerts.length ? (
              data.alerts.map((alert) => {
                const Icon = ALERT_ICONS[alert.type] || AlertTriangle;
                return (
                  <button onClick={() => navigate(alert.navigate_to)} type="button" key={alert.id}>
                    <span className={`is-${alert.severity}`}>
                      <Icon size={17} />
                    </span>
                    <div>
                      <b>{alert.title}</b>
                      <small>{new Date(alert.created_at).toLocaleString()}</small>
                    </div>
                    <ArrowRight size={15} />
                  </button>
                );
              })
            ) : (
              <div className="dashboard-empty">
                <CheckCircle2 size={25} />
                <b>No system alerts</b>
                <span>All monitored areas are clear.</span>
              </div>
            )}
          </div>
        </section>
        <section className="admin-monitor-card orders-card">
          <header>
            <div>
              <span>
                <PackageOpen size={18} />
              </span>
              <div>
                <h3>Recent orders</h3>
                <p>Latest refill and delivery activity</p>
              </div>
            </div>
            <button onClick={() => navigate('/admin/orders')} type="button">
              Process orders <ArrowRight size={15} />
            </button>
          </header>
          <div className="dashboard-order-table">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Medicine</th>
                  <th>Type</th>
                  <th>Requested</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order) => (
                  <tr key={`${order.kind}-${order.id}`}>
                    <td>
                      <b>{order.patient_code}</b>
                    </td>
                    <td>{order.drug}</td>
                    <td>{order.kind}</td>
                    <td>{new Date(order.requested_at).toLocaleString()}</td>
                    <td>
                      <span className={`is-${order.status}`}>
                        {order.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.orders.length && (
              <div className="dashboard-empty">
                <Clock3 size={25} />
                <b>No orders yet</b>
                <span>New requests will appear here.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
