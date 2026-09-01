import { useCallback, useEffect, useMemo, useState } from 'react';
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
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(query)
      );
    });
  }, [catalog, catalogClass, catalogSearch]);

  return (
    <>
      <h2 className="h4 fw-bold mb-1">Drug Curation</h2>
      <p className="text-muted">
        Review medicines patients entered that are not yet in the pharmacy catalog. Adding a catalog
        entry does not verify its clinical scheduling rule. Approving adds the drug —
        pharmacist-signed — and makes the patient&apos;s medication schedulable.
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
                    {busy ? 'Saving…' : 'Approve catalog entry'}
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
                        <span
                          className={`pw-drug-class ${medicine.rx_class === 'OTC' ? 'otc' : 'rx'}`}
                        >
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
                        <span
                          className={`pw-drug-status ${medicine.availability ? 'available' : 'unavailable'}`}
                        >
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
      <ClinicalRuleVerification />
    </>
  );
}

const RULE_FIELDS = [
  ['common_strength', 'Strength', 'text'],
  ['dosage_form', 'Dosage form', 'text'],
  ['administration_route', 'Administration route', 'text'],
  ['supported_frequency_codes', 'Supported frequency codes (comma separated)', 'text'],
  ['frequency_default', 'Frequency code', 'text'],
  ['max_daily_doses', 'Maximum reminders per day', 'number'],
  ['min_interval_hours', 'Minimum interval (hours)', 'number'],
  ['administration_instruction', 'Administration instruction', 'text'],
  ['clinical_rationale', 'Patient-friendly timing explanation', 'text'],
  ['guidance_do', 'Verified Do guidance', 'text'],
  ['guidance_dont', 'Verified Don’t guidance', 'text'],
  ['clinical_source_name', 'Source organization/document', 'text'],
  ['evidence_source_url', 'Evidence URL (HTTPS)', 'url'],
  ['source_revision_date', 'Source revision date', 'date'],
  ['evidence_reviewed_at', 'Review date', 'date'],
];

function dateValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

function frequencyCodesValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.join(', ') : '';
  } catch {
    return String(value || '');
  }
}

