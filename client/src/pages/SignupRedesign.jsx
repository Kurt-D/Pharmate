import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiUrl } from '../config.js';
import '../styles/auth.css';

export default function SignupRedesign() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    if (!agreed) return setError('Please agree to the Terms of Service and Privacy Policy.');
    setLoading(true);
    try {
      const registration = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          role: 'patient',
          full_name: form.name.trim(),
        }),
      });
      const result = await registration.json();
      if (!registration.ok) return setError(result.error || 'Could not create your account.');
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          role: 'patient',
        }),
      });
      const data = await response.json();
      if (!response.ok) return navigate('/login', { replace: true });
      login(data.user, data.accessToken, data.refreshToken);
      navigate('/patient/home', { replace: true });
    } catch {
      setError('Cannot reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-shell signup">
        <div className="auth-logo">
          <b>P</b>
          <i>●</i>
        </div>
        <div className="auth-heading">
          <h1>Create Account</h1>
          <p>Sign up and get started</p>
        </div>
        {error && <div className="auth-alert error">{error}</div>}
        <form onSubmit={submit}>
          <label>
            Full Name
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Enter your full name"
              required
            />
          </label>
          <label>
            Email Address
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="Enter your email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder="Enter your password"
              required
            />
          </label>
          <label>
            Confirm Password
            <input
              type="password"
              value={form.confirm}
              onChange={(e) => set('confirm', e.target.value)}
              placeholder="Confirm your password"
              required
            />
          </label>
          <label className="auth-check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              I agree to the <a href="#terms">Terms of Service</a> and{' '}
              <a href="#privacy">Privacy Policy</a>
            </span>
          </label>
          <button className="auth-primary" disabled={loading}>
            {loading ? 'Creating account…' : 'Sign Up'}
          </button>
        </form>
        <p className="auth-signin">
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </section>
    </main>
  );
}
