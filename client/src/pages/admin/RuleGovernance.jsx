import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FileClock, Info, LoaderCircle, Save, Search, ShieldCheck } from 'lucide-react';
import { api } from '../../api.js';
import '../../styles/admin-rule-governance.css';

const ACTIONS = ['ALLOW', 'REVIEW', 'BLOCK'];
const FOOD_RULES = ['NONE', 'WITH_MEAL', 'BEFORE_MEAL', 'AFTER_MEAL', 'EMPTY_STOMACH', 'BEDTIME'];
const RELEASE_TYPES = ['IMMEDIATE_RELEASE', 'EXTENDED_RELEASE', 'DELAYED_RELEASE', 'NOT_APPLICABLE'];
const SCHEDULE_TYPES = ['FIXED_DAILY', 'FIXED_INTERVAL', 'MEAL_ANCHORED', 'BEDTIME', 'SHORT_COURSE', 'PRN_TRACKER'];
const REVIEW_FLAGS = [
  ['age_reviewed', 'Age'],
  ['weight_reviewed', 'Weight'],
  ['allergies_reviewed', 'Allergies'],
  ['conditions_reviewed', 'Conditions'],
  ['interactions_reviewed', 'Interactions'],
];

function asDate(value) {
  return value ? String(value).slice(0, 10) : '';
}

function editModel(row) {
  return {
    ...row,
    supported_frequency_codes: (row.supported_frequency_codes || []).join(', '),
    allergy_terms: (row.allergy_terms || []).join(', '),
    source_revision_date: asDate(row.source_revision_date),
    evidence_reviewed_at: asDate(row.evidence_reviewed_at),
    safety_source_revision_date: asDate(row.safety_source_revision_date),
    condition_rules_text: (row.condition_rules || [])
      .map((item) => `${item.term}|${item.action}|${item.message || ''}`)
      .join('\n'),
  };
}

function parseConditionRules(value) {
  return String(value || '')
    .split('\n')
    .map((line) => {
      const [term, action = 'REVIEW', ...message] = line.split('|');
      return { term: term.trim(), action: action.trim().toUpperCase(), message: message.join('|').trim() };
    })
    .filter((item) => item.term);
}

function Status({ value }) {
  return <span className={`arg-status arg-status--${String(value || '').toLowerCase()}`}>{String(value || 'INCOMPLETE').replaceAll('_', ' ')}</span>;
}