function ClinicalRuleVerification() {
  const [rules, setRules] = useState(null);
  const [report, setReport] = useState(null);
  const [selectedRule, setSelectedRule] = useState(null);
  const [ruleForm, setRuleForm] = useState(null);
  const [status, setStatus] = useState('UNVERIFIED');
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [revisions, setRevisions] = useState([]);

  const loadRules = useCallback(async () => {
    const [rulesResponse, reportResponse] = await Promise.all([
      api(`/api/pharmacist/clinical-rules?status=${status}&q=${encodeURIComponent(query)}`),
      api('/api/pharmacist/clinical-rules/report'),
    ]);
    setRules(rulesResponse.data);
    setReport(reportResponse.data.summary);
  }, [query, status]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => loadRules().catch((error) => setMessage(error.message)),
      200
    );
    return () => window.clearTimeout(timer);
  }, [loadRules]);

  function pickRule(rule) {
    setSelectedRule(rule);
    setRuleForm({
      ...rule,
      source_revision_date: dateValue(rule.source_revision_date),
      evidence_reviewed_at: dateValue(rule.evidence_reviewed_at),
      supported_frequency_codes: frequencyCodesValue(rule.supported_frequency_codes),
    });
    setReason('');
    setMessage('');
    api(`/api/pharmacist/clinical-rules/${rule.id}/revisions`)
      .then((response) => setRevisions(response.data))
      .catch((error) => setMessage(error.message));
  }

  async function decide(action) {
    setWorking(true);
    setMessage('');
    try {
      const response = await api(`/api/pharmacist/clinical-rules/${selectedRule.id}/decision`, {
        method: 'POST',
        body: { ...ruleForm, action, reason },
      });
      setMessage(
        action === 'VERIFY'
          ? 'Clinical scheduling rule verified.'
          : action === 'REJECT'
            ? 'Rule rejected with an audit reason.'
            : action === 'RETIRE'
              ? 'Rule retired with an audit reason.'
              : 'Rule saved for review.'
      );
      setSelectedRule(null);
      setRuleForm(null);
      await loadRules();
      return response;
    } catch (error) {
      const consistency = error.body?.consistency;
      setMessage(
        consistency
          ? `Cannot verify. Missing: ${consistency.missing_fields.join(', ') || 'none'}. Conflicts: ${consistency.conflicts.join(', ') || 'none'}.`
          : error.message
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="pw-card mt-3 p-3">
      <div className="d-flex flex-wrap justify-content-between gap-2 align-items-start mb-3">
        <div>
          <h3 className="h5 mb-1">Clinical Rule Verification</h3>
          <p className="text-muted mb-0">
            One-time evidence review for formulary scheduling rules. This does not approve an
            individual patient schedule.
          </p>
        </div>
        {report && (
          <div className="d-flex flex-wrap gap-2">
            <span className="badge bg-secondary">{report.total} total</span>
            <span className="badge bg-success">{report.schedule_verified} verified</span>
            <span className="badge bg-warning text-dark">{report.in_review} in review</span>
            <span className="badge bg-light text-dark">{report.incomplete_rules} incomplete</span>
            <span className="badge bg-info text-dark">{report.rule_records} rule records</span>
            {report.missing_rule_records > 0 && (
              <span className="badge bg-danger">{report.missing_rule_records} missing records</span>
            )}
            {report.duplicate_variants > 0 && (
              <span className="badge bg-danger">
                {report.duplicate_variants} duplicate variants
              </span>
            )}
          </div>
        )}
      </div>
      {message && (
        <div className="alert alert-info py-2" role="status">
          {message}
        </div>
      )}
      <div className="row g-3">
        <div className="col-lg-5">
          <div className="d-flex gap-2 mb-2">
            <input
              className="form-control"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search medicine"
              value={query}
            />
            <select
              className="form-select"
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="IN_REVIEW">In review</option>
              <option value="UNVERIFIED">Unverified</option>
              <option value="REJECTED">Rejected</option>
              <option value="VERIFIED">Verified</option>
              <option value="RETIRED">Retired</option>
            </select>
          </div>
          <div className="list-group" style={{ maxHeight: 560, overflowY: 'auto' }}>
            {rules?.map((rule) => (
              <button
                className={`list-group-item list-group-item-action ${selectedRule?.id === rule.id ? 'active' : ''}`}
                key={rule.id}
                onClick={() => pickRule(rule)}
                type="button"
              >
                <strong>{rule.generic_name}</strong>
                <small className="d-block">
                  {rule.common_strength || 'No strength'} · {rule.dosage_form || 'No form'}
                </small>
                {!rule.consistency.valid && (
                  <small className="d-block mt-1">
                    {rule.consistency.missing_fields.length} missing ·{' '}
                    {rule.consistency.conflicts.length} conflicts
                  </small>
                )}
              </button>
            ))}
            {rules?.length === 0 && (
              <div className="text-muted text-center p-4">No medicines in this status.</div>
            )}
          </div>
        </div>
        <div className="col-lg-7">
          {!ruleForm ? (
            <div className="text-muted text-center p-5">
              Select a medicine to review its evidence and scheduling rule.
            </div>
          ) : (
            <div className="row g-2">
              <div className="col-12">
                <strong>{ruleForm.generic_name}</strong>
                <div className="small text-muted">
                  Catalog: {ruleForm.catalog_status} · Rule version {ruleForm.rule_version}
                </div>
              </div>
              {RULE_FIELDS.map(([field, label, type]) => (
                <div
                  className={
                    field.includes('instruction') ||
                    field.includes('url') ||
                    field.includes('source_name')
                      ? 'col-12'
                      : 'col-md-6'
                  }
                  key={field}
                >
                  <label className="form-label small fw-semibold">{label}</label>
                  <input
                    className="form-control"
                    min={type === 'number' ? '0' : undefined}
                    onChange={(event) =>
                      setRuleForm((current) => ({ ...current, [field]: event.target.value }))
                    }
                    step={field === 'min_interval_hours' ? '0.25' : undefined}
                    type={type}
                    value={ruleForm[field] ?? ''}
                  />
                </div>
              ))}
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Food rule</label>
                <select
                  className="form-select"
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, food_rule: event.target.value }))
                  }
                  value={ruleForm.food_rule || 'NONE'}
                >
                  <option>NONE</option>
                  <option>WITH_MEAL</option>
                  <option>EMPTY_STOMACH</option>
                  <option>BEFORE_MEAL</option>
                  <option>AFTER_MEAL</option>
                  <option>BEDTIME</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Release type</label>
                <select
                  className="form-select"
                  onChange={(event) =>
                    setRuleForm((current) => ({ ...current, release_type: event.target.value }))
                  }
                  value={ruleForm.release_type || ''}
                >
                  <option value="">Choose formulation</option>
                  <option value="IMMEDIATE_RELEASE">Immediate release</option>
                  <option value="EXTENDED_RELEASE">Extended release</option>
                  <option value="DELAYED_RELEASE">Delayed release</option>
                  <option value="NOT_APPLICABLE">Not applicable</option>
                  <option value="UNKNOWN">Unknown (cannot verify)</option>
                </select>
              </div>
              {ruleForm.evidence_source_url && (
                <div className="col-12">
                  <a href={ruleForm.evidence_source_url} rel="noreferrer" target="_blank">
                    Open authoritative source in a new tab
                  </a>
                </div>
              )}
              <div className="col-12">
                <label className="form-label small fw-semibold">
                  Decision reason (required for rejection or retirement)
                </label>
                <textarea
                  className="form-control"
                  maxLength="500"
                  onChange={(event) => setReason(event.target.value)}
                  rows="2"
                  value={reason}
                />
              </div>
              <div className="col-12 d-flex flex-wrap gap-2 mt-3">
                <button
                  className="btn btn-outline-primary"
                  disabled={working}
                  onClick={() => decide('SUBMIT')}
                  type="button"
                >
                  Save for Review
                </button>
                <button
                  className="btn btn-success"
                  disabled={working}
                  onClick={() => decide('VERIFY')}
                  type="button"
                >
                  Run Checks & Verify
                </button>
                <button
                  className="btn btn-outline-danger"
                  disabled={working || !reason.trim()}
                  onClick={() => decide('REJECT')}
                  type="button"
                >
                  Reject Rule
                </button>
                <button
                  className="btn btn-outline-secondary"
                  disabled={working || !reason.trim()}
                  onClick={() => decide('RETIRE')}
                  type="button"
                >
                  Retire Rule
                </button>
              </div>
              <div className="col-12 mt-3">
                <h4 className="h6">Revision history</h4>
                {revisions.length ? (
                  <ul className="list-group">
                    {revisions.map((revision) => (
                      <li className="list-group-item" key={revision.id}>
                        <strong>
                          Version {revision.rule_version} · {revision.action}
                        </strong>
                        <span className="d-block small text-muted">
                          {revision.reviewed_by_name} ·{' '}
                          {new Date(revision.created_at).toLocaleString()}
                        </span>
                        {revision.reason && (
                          <span className="d-block small">{revision.reason}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted small">No decisions recorded yet.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
