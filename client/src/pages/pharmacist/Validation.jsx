import { useEffect, useState } from 'react';
import { api, apiBlobUrl } from '../../api.js';

// Prescription Verification (UC-03, Figs 45–56). The pharmacist reviews the
// redacted photo and approves / rejects / requests a clearer image. There are
// deliberately NO scheduling controls here — the pharmacist's role ends at
// validation; the patient generates and confirms the schedule.
export default function Validation() {
  const [queue, setQueue] = useState(null);
  const [selected, setSelected] = useState(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

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
      setPhotoUrl(await apiBlobUrl(`/api/pharmacist/validations/${item.id}/photo`));
    } catch {
      setError('Could not load the prescription image.');
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
          ? 'approved — medication is now active'
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
      <h2 className="h4 fw-bold mb-1">Prescription Verification</h2>
      <p className="text-muted">
        Review each patient&apos;s redacted prescription and decide. Approving activates the
        medication so the patient can build a schedule. You never set the schedule (UC-03).
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
                    {item.frequency || '—'} · {new Date(item.created_at).toLocaleString()}
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
                  <button
                    className="btn btn-success"
                    disabled={busy}
                    onClick={() => decide('approve')}
                  >
                    {busy ? 'Saving…' : 'Approve'}
                  </button>
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
