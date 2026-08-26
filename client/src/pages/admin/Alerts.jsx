import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  CircleAlert,
  Filter,
  Pill,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../api.js';
import '../../styles/admin-alerts.css';

const TYPES = {
  adherence: ['Adherence', Activity],
  order: ['Orders', ShoppingBag],
  inventory: ['Inventory', Pill],
  prescription: ['Prescriptions', ShieldCheck],
  account: ['Accounts', Users],
};
export default function Alerts() {
  const navigate = useNavigate();
  const [data, setData] = useState({ counts: {}, alerts: [] });
  const [type, setType] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api('/api/admin/alerts');
      setData(response.data);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const visible = useMemo(
    () =>
      data.alerts.filter((alert) => {
        const needle = query.trim().toLowerCase();
        return (
          (type === 'all' || alert.type === type) &&
          (severity === 'all' || alert.severity === severity) &&
          (!needle ||
            [alert.title, alert.description, alert.patient_code, alert.status]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(needle)))
        );
      }),
    [data.alerts, query, severity, type]
  );
  const metrics = [
    ['All alerts', data.counts.total || 0, BellRing, 'blue'],
    ['Critical', data.counts.critical || 0, AlertTriangle, 'red'],
    ['Warnings', data.counts.warning || 0, CircleAlert, 'amber'],
    ['Information', data.counts.info || 0, CheckCircle2, 'green'],
  ];
  return (
    <section className="admin-alert-workspace">
      <header className="admin-alert-heading">
        <div>
          <span>SYSTEM MONITORING</span>
          <h2>Unified system alerts</h2>
          <p>
            Monitor adherence, orders, inventory, prescriptions, and account conditions in one
            place.
          </p>
        </div>
        <button onClick={load} disabled={loading} type="button">
          <RefreshCw size={17} className={loading ? 'is-spinning' : ''} />
          Refresh alerts
        </button>
      </header>
      {error && (
        <div className="admin-alert-error">
          <CircleAlert size={18} />
          {error}
          <button onClick={() => setError('')} type="button">
            <X size={16} />
          </button>
        </div>
      )}
      <div className="admin-alert-metrics">
        {metrics.map(([label, value, Icon, tone]) => (
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
      <div className="admin-alert-panel">
        <div className="admin-alert-toolbar">
          <nav>
            {[
              ['all', 'All areas'],
              ...Object.entries(TYPES).map(([key, [label]]) => [key, label]),
            ].map(([key, label]) => (
              <button
                className={type === key ? 'active' : ''}
                onClick={() => setType(key)}
                type="button"
                key={key}
              >
                {label}
                {key !== 'all' && data.counts[key] ? <span>{data.counts[key]}</span> : null}
              </button>
            ))}
          </nav>
          <div>
            <label>
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search alerts"
              />
            </label>
            <label>
              <Filter size={15} />
              <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                <option value="all">All severity</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Information</option>
              </select>
            </label>
          </div>
        </div>
        <div className="admin-alert-feed">
          {loading ? (
            Array.from({ length: 5 }, (_, index) => <div className="alert-skeleton" key={index} />)
          ) : visible.length ? (
            visible.map((alert) => {
              const [label, Icon] = TYPES[alert.type] || ['System', BellRing];
              return (
                <article key={alert.id}>
                  <span className={`alert-icon is-${alert.severity}`}>
                    <Icon size={20} />
                  </span>
                  <div className="alert-copy">
                    <div>
                      <span className={`severity is-${alert.severity}`}>{alert.severity}</span>
                      <span className="area">{label}</span>
                      <span className="status">{String(alert.status).replaceAll('_', ' ')}</span>
                    </div>
                    <h3>{alert.title}</h3>
                    <p>{alert.description}</p>
                    <small>{new Date(alert.created_at).toLocaleString()}</small>
                  </div>
                  <button onClick={() => navigate(alert.navigate_to)} type="button">
                    Review <ArrowRight size={16} />
                  </button>
                </article>
              );
            })
          ) : (
            <div className="admin-alert-empty">
              <CheckCircle2 size={34} />
              <strong>No matching alerts</strong>
              <p>All monitored areas are clear for this filter.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
