import { useEffect, useMemo, useState } from 'react';
import { api, apiBlobUrl } from '../../api.js';

function parseDraft(value) {
  if (!value) return { slots: [], unresolved: [] };
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return { slots: [], unresolved: [] };
  }
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

export default function Validation() {
  const [queue, setQueue] = useState(null);
  const [selected, setSelected] = useState(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const draft = useMemo(() => parseDraft(selected?.schedule_draft_json), [selected]);

  async function load() {
    try {
      const r = await api('/api/pharmacist/validations');
      setQueue(r.data);
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
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl('');
    try {
      await api(`/api/pharmacist/validations/${item.id}/claim`, { method: 'POST' });
      setPhotoUrl(await apiBlobUrl(`/api/pharmacist/validations/${item.id}/photo`));
    } catch {
      setError('Could not load the prescription image.');
    }
  }

  async function approvePrescription() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/pharmacist/validations/${selected.id}/approve-prescription`, {
        method: 'POST',
      });
      setSelected((current) => ({ ...current, review_stage: 'schedule' }));
      setQueue((current) =>
        current?.map((item) =>
          item.id === selected.id ? { ...item, review_stage: 'schedule' } : item
        )
      );
      setFlash('Prescription approved. Now independently validate the suggested schedule.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function decide(action) {
    if (!selected) return;
    if ((action === 'reject' || action === 'needs_clearer') && !reason.trim()) {
      setError('Please enter a reason.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/pharmacist/validate', {
        method: 'POST',
        body: { photo_id: selected.id, action, reason: reason.trim() || undefined },
      });
      const verb =
        action === 'approve'
          ? 'schedule approved and published to the patient dashboard'
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

  return (
    <>
      <h2 className="h4 fw-bold mb-1">Prescription &amp; Schedule Review</h2>
      <p className="text-muted">
        First verify the prescription and OCR text. Then review the system-suggested schedule.
        Nothing reaches the patient dashboard until both approvals are complete.
      </p>

      {flash && <div className="alert alert-success py-2">{flash}</div>}
      {error && <div className="alert alert-warning py-2">{error}</div>}

      <div className="row g-3">
        {/* Queue */}
        <div className="col-lg-5">
          <div className="pw-card p-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <strong>Awaiting Verification</strong>
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
                    Stage {item.review_stage === 'schedule' ? '2: schedule' : '1: prescription'} ·{' '}
                    {item.frequency || '—'}
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Review panel */}
        <div className="col-lg-7">
          <div className="pw-card p-3">
            {!selected ? (
              <div className="text-muted small py-5 text-center">
                Select a prescription to review.
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
                  <span className="badge bg-primary">
                    Stage {selected.review_stage === 'schedule' ? '2 of 2' : '1 of 2'}
                  </span>
                </div>

                <div
                  className="border rounded mb-3 text-center bg-light"
                  style={{ minHeight: 220 }}
                >
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt="Redacted prescription"
                      style={{ maxWidth: '100%', maxHeight: 380, objectFit: 'contain' }}
                    />
                  ) : (
                    <div className="text-muted small py-5">Loading image…</div>
                  )}
                </div>

                <section className="border rounded p-3 mb-3">
                  <div className="d-flex justify-content-between">
                    <strong>OCR transcription</strong>
                    {selected.ocr_confidence != null && (
                      <span className="small text-muted">
                        Confidence {Math.round(Number(selected.ocr_confidence))}%
                      </span>
                    )}
                  </div>
                  <div className="small mt-2" style={{ whiteSpace: 'pre-wrap' }}>
                    {selected.ocr_text ||
                      'No OCR text was captured. Compare the entered medicine details with the image.'}
                  </div>
                </section>

                <section className="border rounded p-3 mb-3">
                  <strong>System-suggested schedule</strong>
                  <div className="small text-muted mb-2">Not active until the second approval.</div>
                  {draft.slots?.length ? (
                    draft.slots.map((slot, index) => (
                      <div key={`${slot.scheduled_time}-${index}`} className="border-top py-2">
                        <strong>{formatTime(slot.scheduled_time)}</strong>
                        <div className="small text-muted">
                          {slot.generated_reason ||
                            'Generated from the prescription frequency and patient routine'}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="alert alert-warning py-2 mb-0">
                      No safe schedule was generated. Do not approve until the medicine details are
                      corrected.
                    </div>
                  )}
                  {draft.unresolved?.length > 0 && (
                    <div className="alert alert-warning py-2 mt-2 mb-0">
                      Unresolved checks: {draft.unresolved.join(', ')}
                    </div>
                  )}
                </section>

                <label className="form-label small fw-semibold">
                  Reason (required to reject or request a clearer photo)
                </label>
                <textarea
                  className="form-control form-control-sm mb-3"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Photo is blurry — please retake in good light."
                />

                <div className="d-flex gap-2">
                  {selected.review_stage === 'prescription' ? (
                    <button
                      className="btn btn-success"
                      disabled={busy}
                      onClick={approvePrescription}
                    >
                      {busy ? 'Saving…' : 'Approve Prescription & Review Schedule'}
                    </button>
                  ) : (
                    <button
                      className="btn btn-success"
                      disabled={busy || !draft.slots?.length}
                      onClick={() => decide('approve')}
                    >
                      {busy ? 'Publishing…' : 'Approve Schedule & Publish'}
                    </button>
                  )}
                  <button
                    className="btn btn-outline-secondary"
                    disabled={busy}
                    onClick={() => decide('needs_clearer')}
                  >
                    Request clearer photo
                  </button>
                  <button
                    className="btn btn-outline-danger ms-auto"
                    disabled={busy}
                    onClick={() => decide('reject')}
                  >
                    Reject
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
