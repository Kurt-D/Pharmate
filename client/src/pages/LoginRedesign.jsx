import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiUrl } from '../config.js';
import '../styles/auth.css';
import '../styles/auth-links.css';

const ROUTES = {
  patient: '/patient/home',
  caregiver: '/caregiver',
  pharmacist: '/pharmacist',
  admin: '/admin',
};
export default function LoginRedesign() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useAuth();
  const staff = params.get('mode') === 'staff';
  const caregiver = params.get('role') === 'caregiver';
  const rememberedEmail = sessionStorage.getItem('pm_remember_email') || '';
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(Boolean(rememberedEmail));
  const [error, setError] = useState('');
  const [message, setMessage] = useState(
    params.get('reason') === 'session-expired'
      ? 'Your session expired. Please sign in again to continue.'
      : ''
  );
  const [loading, setLoading] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(staff ? { accountGroup: 'staff' } : { role: caregiver ? 'caregiver' : 'patient' }),
        }),
      });
      const data = await response.json();
      if (!response.ok) return setError(data.error || 'Login failed');
      login(data.user, data.accessToken, data.refreshToken);
      if (remember) sessionStorage.setItem('pm_remember_email', email);
      else sessionStorage.removeItem('pm_remember_email');
      navigate(ROUTES[data.user.role] || '/login', { replace: true });
    } catch {
      setError('Cannot reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }
  async function forgot() {
    if (!email.trim()) return setError('Enter your email address first.');
    setError('');
    try {
      const response = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      setMessage(data.message || 'Password reset instructions requested.');
    } catch {
      setError('Cannot reach the server. Please try again.');
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-logo">
          <b>P</b>
          <i>●</i>
        </div>
        <div className="auth-heading">
          <h1>Welcome Back!</h1>
          <p>
            {staff
              ? 'Pharmacist and administrator portal'
              : caregiver
                ? 'Caregiver sign in and patient linking'
                : 'Patient sign in'}
          </p>
        </div>
        {error && <div className="auth-alert error">{error}</div>}
        {message && <div className="auth-alert success">{message}</div>}
        <form onSubmit={submit}>
          <label>
            Email Address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </label>
          <label className="auth-check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />{' '}
            Remember me
          </label>
          <button className="auth-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Login'}
          </button>
        </form>
        <button className="auth-link" onClick={forgot}>
          Forgot Password?
        </button>
        <div className="auth-spacer" />
        {!staff && (
          <>
            <Link className="auth-outline" to="/identify">
              Create Account
            </Link>
            <div className="auth-access-links">
              {caregiver ? (
                <Link to="/login">Patient sign in</Link>
              ) : (
                <Link to="/login?role=caregiver">I have a caregiver code</Link>
              )}
              <Link to="/login?mode=staff">Pharmacist or Admin sign in</Link>
            </div>
          </>
        )}
        {staff && (
          <div className="auth-access-links">
            <Link to="/login">Patient sign in</Link>
            <Link to="/login?role=caregiver">Caregiver sign in</Link>
          </div>
        )}
      </section>
    </main>
  );
}
