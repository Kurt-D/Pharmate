import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { adminRead } from '../../lib/adminRead.js';

const emptyPharmacist = () => ({
  full_name: '', email: '', branch_id: '', is_active: false,
  license_number: '', license_jurisdiction: '', license_status: 'PENDING', license_expires_on: '', license_evidence_url: '',
  profile: { professional_title: 'Licensed Pharmacist', specialization: '', languages: '', biography: '', patient_visible: false, chat_available: false },
});
const prettyDate = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : 'Not recorded';

export default function ClinicalGovernance() {
  const [pharmacists, setPharmacists] = useState([]);
  const [summary, setSummary] = useState({});
  const [rules, setRules] = useState({});
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [directory, ruleData] = await Promise.all([adminRead('/api/admin/pharmacists'), adminRead('/api/admin/rule-governance')]);
      setPharmacists(directory.data?.pharmacists || []); setSummary(directory.data?.summary || {}); setRules(ruleData.data?.summary || {}); setError('');
    } catch (requestError) { setError(requestError.message || 'Clinical governance information could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!form) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [form]);
  const visible = useMemo(() => pharmacists.filter((item) => `${item.full_name} ${item.email} ${item.license_number || ''} ${item.branch || ''}`.toLowerCase().includes(search.toLowerCase())), [pharmacists, search]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateProfile = (key, value) => setForm((current) => ({ ...current, profile: { ...current.profile, [key]: value } }));
  const edit = (item) => {
    setNotice(''); setError('');
    setForm({ ...emptyPharmacist(), ...item, is_active: Boolean(item.is_active), license_expires_on: item.license_expires_on || '', profile: { ...emptyPharmacist().profile, professional_title: item.professional_title || '', specialization: item.specialization || '', languages: item.languages || '', biography: item.biography || '', patient_visible: Boolean(item.patient_visible), chat_available: Boolean(item.chat_available) } });
  };
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const result = await api(form.id ? `/api/admin/pharmacists/${form.id}` : '/api/admin/pharmacists', { method: form.id ? 'PUT' : 'POST', body: form });
      setNotice(result.data?.message || 'Pharmacist record saved.'); setForm(null); await load();
    } catch (requestError) { setError(requestError.message || 'The pharmacist record could not be saved.'); }
    finally { setSaving(false); }
  };

  return <section className="admin-dashboard-section governance-workspace" aria-label="Pharmacist management">
    <div className="governance-actions admin-workspace-actions"><button className="btn btn-outline-primary" disabled={loading} onClick={load} type="button">Refresh</button><button className="btn btn-primary" onClick={() => { setForm(emptyPharmacist()); setNotice(''); setError(''); }} type="button">Add pharmacist</button></div>
    {error && <div className="admin-error" role="alert">{error}</div>}{notice && <div className="admin-success" role="status">{notice}</div>}
    <div className="admin-grid admin-stats governance-stats"><article className="admin-card admin-stat"><div><strong>{summary.total ?? 0}</strong><small>Pharmacists</small></div></article><article className="admin-card admin-stat"><div><strong>{summary.eligible ?? 0}</strong><small>Clinically eligible</small></div></article><article className="admin-card admin-stat"><div><strong>{summary.pending ?? 0}</strong><small>Credential pending</small></div></article><article className="admin-card admin-stat"><div><strong>{summary.expiring_soon ?? 0}</strong><small>Expiring in 30 days</small></div></article></div>
    <article className="admin-card governance-table-card"><div className="governance-table-heading"><div><h3>Professional directory</h3><p className="admin-sub">{rules.ready ?? 0} medicine rules are ready for use. Governance status never authorizes a clinical decision.</p></div><label className="governance-search"><span className="visually-hidden">Search pharmacists</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, license" /></label></div>
      {loading ? <p className="admin-note">Loading pharmacist governance records…</p> : visible.length === 0 ? <p className="admin-note">No pharmacist records match this search.</p> : <div className="governance-table-scroll"><table className="governance-table"><thead><tr><th>Pharmacist</th><th>Credential</th><th>Branch</th><th>Expiration</th><th>Account</th><th>Patient profile</th><th /></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong>{item.full_name}</strong><small>{item.email}</small></td><td><span className={`governance-badge is-${String(item.credential_status).toLowerCase()}`}>{item.credential_status}</span><small>{item.license_number || 'No license number'}</small></td><td>{item.branch || 'Unassigned'}</td><td>{prettyDate(item.license_expires_on)}</td><td><span className={`governance-badge ${item.is_active ? 'is-active' : 'is-inactive'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td><td>{item.patient_visible ? (item.chat_available ? 'Visible & chat enabled' : 'Visible') : 'Hidden'}</td><td><button className="btn btn-sm btn-outline-primary" onClick={() => edit(item)} type="button">Manage</button></td></tr>)}</tbody></table></div>}</article>
    {form && <div className="governance-modal"><div className="governance-dialog" role="dialog" aria-modal="true" aria-labelledby="pharmacist-form-heading"><div className="governance-dialog-header"><div><span className="admin-kicker">{form.id ? 'EDIT PHARMACIST' : 'NEW PHARMACIST'}</span><h3 id="pharmacist-form-heading">{form.id ? form.full_name : 'Add pharmacist'}</h3></div><button className="governance-close" onClick={() => setForm(null)} aria-label="Close" type="button">×</button></div><form onSubmit={submit}><fieldset><legend>Account information</legend><label>Full name<input required value={form.full_name} onChange={(event) => update('full_name', event.target.value)} /></label>{!form.id && <label>Email address<input required type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></label>}<label>Branch ID<input value={form.branch_id || ''} onChange={(event) => update('branch_id', event.target.value)} placeholder="Optional branch ID" /></label><label className="governance-check"><input type="checkbox" checked={form.is_active} onChange={(event) => update('is_active', event.target.checked)} />Activate account and send secure email verification</label></fieldset><fieldset><legend>Professional credential</legend><label>License number<input value={form.license_number || ''} onChange={(event) => update('license_number', event.target.value)} /></label><label>Jurisdiction<input value={form.license_jurisdiction || ''} onChange={(event) => update('license_jurisdiction', event.target.value)} /></label><label>Credential status<select value={form.license_status} onChange={(event) => update('license_status', event.target.value)}><option value="PENDING">Pending</option><option value="VERIFIED">Verified</option><option value="SUSPENDED">Suspended</option><option value="EXPIRED">Expired</option></select></label><label>Expiration date<input type="date" value={form.license_expires_on || ''} onChange={(event) => update('license_expires_on', event.target.value)} /></label><label>Regulator evidence URL<input type="url" value={form.license_evidence_url || ''} onChange={(event) => update('license_evidence_url', event.target.value)} placeholder="https://…" /></label></fieldset><fieldset><legend>Patient-visible professional profile</legend><label>Professional title<input value={form.profile.professional_title} onChange={(event) => updateProfile('professional_title', event.target.value)} /></label><label>Specialization<input value={form.profile.specialization} onChange={(event) => updateProfile('specialization', event.target.value)} /></label><label>Languages<input value={form.profile.languages} onChange={(event) => updateProfile('languages', event.target.value)} /></label><label className="governance-wide">Professional biography<textarea rows="3" value={form.profile.biography} onChange={(event) => updateProfile('biography', event.target.value)} /></label><label className="governance-check"><input type="checkbox" checked={form.profile.patient_visible} onChange={(event) => updateProfile('patient_visible', event.target.checked)} />Show in the patient directory</label><label className="governance-check"><input type="checkbox" checked={form.profile.chat_available} onChange={(event) => updateProfile('chat_available', event.target.checked)} />Allow patient chat when eligible</label></fieldset><footer><button className="btn btn-outline-primary" onClick={() => setForm(null)} type="button">Cancel</button><button className="btn btn-primary" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save pharmacist'}</button></footer></form></div></div>}
  </section>;
}
