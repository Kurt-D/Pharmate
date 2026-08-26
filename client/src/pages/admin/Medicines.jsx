import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes, ChevronLeft, ChevronRight, CircleAlert, Filter, Info, PackageCheck,
  PackageX, Pencil, Pill, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { api } from '../../api.js';
import '../../styles/admin-medicines.css';

const EMPTY_FORM = {
  generic_name: '', common_strength: '', dosage_form: 'Tablet', short_description: '',
  rx_class: 'RX', stock_quantity: 0,
};
const PAGE_SIZE = 10;

function stockState(stock) {
  const count = Number(stock || 0);
  if (count === 0) return { key: 'out', label: 'Out of stock' };
  if (count <= 10) return { key: 'low', label: 'Low stock' };
  return { key: 'in', label: 'In stock' };
}

export default function Medicines() {
  const [meds, setMeds] = useState([]);
  const [query, setQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api('/api/admin/medicines');
      setMeds(response.data); setError('');
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [query, stockFilter, typeFilter]);

  const counts = useMemo(() => meds.reduce((result, medicine) => {
    result.total += 1; result[stockState(medicine.stock_quantity).key] += 1; return result;
  }, { total: 0, in: 0, low: 0, out: 0 }), [meds]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return meds.filter((medicine) => {
      const matchesText = !needle || [medicine.generic_name, medicine.common_strength,
        medicine.dosage_form, medicine.short_description].filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
      const matchesStock = stockFilter === 'all' || stockState(medicine.stock_quantity).key === stockFilter;
      const matchesType = typeFilter === 'all' || medicine.rx_class === typeFilter;
      return matchesText && matchesStock && matchesType;
    });
  }, [meds, query, stockFilter, typeFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function openAdd() { setDrawer('add'); setForm(EMPTY_FORM); setError(''); }
  function openEdit(medicine) {
    setDrawer('edit');
    setForm({
      generic_name: medicine.generic_name || '', common_strength: medicine.common_strength || '',
      dosage_form: medicine.dosage_form || 'Tablet', short_description: medicine.short_description || '',
      rx_class: medicine.rx_class || 'RX', stock_quantity: Number(medicine.stock_quantity || 0),
      id: medicine.id,
    });
    setError('');
  }
  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: name === 'stock_quantity' ? Number(value) : value }));
  }

  async function saveMedicine(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api(drawer === 'edit' ? `/api/admin/medicines/${form.id}` : '/api/admin/medicines', {
        method: drawer === 'edit' ? 'PUT' : 'POST', body: form,
      });
      setNotice(drawer === 'edit' ? `${form.generic_name} was updated.` : `${form.generic_name} was added to the formulary.`);
      setDrawer(null); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  }

  async function deleteMedicine() {
    if (!deleteTarget) return;
    setSaving(true); setError('');
    try {
      await api(`/api/admin/medicines/${deleteTarget.id}`, { method: 'DELETE' });
      setNotice(`${deleteTarget.generic_name} was removed.`); setDeleteTarget(null); await load();
    } catch (requestError) { setError(requestError.message); setDeleteTarget(null); }
    finally { setSaving(false); }
  }

  const summary = [
    ['Total medicines', counts.total, Pill, 'blue'], ['In stock', counts.in, PackageCheck, 'green'],
    ['Low stock', counts.low, CircleAlert, 'amber'], ['Out of stock', counts.out, PackageX, 'red'],
  ];

  return <section className={`admin-medicine-workspace${drawer ? ' has-drawer' : ''}`}>
    <header className="admin-medicine-heading">
      <div><span>MEDICINE INVENTORY</span><h2>Manage medications</h2>
        <p>Maintain the medicine formulary, descriptions, classification, and available stock.</p></div>
      <button onClick={openAdd} type="button"><Plus size={18} />Add medicine</button>
    </header>

    {error && <div className="admin-medicine-message is-error" role="alert"><CircleAlert size={18} /><span>{error}</span><button onClick={() => setError('')} type="button" aria-label="Dismiss error"><X size={16} /></button></div>}
    {notice && <div className="admin-medicine-message is-success" role="status"><ShieldCheck size={18} /><span>{notice}</span><button onClick={() => setNotice('')} type="button" aria-label="Dismiss message"><X size={16} /></button></div>}

    <div className="admin-medicine-layout">
      <main>
        <div className="admin-medicine-toolbar">
          <button onClick={openAdd} type="button" className="add"><Plus size={17} />Add medicine</button>
          <label className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search medicine, strength, or form" /></label>
          <label><Filter size={15} /><select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} aria-label="Filter by stock"><option value="all">All stock levels</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></label>
          <label><Pill size={15} /><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by medicine type"><option value="all">All types</option><option value="OTC">OTC</option><option value="RX">Prescription</option></select></label>
          <button onClick={load} disabled={loading} type="button" className="refresh" title="Refresh medicines"><RefreshCw size={17} className={loading ? 'is-spinning' : ''} /></button>
        </div>

        <div className="admin-medicine-summary">{summary.map(([label, value, Icon, tone]) =>
          <article className={`tone-${tone}`} key={label}><span><Icon size={20} /></span><div><small>{label}</small><strong>{value}</strong></div></article>)}</div>

        <section className="admin-medicine-list">
          <header><div><h3>Medicine list</h3><p>{filtered.length} medicines found</p></div><span>Low stock threshold: 10 units</span></header>
          <div className="admin-medicine-table-wrap"><table>
            <thead><tr><th>#</th><th>Medicine</th><th>Strength &amp; form</th><th>Type</th><th>Stock</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{loading ? Array.from({ length: 6 }, (_, index) => <tr className="skeleton" key={index}><td colSpan="8"><span /></td></tr>)
              : visible.length ? visible.map((medicine, index) => {
                const status = stockState(medicine.stock_quantity);
                return <tr key={medicine.id}>
                  <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td><div className="medicine-name"><span><Pill size={17} /></span><div><strong>{medicine.generic_name}</strong>{medicine.is_provisional ? <small>Pending pharmacist verification</small> : <small>Verified formulary item</small>}</div></div></td>
                  <td><strong>{medicine.common_strength || 'Not specified'}</strong><small>{medicine.dosage_form || 'Form not specified'}</small></td>
                  <td><span className={`medicine-type is-${medicine.rx_class?.toLowerCase()}`}>{medicine.rx_class === 'OTC' ? 'OTC' : 'Rx'}</span></td>
                  <td><b className={`stock-count is-${status.key}`}>{Number(medicine.stock_quantity || 0)}</b></td>
                  <td><p className="medicine-description">{medicine.short_description || 'No description available.'}</p></td>
                  <td><span className={`stock-status is-${status.key}`}>{status.key === 'in' ? <PackageCheck size={14} /> : <CircleAlert size={14} />}{status.label}</span></td>
                  <td><div className="medicine-actions"><button onClick={() => openEdit(medicine)} type="button" title="Edit medicine"><Pencil size={16} /></button><button className="danger" onClick={() => setDeleteTarget(medicine)} type="button" title="Delete medicine"><Trash2 size={16} /></button></div></td>
                </tr>;
              }) : <tr><td colSpan="8"><div className="admin-medicine-empty"><Boxes size={34} /><strong>No medicines found</strong><p>Adjust the filters or add a new medicine.</p><button onClick={openAdd} type="button"><Plus size={16} />Add medicine</button></div></td></tr>}</tbody>
          </table></div>
          <footer><span>Showing {filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span><nav aria-label="Medicine table pages"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} type="button"><ChevronLeft size={15} /></button>{Array.from({ length: Math.min(pages, 5) }, (_, index) => { const number = index + 1; return <button className={page === number ? 'active' : ''} onClick={() => setPage(number)} type="button" key={number}>{number}</button>; })}<button disabled={page === pages} onClick={() => setPage((value) => value + 1)} type="button"><ChevronRight size={15} /></button></nav></footer>
        </section>
      </main>

      {drawer && <aside className="admin-medicine-drawer">
        <header><div><span><Pill size={20} /></span><div><small>{drawer === 'edit' ? 'UPDATE FORMULARY' : 'NEW FORMULARY ITEM'}</small><h3>{drawer === 'edit' ? 'Edit medicine' : 'Add medicine'}</h3></div></div><button onClick={() => setDrawer(null)} type="button" aria-label="Close form"><X size={19} /></button></header>
        <form onSubmit={saveMedicine}>
          <label><span>Medicine name <b>*</b></span><input name="generic_name" value={form.generic_name} onChange={updateField} placeholder="e.g., Paracetamol" required /></label>
          <div className="form-row"><label><span>Strength <b>*</b></span><input name="common_strength" value={form.common_strength} onChange={updateField} placeholder="e.g., 500 mg" required /></label><label><span>Form <b>*</b></span><select name="dosage_form" value={form.dosage_form} onChange={updateField}><option>Tablet</option><option>Capsule</option><option>Syrup</option><option>Suspension</option><option>Solution</option><option>Injection</option><option>Cream</option><option>Ointment</option><option>Inhaler</option><option>Eye drops</option></select></label></div>
          <div className="form-row"><label><span>Classification <b>*</b></span><select name="rx_class" value={form.rx_class} onChange={updateField}><option value="RX">Prescription (Rx)</option><option value="OTC">Over the counter</option></select></label><label><span>Available stock <b>*</b></span><input name="stock_quantity" type="number" min="0" max="1000000" value={form.stock_quantity} onChange={updateField} required /></label></div>
          <label><span>Description <b>*</b></span><textarea name="short_description" value={form.short_description} onChange={updateField} placeholder="Brief purpose and medicine description" rows="5" required /></label>
          <aside><Info size={18} /><p><b>Stock status updates automatically.</b> 0 is out of stock, 1–10 is low stock, and more than 10 is in stock. New entries require pharmacist verification.</p></aside>
          <footer><button type="submit" className="primary" disabled={saving}><Save size={17} />{saving ? 'Saving…' : drawer === 'edit' ? 'Save changes' : 'Save medicine'}</button><button type="button" onClick={() => setDrawer(null)} disabled={saving}>Cancel</button></footer>
        </form>
      </aside>}
    </div>

    {deleteTarget && <div className="admin-medicine-confirm-backdrop"><section className="admin-medicine-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-medicine-title"><span><Trash2 size={24} /></span><h3 id="delete-medicine-title">Delete {deleteTarget.generic_name}?</h3><p>The medicine can only be deleted if no patient record currently uses it. Otherwise, set the stock to 0.</p><div><button onClick={() => setDeleteTarget(null)} type="button" disabled={saving}>Keep medicine</button><button className="danger" onClick={deleteMedicine} type="button" disabled={saving}>{saving ? 'Deleting…' : 'Delete medicine'}</button></div></section></div>}
  </section>;
}