export default function RuleGovernance() {
  const [data, setData] = useState({ summary: {}, medicines: [] });
  const [credentialData, setCredentialData] = useState({ summary: {}, pharmacists: [] });
  const [credentialDraft, setCredentialDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [credentialSaving, setCredentialSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [response, credentials] = await Promise.all([
        api('/api/admin/rule-governance'),
        api('/api/admin/pharmacist-credentials'),
      ]);
      setData(response.data);
      setCredentialData(credentials.data);
      const nextCredential = credentialDraft?.id
        ? credentials.data.pharmacists.find((item) => item.id === credentialDraft.id)
        : credentials.data.pharmacists[0];
      if (nextCredential) {
        setCredentialDraft({
          ...nextCredential,
          license_expires_on: asDate(nextCredential.license_expires_on),
        });
      }
      const nextId = selectedId || response.data.medicines[0]?.id || '';
      setSelectedId(nextId);
      const row = response.data.medicines.find((item) => item.id === nextId);
      if (row) setDraft(editModel(row));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  // The first load establishes both selections; subsequent refreshes are explicit after saves.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    api(`/api/admin/rule-governance/${selectedId}/history`)
      .then((response) => setHistory(response.data))
      .catch(() => setHistory([]));
  }, [selectedId]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.medicines.filter((item) => !needle || item.generic_name.toLowerCase().includes(needle));
  }, [data.medicines, query]);

  function choose(row) {
    setSelectedId(row.id);
    setDraft(editModel(row));
    setError('');
    setMessage('');
  }

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError('');
    setMessage('');
  }

  async function save(action) {
    if (!draft || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api(`/api/admin/rule-governance/${draft.id}`, {
        method: 'PUT',
        body: {
          ...draft,
          action,
          condition_rules: parseConditionRules(draft.condition_rules_text),
        },
      });
      setMessage(action === 'SUBMIT' ? 'Submitted to the pharmacist review queue.' : 'Draft and version history saved.');
      await load();
    } catch (requestError) {
      const details = [
        ...(requestError.body?.clinical_consistency?.missing_fields || []),
        ...(requestError.body?.clinical_consistency?.conflicts || []),
        ...(requestError.body?.safety_consistency?.missing_fields || []),
        ...(requestError.body?.safety_consistency?.conflicts || []),
      ];
      setError(`${requestError.message}${details.length ? ` Missing or invalid: ${details.join(', ')}.` : ''}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveCredential() {
    if (!credentialDraft || credentialSaving) return;
    setCredentialSaving(true);
    setError('');
    setMessage('');
    try {
      await api(`/api/admin/pharmacist-credentials/${credentialDraft.id}`, {
        method: 'PUT',
        body: credentialDraft,
      });
      setMessage('Pharmacist credential status and audit record saved.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCredentialSaving(false);
    }
  }

  if (loading && !draft) return <div className="arg-loading"><LoaderCircle className="spin" /> Loading rule database…</div>;

  return (
    <div className="arg-page">
      <section className="arg-summary" aria-label="Rule coverage summary">
        <div><ShieldCheck /><span><strong>{data.summary.ready || 0}</strong>Ready</span></div>
        <div><Clock3 /><span><strong>{data.summary.in_review || 0}</strong>In review</span></div>
        <div><Info /><span><strong>{data.summary.incomplete || 0}</strong>Incomplete</span></div>
        <div><FileClock /><span><strong>{data.summary.prescription_specific || 0}</strong>Prescription-specific</span></div>
      </section>

      <section className="arg-credentials" aria-labelledby="arg-credential-title">
        <header>
          <div>
            <small>LICENSED REVIEW GATE</small>
            <h2 id="arg-credential-title">Pharmacist credentials</h2>
            <p>
              A pharmacist-role account cannot sign rules or prescriptions until an administrator
              records an independently verified, unexpired license.
            </p>
          </div>
          <a href={credentialData.verification_portal} rel="noreferrer" target="_blank">
            Open PRC verification
          </a>
        </header>
        <div className="arg-credential-grid">
          <div className="arg-credential-list">
            {credentialData.pharmacists.map((pharmacist) => (
              <button
                className={credentialDraft?.id === pharmacist.id ? 'selected' : ''}
                key={pharmacist.id}
                onClick={() =>
                  setCredentialDraft({
                    ...pharmacist,
                    license_expires_on: asDate(pharmacist.license_expires_on),
                  })
                }
                type="button"
              >
                <span><strong>{pharmacist.full_name}</strong><small>{pharmacist.license_number || 'No license recorded'}</small></span>
                <Status value={pharmacist.license_status} />
              </button>
            ))}
            {!credentialData.pharmacists.length && <p>No pharmacist accounts found.</p>}
          </div>
          {credentialDraft && (
            <div className="arg-credential-form">
              <Field label="License number"><input onChange={(event) => setCredentialDraft((current) => ({ ...current, license_number: event.target.value }))} value={credentialDraft.license_number || ''} /></Field>
              <Field label="Jurisdiction"><input onChange={(event) => setCredentialDraft((current) => ({ ...current, license_jurisdiction: event.target.value }))} placeholder="PH-PRC" value={credentialDraft.license_jurisdiction || ''} /></Field>
              <Field label="License expiry"><input onChange={(event) => setCredentialDraft((current) => ({ ...current, license_expires_on: event.target.value }))} type="date" value={credentialDraft.license_expires_on || ''} /></Field>
              <Field label="Credential status"><select onChange={(event) => setCredentialDraft((current) => ({ ...current, license_status: event.target.value }))} value={credentialDraft.license_status || 'PENDING'}><option>PENDING</option><option>VERIFIED</option><option>SUSPENDED</option><option>EXPIRED</option></select></Field>
              <Field wide label="Regulator verification URL"><input onChange={(event) => setCredentialDraft((current) => ({ ...current, license_evidence_url: event.target.value }))} placeholder="https://verification.prc.gov.ph/" type="url" value={credentialDraft.license_evidence_url || ''} /></Field>
              <p className="wide">{credentialData.notice}</p>
              <button disabled={credentialSaving} onClick={saveCredential} type="button">{credentialSaving ? <LoaderCircle className="spin" /> : <ShieldCheck />}Save credential review</button>
            </div>
          )}
        </div>
      </section>

      <div className="arg-workspace">
        <aside className="arg-list">
          <label className="arg-search"><Search /><input onChange={(event) => setQuery(event.target.value)} placeholder="Search medicines" value={query} /></label>
          <div className="arg-list__scroll">
            {visible.map((row) => (
              <button className={row.id === selectedId ? 'selected' : ''} key={row.id} onClick={() => choose(row)} type="button">
                <span><strong>{row.generic_name}</strong><small>{row.common_strength} · {row.dosage_form}</small></span>
                <Status value={row.effective_status} />
              </button>
            ))}
          </div>
        </aside>

        {draft && (
          <section className="arg-editor">
            <header>
              <div><small>RULE VERSION {draft.rule_version || 1}</small><h2>{draft.generic_name}</h2><p>{draft.rx_class === 'RX' ? 'Prescription reminders always use an approved patient-specific record.' : 'Prepare label evidence and safety coverage for pharmacist verification.'}</p></div>
              <Status value={draft.effective_status} />
            </header>

            {draft.rx_class === 'RX' && <aside className="arg-note"><ShieldCheck /> Generic prescription rules never generate a patient schedule. PharMate reads the exact frequency and dose from the pharmacist-approved prescription.</aside>}

            <RuleSection title="Structured directions">
              <Field label="Strength"><input onChange={(e) => update('common_strength', e.target.value)} value={draft.common_strength || ''} /></Field>
              <Field label="Dosage form"><input onChange={(e) => update('dosage_form', e.target.value)} value={draft.dosage_form || ''} /></Field>
              <Field label="Route"><input onChange={(e) => update('administration_route', e.target.value)} value={draft.administration_route || ''} /></Field>
              <Field label="Release type"><select onChange={(e) => update('release_type', e.target.value)} value={draft.release_type || ''}><option value="">Choose</option>{RELEASE_TYPES.map((value) => <option key={value}>{value}</option>)}</select></Field>
              <Field label="Frequency code"><input onChange={(e) => update('frequency_default', e.target.value.toUpperCase())} value={draft.frequency_default || ''} /></Field>
              <Field label="Supported codes"><input onChange={(e) => update('supported_frequency_codes', e.target.value)} placeholder="QD, BID" value={draft.supported_frequency_codes || ''} /></Field>
              <Field label="Minimum interval (hours)"><input min="0" onChange={(e) => update('min_interval_hours', e.target.value)} step="0.25" type="number" value={draft.min_interval_hours ?? ''} /></Field>
              <Field label="Maximum daily doses"><input min="0" onChange={(e) => update('max_daily_doses', e.target.value)} type="number" value={draft.max_daily_doses ?? ''} /></Field>
              <Field label="Food rule"><select onChange={(e) => update('food_rule', e.target.value)} value={draft.food_rule || 'NONE'}>{FOOD_RULES.map((value) => <option key={value}>{value}</option>)}</select></Field>
              <Field label="Schedule type"><select onChange={(e) => update('schedule_type', e.target.value)} value={draft.schedule_type || ''}><option value="">Choose</option>{SCHEDULE_TYPES.map((value) => <option key={value}>{value}</option>)}</select></Field>
              <Field label="Units per dose"><input min="0" onChange={(e) => update('units_per_dose', e.target.value)} step="0.25" type="number" value={draft.units_per_dose ?? ''} /></Field>
              <Field wide label="Exact directions text"><textarea onChange={(e) => update('directions_text', e.target.value)} rows="3" value={draft.directions_text || ''} /></Field>
              <Field wide label="Administration instruction"><textarea onChange={(e) => update('administration_instruction', e.target.value)} rows="2" value={draft.administration_instruction || ''} /></Field>
              <Field wide label="Clinical rationale"><textarea onChange={(e) => update('clinical_rationale', e.target.value)} rows="2" value={draft.clinical_rationale || ''} /></Field>
              <Field wide label="Do guidance"><textarea onChange={(e) => update('guidance_do', e.target.value)} rows="2" value={draft.guidance_do || ''} /></Field>
              <Field wide label="Do not guidance"><textarea onChange={(e) => update('guidance_dont', e.target.value)} rows="2" value={draft.guidance_dont || ''} /></Field>
            </RuleSection>

            <RuleSection title="Patient-safety coverage">
              <Field wide label="Allergy terms (comma separated)"><input onChange={(e) => update('allergy_terms', e.target.value)} value={draft.allergy_terms || ''} /></Field>
              <Field label="Minimum age"><input min="0" onChange={(e) => update('minimum_age_years', e.target.value)} step="0.1" type="number" value={draft.minimum_age_years ?? ''} /></Field>
              <Field label="Maximum age"><input min="0" onChange={(e) => update('maximum_age_years', e.target.value)} step="0.1" type="number" value={draft.maximum_age_years ?? ''} /></Field>
              <Field label="Minimum weight (kg)"><input min="0" onChange={(e) => update('minimum_weight_kg', e.target.value)} step="0.1" type="number" value={draft.minimum_weight_kg ?? ''} /></Field>
              <Field label="Maximum weight (kg)"><input min="0" onChange={(e) => update('maximum_weight_kg', e.target.value)} step="0.1" type="number" value={draft.maximum_weight_kg ?? ''} /></Field>
              {[['pregnancy_action', 'Pregnancy'], ['breastfeeding_action', 'Breastfeeding'], ['kidney_action', 'Kidney conditions'], ['liver_action', 'Liver conditions']].map(([field, label]) => <Field key={field} label={label}><select onChange={(e) => update(field, e.target.value)} value={draft[field] || ''}><option value="">Choose</option>{ACTIONS.map((value) => <option key={value}>{value}</option>)}</select></Field>)}
              <Field wide label="Condition rules (one per line: condition|REVIEW|message)"><textarea onChange={(e) => update('condition_rules_text', e.target.value)} rows="4" value={draft.condition_rules_text || ''} /></Field>
              <div className="arg-checks wide">{REVIEW_FLAGS.map(([field, label]) => <label key={field}><input checked={Boolean(draft[field])} onChange={(e) => update(field, e.target.checked)} type="checkbox" />{label} reviewed</label>)}</div>
            </RuleSection>

            <RuleSection title="Evidence and provenance">
              <Field label="Clinical source"><input onChange={(e) => update('clinical_source_name', e.target.value)} value={draft.clinical_source_name || ''} /></Field>
              <Field label="Registration number"><input onChange={(e) => update('registration_number', e.target.value)} value={draft.registration_number || ''} /></Field>
              <Field wide label="Clinical source URL"><input onChange={(e) => update('evidence_source_url', e.target.value)} type="url" value={draft.evidence_source_url || ''} /></Field>
              <Field label="Source revision date"><input onChange={(e) => update('source_revision_date', e.target.value)} type="date" value={draft.source_revision_date || ''} /></Field>
              <Field label="Evidence reviewed date"><input onChange={(e) => update('evidence_reviewed_at', e.target.value)} type="date" value={draft.evidence_reviewed_at || ''} /></Field>
              <Field label="Safety source"><input onChange={(e) => update('safety_source_name', e.target.value)} value={draft.safety_source_name || ''} /></Field>
              <Field wide label="Safety source URL"><input onChange={(e) => update('safety_source_url', e.target.value)} type="url" value={draft.safety_source_url || ''} /></Field>
              <Field label="Safety source date"><input onChange={(e) => update('safety_source_revision_date', e.target.value)} type="date" value={draft.safety_source_revision_date || ''} /></Field>
              <Field wide label="Evidence notes"><textarea onChange={(e) => update('safety_evidence_notes', e.target.value)} rows="3" value={draft.safety_evidence_notes || ''} /></Field>
            </RuleSection>

            {(message || error) && <div className={error ? 'arg-feedback arg-feedback--error' : 'arg-feedback'} role="status">{error || message}</div>}
            <div className="arg-actions"><button disabled={saving} onClick={() => save('SAVE_DRAFT')} type="button"><Save />Save draft</button><button className="primary" disabled={saving || draft.rx_class === 'RX'} onClick={() => save('SUBMIT')} type="button">{saving ? <LoaderCircle className="spin" /> : <CheckCircle2 />}Submit for pharmacist review</button></div>

            <section className="arg-history"><h3>Version history</h3>{history.length ? history.slice(0, 12).map((item) => <div key={item.id}><FileClock /><span><strong>v{item.rule_version} · {String(item.action).replaceAll('_', ' ')}</strong><small>{item.actor_role} · {new Date(item.created_at).toLocaleString()}</small>{item.reviewer_license_number && <small>{item.reviewer_license_jurisdiction} license {item.reviewer_license_number} · valid through {asDate(item.reviewer_license_expires_on)}</small>}</span></div>) : <p>No revisions yet.</p>}</section>
          </section>
        )}
      </div>
    </div>
  );
}

function RuleSection({ children, title }) {
  return <fieldset className="arg-section"><legend>{title}</legend><div>{children}</div></fieldset>;
}

function Field({ children, label, wide = false }) {
  return <label className={wide ? 'wide' : ''}><span>{label}</span>{children}</label>;
}
