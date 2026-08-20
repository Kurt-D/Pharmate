import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiUrl } from '../config.js';

const ROLE_ROUTES = {
  patient: '/patient/onboarding',
  pharmacist: '/pharmacist',
  admin: '/admin',
  caregiver: '/caregiver',
};

export default function Login() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login } = useAuth();
  const staffMode = searchParams.get('mode') === 'staff';
  const requestedRole = searchParams.get('role');
  const selectedRole = ['patient', 'caregiver'].includes(requestedRole)
    ? requestedRole
    : 'patient';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(staffMode ? { accountGroup: 'staff' } : { role: selectedRole }),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      login(data.user, data.accessToken, data.refreshToken);
      navigate(ROLE_ROUTES[data.user.role] ?? '/login', { replace: true });
    } catch {
      setError('Cannot reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="d-flex justify-content-center align-items-center vh-100">
      <div className="card shadow-sm" style={{ width: '100%', maxWidth: 420 }}>
        <div className="card-body p-4">
          <h4 className="mb-1 fw-bold text-primary">PharMate</h4>
          <p className="text-muted small mb-3">
            {staffMode ? 'Staff portal' : 'Are you a patient or caregiver?'}
          </p>

          {!staffMode && (
            <div className="login-role-picker mb-4" aria-label="Choose account type">
              {['patient', 'caregiver'].map((role) => (
                <button
                  key={role}
                  type="button"
                  className={`btn ${selectedRole === role ? 'btn-primary' : 'btn-outline-primary'}`}
                  aria-pressed={selectedRole === role}
                  onClick={() => setSearchParams({ role })}
                >
                  {role === 'patient' ? 'I am a Patient' : 'I am a Caregiver'}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="alert alert-danger py-2" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label htmlFor="email" className="form-label">
                Email address
              </label>
              <input
                id="email"
                type="email"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="mb-4">
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="btn btn-primary w-100" disabled={loading}>
              {loading && (
                <span
                  className="spinner-border spinner-border-sm me-2"
                  role="status"
                  aria-hidden="true"
                />
              )}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center small text-muted mt-3 mb-0">
            {!staffMode && selectedRole === 'patient' ? (
              <>New patient? <Link to="/signup">Create an account</Link></>
            ) : !staffMode ? (
              <>Caregiver accounts are provided by an administrator.</>
            ) : null}
          </p>
          <p className="text-center small mt-2 mb-0">
            <Link to={staffMode ? '/login?role=patient' : '/login?mode=staff'}>
              {staffMode ? 'Patient or caregiver sign in' : 'Pharmacist or admin sign in'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
