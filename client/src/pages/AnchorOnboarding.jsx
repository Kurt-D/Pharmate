import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const DEFAULTS = {
  wake_anchor: '08:00',
  sleep_anchor: '22:00',
  breakfast_anchor: '07:30',
  lunch_anchor: '12:00',
  dinner_anchor: '19:00',
};

const LABELS = {
  wake_anchor: 'Wake time',
  sleep_anchor: 'Sleep time',
  breakfast_anchor: 'Breakfast',
  lunch_anchor: 'Lunch',
  dinner_anchor: 'Dinner',
};

export default function AnchorOnboarding() {
  const navigate = useNavigate();
  const [anchors, setAnchors] = useState(DEFAULTS);
  const [condition, setCondition] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('pm_token');
    const auth = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/patient/anchors', { headers: auth })
        .then((r) => r.json())
        .then((data) => {
          // TIME columns come back as "HH:MM:SS"; the time input and the server
          // both expect "HH:MM", so normalize (and keep only the anchor fields).
          if (data && data.wake_anchor) {
            const loaded = {};
            for (const k of Object.keys(DEFAULTS)) {
              loaded[k] = data[k] ? String(data[k]).slice(0, 5) : DEFAULTS[k];
            }
            setAnchors(loaded);
          }
        })
        .catch(() => {}),
      fetch('/api/patient/profile', { headers: auth })
        .then((r) => r.json())
        .then((data) => {
          if (data && typeof data.medical_condition === 'string') {
            setCondition(data.medical_condition);
          }
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  function handleChange(field, value) {
    setAnchors((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const token = localStorage.getItem('pm_token');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
      // Save the self-declared condition first, then the anchors.
      const profileRes = await fetch('/api/patient/profile', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ medical_condition: condition }),
      });
      if (!profileRes.ok) {
        const d = await profileRes.json();
        setError(d.error || 'Failed to save');
        return;
      }
      const res = await fetch('/api/patient/anchors', {
        method: 'PUT',
        headers,
        body: JSON.stringify(anchors),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Failed to save');
        return;
      }
      navigate('/patient', { replace: true });
    } catch {
      setError('Cannot reach server');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <div className="d-flex justify-content-center align-items-center vh-100">
      <div className="card shadow-sm" style={{ width: '100%', maxWidth: 460 }}>
        <div className="card-body p-4">
          <h5 className="fw-bold mb-1">Set your daily schedule</h5>
          <p className="text-muted small mb-4">
            These times help PharMate place your doses at the right hours. You can change them any
            time in Settings.
          </p>

          {error && <div className="alert alert-danger py-2">{error}</div>}

          <form onSubmit={handleSubmit}>
            {Object.keys(DEFAULTS).map((field) => (
              <div className="mb-3 row align-items-center" key={field}>
                <label className="col-5 col-form-label fw-medium">{LABELS[field]}</label>
                <div className="col-7">
                  <input
                    type="time"
                    className="form-control"
                    value={anchors[field]}
                    onChange={(e) => handleChange(field, e.target.value)}
                    required
                  />
                </div>
              </div>
            ))}

            <hr className="my-3" />
            <div className="mb-2">
              <label htmlFor="condition" className="form-label fw-medium">
                Medical condition <span className="text-muted fw-normal">(optional)</span>
              </label>
              <textarea
                id="condition"
                className="form-control"
                rows={2}
                maxLength={500}
                placeholder="e.g. Hypertension, Type 2 diabetes"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              />
              <div className="form-text">
                If you have an ongoing condition, tell us here. Your pharmacist confirms it when
                reviewing your prescription. Only your patient code — never your name — is shown to
                staff.
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-100 mt-2" disabled={saving}>
              {saving ? (
                <span
                  className="spinner-border spinner-border-sm me-2"
                  role="status"
                  aria-hidden="true"
                />
              ) : null}
              {saving ? 'Saving…' : 'Save and continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
