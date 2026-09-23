import { useCallback, useEffect, useState } from 'react';
import { api, apiBlobUrl } from '../../api.js';

const TRANSITIONS = { refill: ['pending', 'processing', 'ready', 'cancelled'], delivery: ['pending', 'processing', 'out_for_delivery', 'delivered', 'cancelled'] };

export default function OrdersQueue() {
  const [orders, setOrders] = useState({ refills: [], deliveries: [] });
  const [kind, setKind] = useState('refill');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [prescriptionUrl, setPrescriptionUrl] = useState('');
  const load = useCallback(async () => {
    try { const response = await api('/api/pharmacist/orders'); setOrders(response.data); setError(''); }
    catch (requestError) { setError(requestError.message || 'Unable to load orders.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function update(kind, id, status) {
    try { await api(`/api/pharmacist/orders/${kind}/${id}/status`, { method: 'POST', body: { status } }); await load(); }
    catch (requestError) { setError(requestError.message); }
  }
  async function viewPrescription(kind, id) {
    try { if (prescriptionUrl) URL.revokeObjectURL(prescriptionUrl); setPrescriptionUrl(await apiBlobUrl(`/api/pharmacist/orders/${kind}/${id}/prescription`)); }
    catch (requestError) { setError(requestError.message); }
  }
  const rows = (kind === 'refill' ? orders.refills : orders.deliveries).filter((order) =>
    `${order.patient_code || ''} ${order.drug || ''} ${order.status || ''}`.toLowerCase().includes(query.trim().toLowerCase())
  );
  return <section className="px-orders-workspace">{error && <div className="alert alert-warning">{error}</div>}{prescriptionUrl && <div className="pm-confirm-backdrop"><div className="pm-confirm-dialog" aria-modal="true" role="dialog"><h3>Order prescription</h3><img alt="Patient-submitted prescription" src={prescriptionUrl} style={{ maxWidth: '100%' }} /><button onClick={() => { URL.revokeObjectURL(prescriptionUrl); setPrescriptionUrl(''); }} type="button">Close</button></div></div>}<nav className="px-orders-workspace__tabs" aria-label="Order type"><button aria-selected={kind === 'refill'} className={kind === 'refill' ? 'is-active' : ''} onClick={() => setKind('refill')} type="button">Refill orders <b>{orders.refills.length}</b></button><button aria-selected={kind === 'delivery'} className={kind === 'delivery' ? 'is-active' : ''} onClick={() => setKind('delivery')} type="button">Delivery orders <b>{orders.deliveries.length}</b></button></nav><section className="pw-card px-orders-workspace__table"><div className="px-orders-workspace__filters"><input aria-label="Search orders" onChange={(event) => setQuery(event.target.value)} placeholder="Search patient ID, medicine, or status" type="search" value={query} /><button onClick={load} type="button">Refresh</button></div>{rows.length === 0 ? <p className="text-muted small mb-0">No open {kind} requests match this search.</p> : <div className="table-responsive"><table className="table table-sm align-middle mb-0"><thead><tr><th>Patient</th><th>Medicine</th><th>Quantity</th><th>Prescription</th><th>Status</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td><span className="pw-code">{order.patient_code}</span></td><td>{order.drug}</td><td>{order.quantity || 1}</td><td>{order.prescription_id ? <button className="btn btn-link btn-sm" onClick={() => viewPrescription(kind, order.id)} type="button">View Rx</button> : 'Not required'}</td><td><select aria-label={`Update ${kind} order status`} className="form-select form-select-sm" onChange={(event) => update(kind, order.id, event.target.value)} value={order.status}>{TRANSITIONS[kind].map((status) => <option key={status} value={status}>{status}</option>)}</select></td></tr>)}</tbody></table></div>}</section></section>;
}
