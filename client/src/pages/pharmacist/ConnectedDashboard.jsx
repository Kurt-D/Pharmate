import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellRing,
  ClipboardCheck,
  Database,
  MessageSquareText,
  RefreshCw,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { api } from '../../api.js';
import { useRealtime } from '../../hooks/useRealtime.js';

const CARDS = [
  ['pending_validations', 'Prescription validation', ClipboardCheck, '/pharmacist/validation'],
  ['open_inquiries', 'Open inquiries', MessageSquareText, '/pharmacist/inquiries'],
  ['open_orders', 'Active orders', ShoppingBag, '/pharmacist/orders'],
  ['followups', 'Adherence follow-ups', BellRing, '/pharmacist/alerts'],
  ['pending_curation', 'Formulary review', Database, '/pharmacist/curation'],
  ['patients', 'Monitored patients', Users, '/pharmacist/patients'],
];

export default function ConnectedPharmacistDashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api('/api/pharmacist/summary');
      setSummary(response.data);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Unable to load the pharmacist dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  useRealtime((event) => {
    if (
      [
        'LIVE_DISPENSE_LOG',
        'MEDICATION_CREATED',
        'MEDICATION_UPDATED',
        'MEDICATION_STOPPED',
        'SCHEDULE_CONFIRMED',
        'ORDER_STATUS_CHANGED',
        'INQUIRY_UPDATED',
        'PRESCRIPTION_STATUS_CHANGED',
        'FORMULARY_UPDATED',
        'INVENTORY_UPDATED',
      ].includes(event)
    ) {
      load();
    }
  });

  return (
    <section className="ph-connected-dashboard">
      <header>
        <div>
          <span>LIVE CLINICAL WORKSPACE</span>
          <h2>Pharmacist overview</h2>
          <p>Current queues and monitoring totals from the PharMate database.</p>
        </div>
        <button disabled={loading} onClick={load} type="button">
          <RefreshCw className={loading ? 'is-spinning' : ''} size={18} /> Refresh
        </button>
      </header>

      {error ? (
        <div className="ph-connected-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="ph-connected-grid" aria-busy={loading}>
        {CARDS.map(([key, label, Icon, path]) => (
          <button key={key} onClick={() => navigate(path)} type="button">
            <span>
              <Icon size={24} />
            </span>
            <strong>{loading ? '—' : Number(summary[key] || 0)}</strong>
            <small>{label}</small>
          </button>
        ))}
      </div>

      {!loading && CARDS.every(([key]) => Number(summary[key] || 0) === 0) ? (
        <div className="ph-connected-empty">
          <ClipboardCheck size={34} />
          <strong>No pending clinical work</strong>
          <p>New validations, inquiries, orders, and alerts will appear here automatically.</p>
        </div>
      ) : null}
    </section>
  );
}
