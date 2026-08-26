import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';

const EMPTY_FORM = {
  generic_name: '',
  brand_names: '',
  min_interval_hours: '',
  max_daily_doses: '',
  default_interval_hours: '',
  meal_anchor_code: 'NONE',
  is_prn_default: false,
};

export default function DrugCuration() {
  const [queue, setQueue] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogClass, setCatalogClass] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const [queueResponse, catalogResponse] = await Promise.all([
        api('/api/pharmacist/pending-drugs'),
        api('/api/pharmacist/drugs?q=&limit=500'),
      ]);
      setQueue(queueResponse.data);
      setCatalog(catalogResponse.data);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function pick(item) {
    setSelected(item);
    setFlash('');
    setForm({ ...EMPTY_FORM, generic_name: item.drug_name_raw });
  }

  async function act(action) {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/pharmacist/pending-drugs/${selected.id}/curate`, {
        method: 'POST',
        body:
          action === 'approve'
            ? {
                action,
                generic_name: form.generic_name,
                brand_names: form.brand_names,
                min_interval_hours: form.min_interval_hours || null,
                max_daily_doses: form.max_daily_doses || null,
                default_interval_hours: form.default_interval_hours || null,
                meal_anchor_code: form.meal_anchor_code,
                is_prn_default: form.is_prn_default,
              }
            : { action },
      });
      setFlash(
        action === 'approve' ? 'Drug curated and medication activated.' : 'Request rejected.'
      );
      setSelected(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const visibleCatalog = useMemo(() => {
    if (!catalog) return [];
    const query = catalogSearch.trim().toLowerCase();
    return catalog.filter((medicine) => {
      if (catalogClass !== 'ALL' && medicine.rx_class !== catalogClass) return false;
      if (!query) return true;
      return [
        medicine.generic_name,
        medicine.therapeutic_category,
        medicine.drug_class,
        medicine.common_uses,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [catalog, catalogClass, catalogSearch]);

  return (
    <>
      <h2 className="h4 fw-bold mb-1">Drug Curation</h2>
      <p className="text-muted">
        Review drugs patients encoded that aren&apos;t in the verified formulary yet (D-D).
        Approving adds the drug — pharmacist-signed — and makes the patient&apos;s medication
        schedulable.
      </p>

      {flash && <div className="alert alert-success py-2">{flash}</div>}
      {error && <div className="alert alert-warning py-2">{error}</div>}

      <div className="row g-3">
        {/* Queue list */}
        <div className="col-lg-5">
          <div className="pw-card p-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <strong>Pending for Curation</strong>
              <span className="badge bg-primary-subtle text-primary">
                {queue ? queue.length : '…'}
              </span>
            </div>
            {queue === null && <div className="text-muted small">Loading…</div>}
            {queue && queue.length === 0 && (
              <div className="text-muted small py-3 text-center">Queue is empty. 🎉</div>
            )}
            {queue &&
              queue.map((item) => (
                <button
                  key={item.id}
                  className={
                    'btn w-100 text-start p-2 mb-2 ' +
                    (selected?.id === item.id ? 'btn-primary' : 'btn-light')
                  }
                  onClick={() => pick(item)}
                >
                  <div className="d-flex justify-content-between">
                    <strong>{item.drug_name_raw}</strong>
                    <span className="pw-code">{item.patient_code}</span>
                  </div>
                  <div className="small opacity-75">
                    frequency: {item.frequency_raw || '—'} ·{' '}
                    {new Date(item.requested_at).toLocaleString()}
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Curation action panel */}
        <div className="col-lg-7">
          <div className="pw-card p-3">
            {!selected ? (
              <div className="text-muted small py-5 text-center">Select a request to curate.</div>
            ) : (
              <>
                <div className="mb-3">
                  <strong>Curate: {selected.drug_name_raw}</strong>
                  <div className="small text-muted">
                    Patient <span className="pw-code">{selected.patient_code}</span>
                  </div>
                </div>

                <div className="row g-2">
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Generic name</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.generic_name}
                      onChange={(e) => set('generic_name', e.target.value)}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Brand names (comma-sep)</label>
                    <input
                      className="form-control form-control-sm"
                      value={form.brand_names}
                      onChange={(e) => set('brand_names', e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-semibold">Min interval (h)</label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={form.min_interval_hours}
                      onChange={(e) => set('min_interval_hours', e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-semibold">Max daily doses</label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={form.max_daily_doses}
                      onChange={(e) => set('max_daily_doses', e.target.value)}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small fw-semibold">Default interval (h)</label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={form.default_interval_hours}
                      onChange={(e) => set('default_interval_hours', e.target.value)}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Meal anchor</label>
                    <select
                      className="form-select form-select-sm"
                      value={form.meal_anchor_code}
                      onChange={(e) => set('meal_anchor_code', e.target.value)}
                    >
                      <option>NONE</option>
                      <option>AC</option>
                      <option>PC</option>
                      <option>WITH_MEAL</option>
                      <option>HS</option>
                    </select>
                  </div>
                  <div className="col-md-6 d-flex align-items-end">
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="prndefault"
                        checked={form.is_prn_default}
                        onChange={(e) => set('is_prn_default', e.target.checked)}
                      />
                      <label className="form-check-label small" htmlFor="prndefault">
                        PRN by default
                      </label>
                    </div>
                  </div>
                </div>

                <div className="d-flex gap-2 mt-4">
                  <button
                    className="btn btn-primary"
                    disabled={busy || !form.generic_name.trim()}
                    onClick={() => act('approve')}
                  >
                    {busy ? 'Saving…' : 'Approve & add to formulary'}
                  </button>
                  <button
                    className="btn btn-outline-danger"
                    disabled={busy}
                    onClick={() => act('reject')}
                  >
                    Reject
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <section className="pw-card pw-drug-catalog mt-3">
        <div className="pw-drug-catalog__header">
          <div>
            <div className="d-flex align-items-center gap-2">
              <h3>Medicine Catalog</h3>
              <span className="badge bg-primary-subtle text-primary">
                {catalog ? catalog.length : '…'} medicines
              </span>
            </div>
            <p>Shared catalog available to patients, pharmacists, and administrators.</p>
          </div>
          <div className="pw-drug-catalog__filters">
            <input
              aria-label="Search medicine catalog"
              className="form-control form-control-sm"
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder="Search name, category, or use"
              type="search"
              value={catalogSearch}
            />
            <select
              aria-label="Filter by prescription class"
              className="form-select form-select-sm"
              onChange={(event) => setCatalogClass(event.target.value)}
              value={catalogClass}
            >
              <option value="ALL">All classes</option>
              <option value="OTC">OTC</option>
              <option value="RX">Prescription (Rx)</option>
            </select>
          </div>
        </div>

        {catalog === null ? (
          <div className="pw-drug-catalog__empty">Loading medicine catalog…</div>
        ) : visibleCatalog.length === 0 ? (
          <div className="pw-drug-catalog__empty">No medicines match your search.</div>
        ) : (
          <>
            <div className="pw-drug-catalog__count">
              Showing {visibleCatalog.length} of {catalog.length}
            </div>
            <div className="pw-drug-catalog__table-wrap">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Generic medicine</th>
                    <th>Class</th>
                    <th>Category</th>
                    <th>Strength / form</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCatalog.map((medicine) => (
                    <tr key={medicine.id}>
                      <td>
                        <strong>{medicine.generic_name}</strong>
                        {medicine.drug_class && <small>{medicine.drug_class}</small>}
                      </td>
                      <td>
                        <span className={`pw-drug-class ${medicine.rx_class === 'OTC' ? 'otc' : 'rx'}`}>
                          {medicine.rx_class === 'OTC' ? 'OTC' : 'Rx'}
                        </span>
                      </td>
                      <td>{medicine.therapeutic_category || '—'}</td>
                      <td>
                        {[medicine.common_strength, medicine.dosage_form]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                      <td>
                        <span className={`pw-drug-status ${medicine.availability ? 'available' : 'unavailable'}`}>
                          {medicine.availability ? 'Available' : 'Unavailable'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
