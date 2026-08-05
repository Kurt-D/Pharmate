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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('pm_token');
    fetch('/api/patient/anchors', { headers: { Authorization: `Bearer ${token}` } })
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
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleChange(field, value) {
    setAnchors((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const token = localStorage.getItem('pm_token');
    try {
      const res = await fetch('/api/patient/anchors', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
