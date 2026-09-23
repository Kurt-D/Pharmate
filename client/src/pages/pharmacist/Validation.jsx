import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileSearch } from 'lucide-react';
import { api, apiBlobUrl } from '../../api.js';
import '../../styles/pharmacist-dashboard.css';

export default function Validation() {
  const [queue, setQueue] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyItem, setHistoryItem] = useState(null);
  const [historyStatus, setHistoryStatus] = useState('approved');
  const [historyReason, setHistoryReason] = useState('');
  const [historyMedicine, setHistoryMedicine] = useState({});
  const [historyPhotoUrl, setHistoryPhotoUrl] = useState('');
  const [historyPhotoLoading, setHistoryPhotoLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const [fullView, setFullView] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [workspace, setWorkspace] = useState('queue');
  const reasonInputRef = useRef(null);
  const [prescription, setPrescription] = useState({
    medicine_name: '', strength: '', strength_unit: 'mg', dosage_form: '', directions: '', quantity: '',
  });

  async function load() {
    try {
      const [queueResponse, historyResponse] = await Promise.all([
        api('/api/pharmacist/validations'),
        api('/api/pharmacist/validations/history-list'),
      ]);
      setQueue(queueResponse.data);
      setHistory(historyResponse.data);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function pick(item) {
    setSelected(item);
    setReason('');
    setFlash('');
    setPrescription({
      medicine_name: item.drug_name_raw === 'Prescription awaiting pharmacist review' ? '' : item.drug_name_raw || '',
      strength: item.strength_value || '',
      strength_unit: item.strength_unit || 'mg',
      dosage_form: item.dosage_form_snapshot || '',
      directions: item.dosage_instruction || '',
      quantity: item.prescribed_quantity || '',
    });
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl('');
    setFullView(false);
    setZoom(1);
    try {
      await api(`/api/pharmacist/validations/${item.id}/claim`, { method: 'POST' });
      setPhotoUrl(await apiBlobUrl(`/api/pharmacist/validations/${item.id}/photo`));
    } catch {
      setError('Could not load the prescription image.');
    }
  }

  async function approveForOrder() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/pharmacist/validations/${selected.id}/approve-prescription`, { method: 'POST' });
      setSelected((current) => ({ ...current, review_stage: 'order' }));
      setQueue((current) => current?.map((item) =>
        item.id === selected.id ? { ...item, review_stage: 'order' } : item
      ));
      setFlash('Upload approved. Enter the verified prescription order to publish it to the patient.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function decide(action) {
    if (!selected) return;
    if ((action === 'reject' || action === 'needs_clearer') && !reason.trim()) {
      setError(`Please enter a reason before ${action === 'reject' ? 'rejecting this prescription' : 'requesting a clearer photo'}.`);
      reasonInputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/pharmacist/validate', {
        method: 'POST',
        body: {
          photo_id: selected.id,
          action,
          reason: reason.trim() || undefined,
          ...(action === 'approve' ? { prescription } : {}),
        },
      });
      const verb =
        action === 'approve'
          ? 'approved and published to the patient prescription list'
          : action === 'reject'
            ? 'rejected'
            : 'flagged for a clearer photo';
      setFlash(`Prescription ${verb}.`);
      setSelected(null);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(item) {
    setHistoryItem(item);
    setHistoryStatus(item.status);
    setHistoryReason(item.decision_reason || '');
    setHistoryMedicine({ medicine_name: item.drug_name_raw || '', strength: item.strength_value || '', strength_unit: item.strength_unit || 'mg', dosage_form: item.dosage_form_snapshot || '', directions: item.dosage_instruction || '' });
    if (historyPhotoUrl) URL.revokeObjectURL(historyPhotoUrl);
    setHistoryPhotoUrl('');
    setHistoryPhotoLoading(true);
    try {
      setHistoryPhotoUrl(await apiBlobUrl(`/api/pharmacist/validations/${item.id}/photo`));
    } catch {
      setError('The retained prescription image is no longer available.');
    } finally {
      setHistoryPhotoLoading(false);
    }
  }

  function closeHistory() {
    if (historyPhotoUrl) URL.revokeObjectURL(historyPhotoUrl);
    setHistoryPhotoUrl('');
    setHistoryItem(null);
  }

  async function saveHistory() {
    if (!historyItem) return;
    setBusy(true);
    try {
      await api(`/api/pharmacist/validations/${historyItem.id}/history`, {
        method: 'PATCH', body: { status: historyStatus, reason: historyReason, prescription: historyMedicine },
      });
      closeHistory();
      setFlash('Review history updated.');
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pv-validation">
      {flash && <div className="alert alert-success py-2">{flash}</div>}
      {error && <div className="alert alert-warning py-2">{error}</div>}

      <nav className="pv-validation__tabs" aria-label="Prescription validation panels">
        <button aria-selected={workspace === 'queue'} className={workspace === 'queue' ? 'is-active' : ''} onClick={() => setWorkspace('queue')} type="button">
          Awaiting verification <b>{queue?.length || 0}</b>
        </button>
        <button aria-selected={workspace === 'history'} className={workspace === 'history' ? 'is-active' : ''} onClick={() => setWorkspace('history')} type="button">
          Review history <b>{history?.length || 0}</b>
        </button>
        <button className="pv-validation__refresh" onClick={load} type="button">Refresh</button>
      </nav>

      {workspace === 'queue' && <div className="pv-validation__workspace">
        {/* Queue */}
        <aside className="pv-validation__queue pw-card">
            <div className="pv-validation__queue-header">
              <strong>Awaiting Verification</strong>
              <span className="badge bg-primary-subtle text-primary">
                {queue ? queue.length : '…'}
              </span>
            </div>
            {queue === null && <div className="text-muted small">Loading…</div>}
            {queue && queue.length === 0 && (
              <div className="pv-validation__empty pv-validation__empty--queue">
                <b><CheckCircle2 aria-hidden="true" size={24} /></b><strong>All caught up</strong><span>There are no prescriptions waiting for verification.</span>
              </div>
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
                    {item.review_stage === 'order' ? 'Order details needed' : 'Prescription review'} · {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'New'}
                  </div>
                </button>
              ))}
        </aside>

        {/* Review panel */}
        <section className="pv-validation__review pw-card">
            {!selected ? (
              <div className="pv-validation__empty pv-validation__empty--review">
                <b><FileSearch aria-hidden="true" size={27} /></b><strong>Your review space is ready</strong>
                <span>Select a prescription from the queue to inspect the image, OCR text, and proposed reminder schedule.</span>
              </div>
            ) : (
              <>
                <div className="mb-2">
                  <strong>{selected.drug_name_raw}</strong>{' '}
                  <span className="pw-code">{selected.patient_code}</span>
                  <div className="small text-muted">
                    {selected.frequency || '—'}
                    {selected.dosage_instruction ? ` · ${selected.dosage_instruction}` : ''}
                  </div>
                </div>

                <div className="mb-2">
                  <span className="badge bg-primary">Patient upload</span>
                </div>

                <div className="pv-validation__image-shell">
                  {photoUrl ? (
                    <>
                      <img src={photoUrl} alt="Redacted prescription" />
                      <button className="pv-validation__expand" onClick={() => setFullView(true)} type="button">
                        View full screen
                      </button>
                    </>
                  ) : (
                    <div className="text-muted small py-5">Loading image…</div>
                  )}
                </div>

                {selected.review_stage === 'order' && <section className="pv-validation__prescription-form">
                  <div>
                    <span className="pv-validation__eyebrow">Prescription order</span>
                    <h3>Enter the verified medicine</h3>
                    <p>These details become the patient’s approved prescription and available balance.</p>
                  </div>
                  <label>Medicine name<input value={prescription.medicine_name} onChange={(e) => setPrescription((current) => ({ ...current, medicine_name: e.target.value }))} placeholder="e.g. Paracetamol" /></label>
                  <div className="pv-validation__form-row">
                    <label>Strength<input value={prescription.strength} onChange={(e) => setPrescription((current) => ({ ...current, strength: e.target.value }))} placeholder="e.g. 500" /></label>
                    <label>Unit<select value={prescription.strength_unit} onChange={(e) => setPrescription((current) => ({ ...current, strength_unit: e.target.value }))}><option>mg</option><option>mcg</option><option>g</option><option>mL</option></select></label>
                    <label>Form<input value={prescription.dosage_form} onChange={(e) => setPrescription((current) => ({ ...current, dosage_form: e.target.value }))} placeholder="Tablet" /></label>
                  </div>
                  <div className="pv-validation__form-row pv-validation__form-row--wide">
                    <label>Directions<input value={prescription.directions} onChange={(e) => setPrescription((current) => ({ ...current, directions: e.target.value }))} placeholder="e.g. Take one tablet twice daily" /></label>
                    <label>Quantity<input min="1" type="number" value={prescription.quantity} onChange={(e) => setPrescription((current) => ({ ...current, quantity: e.target.value }))} placeholder="30" /></label>
                  </div>
                </section>}

                <label className="form-label small fw-semibold">
                  Reason (required to reject or request a clearer photo)
                </label>
                <textarea
                  ref={reasonInputRef}
                  className="form-control form-control-sm mb-3"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Photo is blurry — please retake in good light."
                />

                <div className="d-flex gap-2">
                  {selected.review_stage === 'order' ? (
                    <button className="btn btn-success" disabled={busy} onClick={() => decide('approve')} type="button">
                      {busy ? 'Publishing…' : 'Create order & publish'}
                    </button>
                  ) : (
                    <button className="btn btn-success" disabled={busy} onClick={approveForOrder} type="button">
                      {busy ? 'Approving…' : 'Approve upload'}
                    </button>
                  )}
                  <button
                    className="btn btn-outline-secondary"
                    disabled={busy}
                    onClick={() => decide('needs_clearer')}
                    type="button"
                  >
                    Request clearer photo
                  </button>
                  <button
                    className="btn btn-outline-danger ms-auto"
                    disabled={busy}
                    onClick={() => decide('reject')}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </>
            )}
        </section>
      </div>}

      {workspace === 'history' && <section className="pv-validation__history pw-card" aria-labelledby="validation-history-title">
        <div className="pv-validation__queue-header">
          <div>
            <strong id="validation-history-title">Review History</strong>
            <span>Completed prescription decisions</span>
          </div>
          <span className="badge bg-primary-subtle text-primary">{history ? history.length : '…'}</span>
        </div>
        {history === null && <div className="text-muted small mt-3">Loading history…</div>}
        {history?.length === 0 && (
          <p className="pv-validation__history-empty">Your completed prescription reviews will appear here.</p>
        )}
        {history?.length > 0 && (
          <div className="pv-validation__history-list">
            {history.map((item) => {
              const status = item.status === 'needs_clearer' ? 'Needs clearer photo' : item.status;
              const strength = [item.strength_value, item.strength_unit, item.dosage_form_snapshot]
                .filter(Boolean)
                .join(' ');
              return (
                <button className="pv-validation__history-item" key={item.id} onClick={() => openHistory(item)} type="button">
                  <div>
                    <strong>{item.drug_name_raw || 'Prescription review'}</strong>
                    <span>{item.patient_code}{strength ? ` · ${strength}` : ''}</span>
                    {item.decision_reason && <small>Note: {item.decision_reason}</small>}
                  </div>
                  <div>
                    <em className={`pv-validation__history-status is-${item.status}`}>{status}</em>
                    <time>{item.decision_at ? new Date(item.decision_at).toLocaleString() : '—'}</time>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>}

      {historyItem && (
        <div className="pv-validation__history-modal" role="dialog" aria-modal="true" aria-label="Edit prescription review">
          <section>
            <header><div><small>Prescription review</small><h2>Edit medicine and review</h2><p>{historyItem.patient_code}</p></div><button onClick={closeHistory} type="button">×</button></header>
            <dl>
              <div><dt>Reviewed</dt><dd>{historyItem.decision_at ? new Date(historyItem.decision_at).toLocaleString() : '—'}</dd></div>
            </dl>
            <section className="pv-validation__history-photo">
              <div><strong>Validated prescription image</strong><small>Redacted patient upload retained for your review.</small></div>
              {historyPhotoLoading && <span>Loading image…</span>}
              {!historyPhotoLoading && historyPhotoUrl && <button onClick={() => setFullView(true)} type="button"><img alt="Redacted validated prescription" src={historyPhotoUrl} /><span>View full image</span></button>}
              {!historyPhotoLoading && !historyPhotoUrl && <span>Image is unavailable because it has reached its retention limit.</span>}
            </section>
            <label>Medicine name<input value={historyMedicine.medicine_name || ''} onChange={(event) => setHistoryMedicine((value) => ({ ...value, medicine_name: event.target.value }))} /></label>
            <div className="pv-validation__form-row"><label>Strength<input value={historyMedicine.strength || ''} onChange={(event) => setHistoryMedicine((value) => ({ ...value, strength: event.target.value }))} /></label><label>Unit<input value={historyMedicine.strength_unit || ''} onChange={(event) => setHistoryMedicine((value) => ({ ...value, strength_unit: event.target.value }))} /></label><label>Form<input value={historyMedicine.dosage_form || ''} onChange={(event) => setHistoryMedicine((value) => ({ ...value, dosage_form: event.target.value }))} /></label></div>
            <label>Directions<textarea rows="2" value={historyMedicine.directions || ''} onChange={(event) => setHistoryMedicine((value) => ({ ...value, directions: event.target.value }))} /></label>
            <label>Decision<select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="needs_clearer">Needs clearer photo</option></select></label>
            <label>Review note<textarea rows="3" value={historyReason} onChange={(event) => setHistoryReason(event.target.value)} placeholder="Add or correct the review note" /></label>
            <footer><button className="btn btn-outline-secondary" onClick={closeHistory} type="button">Cancel</button><button className="btn btn-primary" disabled={busy} onClick={saveHistory} type="button">{busy ? 'Saving…' : 'Save changes'}</button></footer>
          </section>
        </div>
      )}

      {fullView && (photoUrl || historyPhotoUrl) && (
        <div className="pv-validation__viewer" role="dialog" aria-modal="true" aria-label="Prescription image viewer">
          <div className="pv-validation__viewer-toolbar">
            <strong>Prescription image</strong>
            <div>
              <button aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} type="button">−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button aria-label="Zoom in" disabled={zoom >= 2.5} onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))} type="button">+</button>
              <button className="pv-validation__viewer-exit" onClick={() => { setFullView(false); setZoom(1); }} type="button">Exit full view</button>
            </div>
          </div>
          <div className="pv-validation__viewer-stage">
            <img alt="Full-size redacted prescription" src={photoUrl || historyPhotoUrl} style={{ transform: `scale(${zoom})` }} />
          </div>
        </div>
      )}
    </section>
  );
}
