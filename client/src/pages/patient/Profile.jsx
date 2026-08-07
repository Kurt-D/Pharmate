import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api.js';

// Patient profile / "my account". Full name and medical condition are the
// patient's own PII — fetched through the PII-safe serializer, so staff can
// never reach this data; they only ever see the patient_code.
export default function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [fullName, setFullName] = useState('');
  const [condition, setCondition] = useState('');
  const [code, setCode] = useState(user?.patientCode ?? '—');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/api/patient/profile')
      .then((r) => {
        setCode(r.data.patient_code ?? '—');
        setFullName(r.data.full_name ?? '');
        setCondition(r.data.medical_condition ?? '');
      })
      .catch((e) => setError(e.message));
  }, []);

  async function save() {
    setMsg('');
    setError('');
    setSaving(true);
    try {
      await api('/api/patient/profile', {
        method: 'PUT',
        body: { full_name: fullName, medical_condition: condition },
      });
      setMsg('Profile saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <h1 className="pm-title" style={{ fontSize: '1.4rem' }}>
        Profile
      </h1>
      <p className="pm-subtitle">Your account.</p>

      {error && <div className="pm-banner pm-banner--warn mb-3">{error}</div>}
      {msg && <div className="pm-banner pm-banner--success mb-3">{msg}</div>}

      <div className="pm-card p-3 mb-3">
        <div className="text-muted small">Patient code</div>
        <div className="fs-5 fw-bold">{code}</div>
        <div className="text-muted small mt-2">
          This code is how pharmacists and caregivers see you — never your name.
        </div>
      </div>

      <div className="pm-card p-3 mb-3">
        <label className="form-label fw-semibold">Full name</label>
        <input
          className="form-control mb-3"
          placeholder="Your name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <label className="form-label fw-semibold">
          Medical condition <span className="text-muted fw-normal">(optional)</span>
        </label>
        <textarea
          className="form-control"
          rows={2}
          maxLength={500}
          placeholder="e.g. Hypertension, Type 2 diabetes"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
        />
        <div className="form-text mb-2">
          Only you can see these details. A pharmacist confirms your condition when reviewing your
          prescription.
        </div>

        <button className="pm-btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <button className="btn btn-outline-secondary" onClick={handleLogout}>
        Sign out
      </button>
    </>
  );
}
