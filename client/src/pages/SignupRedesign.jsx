import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import pharmateLogo from '../assets/pharmate-logo.png';
import CaptchaChallenge from '../components/CaptchaChallenge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiUrl } from '../config.js';
import { homeForRole } from '../config/roleRoutes.js';
import '../styles/auth.css';

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
const PASSWORD_CHECKS = [
  { label: '12+ characters', test: (value) => value.length >= 12 },
  { label: 'Uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { label: 'Lowercase letter', test: (value) => /[a-z]/.test(value) },
  { label: 'Number', test: (value) => /\d/.test(value) },
];

function PasswordField({ label, value, onChange, visible, onToggle, autoComplete }) {
  return (
    <label>
      <span>{label}</span>
      <div className="auth-password-field">
        <input
          autoComplete={autoComplete}
          minLength={12}
          onChange={onChange}
          placeholder={label === 'Password' ? 'Create a strong password' : 'Repeat your password'}
          required
          type={visible ? 'text' : 'password'}
          value={value}
        />
        <button
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className={`auth-password-toggle${visible ? ' is-visible' : ''}`}
          onClick={onToggle}
          title={visible ? 'Hide password' : 'Show password'}
          type="button"
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          <span>{visible ? 'Hide' : 'Show'}</span>
        </button>
      </div>
    </label>
  );
}

export default function SignupRedesign() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const captchaRef = useRef(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
    role: 'patient',
  });
  const [agreed, setAgreed] = useState(false);
  const [captcha, setCaptcha] = useState({ captchaToken: '', captchaAnswer: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const passwordChecks = useMemo(
    () => PASSWORD_CHECKS.map((check) => ({ ...check, met: check.test(form.password) })),
    [form.password]
  );
  const captchaComplete = Boolean(captcha.captchaToken || captcha.captchaAnswer);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setInterval(
      () => setResendSeconds((current) => Math.max(0, current - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  function finishAuthentication(data) {
    login(data.user, data.accessToken, data.refreshToken);
    navigate(homeForRole(data.role || data.user.role), { replace: true });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!passwordChecks.every((check) => check.met)) {
      return setError('Use at least 12 characters with uppercase, lowercase, and a number.');
    }
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    if (!agreed) return setError('Please agree to the Terms of Service and Privacy Policy.');
    if (!captchaComplete) return setError('Please complete the security verification.');
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          confirmPassword: form.confirm,
          ...captcha,
          role: form.role,
          full_name: form.name.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.verificationRequired) {
          setVerificationEmail(data.email || form.email.trim());
          setError(data.message || 'Request another verification code to continue.');
          return;
        }
        setError(data.error || 'Could not create your account.');
        setCaptcha({ captchaToken: '', captchaAnswer: '' });
        captchaRef.current?.reset();
        return;
      }
      if (data.verificationRequired) {
        setVerificationEmail(data.email || form.email.trim());
        setResendSeconds(60);
      } else {
        finishAuthentication(data);
      }
    } catch {
      setError('Cannot reach the server. Please try again.');
      setCaptcha({ captchaToken: '', captchaAnswer: '' });
      captchaRef.current?.reset();
    } finally {
      setLoading(false);
    }
  }

  async function verifyEmail(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/api/auth/verify-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail, otp: verificationCode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.message || data.error || 'Invalid verification code.');
      finishAuthentication(data);
    } catch {
      setError('Cannot reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/api/auth/resend-verification-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Only a real rate-limit response should lock the resend button. A
        // provider/configuration failure invalidates the undelivered OTP on the
        // backend, so the patient must be allowed to retry immediately.
        setResendSeconds(response.status === 429 ? Number(data.retryAfter) || 60 : 0);
        return setError(data.error || 'Please wait before requesting another code.');
      }
      setResendSeconds(60);
    } catch {
      setError('Cannot reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (verificationEmail) {
    return (
      <main className="auth-page">
        <section className="auth-shell signup" aria-labelledby="verify-email-title">
          <div className="auth-logo">
            <img src={pharmateLogo} alt="PharMate" />
          </div>
          <header className="auth-heading">
            <span className="auth-kicker">Email verification</span>
            <h1 id="verify-email-title">Check your email</h1>
            <p>Enter the six-digit code sent to {verificationEmail}.</p>
          </header>
          {error && (
            <div className="auth-alert error" role="alert">
              {error}
            </div>
          )}
          <form className="auth-form" onSubmit={verifyEmail}>
            <label>
              <span>Verification code</span>
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ''))}
                pattern="[0-9]{6}"
                required
                value={verificationCode}
              />
            </label>
            <button className="auth-primary" disabled={loading || verificationCode.length !== 6}>
              {loading ? 'Verifying…' : 'Verify Email'}
            </button>
            <button
              className="auth-text-button"
              disabled={loading || resendSeconds > 0}
              onClick={resendVerification}
              type="button"
            >
              {resendSeconds > 0 ? `Resend available in ${resendSeconds}s` : 'Resend code'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  async function submitGoogle(credential) {
    setError('');
    if (!agreed) {
      setError('Please agree to the Terms of Service and Privacy Policy first.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, role: form.role }),
      });
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : {};
      if (!response.ok) {
        setError(
          data.error ||
            (response.status >= 500
              ? 'PharMate cannot reach the authentication server right now. Please try again.'
              : 'Google sign-up could not be completed.')
        );
        return;
      }
      finishAuthentication(data);
    } catch {
      setError('Cannot reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-shell signup" aria-labelledby="signup-title">
        <div className="auth-logo" aria-label="PharMate">
          <img src={pharmateLogo} alt="PharMate" />
        </div>
        <header className="auth-heading">
          <span className="auth-kicker">Patient or caregiver registration</span>
          <h1 id="signup-title">Create your account</h1>
          <p>Set up your secure PharMate account.</p>
        </header>
        {error && (
          <div className="auth-alert error" role="alert">
            {error}
          </div>
        )}
        <form className="auth-form" onSubmit={submit}>
          <fieldset className="auth-role-choice">
            <legend>Account type</legend>
            <label>
              <input
                checked={form.role === 'patient'}
                name="role"
                onChange={() => set('role', 'patient')}
                type="radio"
              />
              <span>Patient</span>
            </label>
            <label>
              <input
                checked={form.role === 'caregiver'}
                name="role"
                onChange={() => set('role', 'caregiver')}
                type="radio"
              />
              <span>Caregiver</span>
            </label>
          </fieldset>
          <label>
            <span>Full name</span>
            <input
              autoComplete="name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="Enter your full name"
              required
            />
          </label>
          <label>
            <span>Email address</span>
            <input
              autoComplete="email"
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              placeholder="Enter your email"
              required
            />
          </label>
          <PasswordField
            label="Password"
            value={form.password}
            onChange={(event) => set('password', event.target.value)}
            visible={showPassword}
            onToggle={() => setShowPassword((current) => !current)}
            autoComplete="new-password"
          />
          <ul className="auth-password-rules" aria-label="Password requirements">
            {passwordChecks.map((check) => (
              <li className={check.met ? 'met' : ''} key={check.label}>
                <span aria-hidden="true">{check.met ? '✓' : '○'}</span>
                {check.label}
              </li>
            ))}
          </ul>
          <PasswordField
            label="Confirm password"
            value={form.confirm}
            onChange={(event) => set('confirm', event.target.value)}
            visible={showConfirm}
            onToggle={() => setShowConfirm((current) => !current)}
            autoComplete="new-password"
          />
          <label className="auth-check">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>
              I agree to the <a href="#terms">Terms of Service</a> and{' '}
              <a href="/privacy#inquiries" target="_blank" rel="noreferrer">
                Inquiry Privacy Policy
              </a>
            </span>
          </label>
          <p className="auth-privacy-note">
            Pharmacist inquiries are optional. Before sending one, you will be asked separately to
            consent to storing the conversation and its history on PharMate’s server.
          </p>
          <CaptchaChallenge
            ref={captchaRef}
            action="register"
            onChange={setCaptcha}
            onError={setError}
          />
          <button className="auth-primary" disabled={loading || !captchaComplete}>
            {loading ? 'Creating account…' : 'Sign Up'}
          </button>
        </form>
        <div className="auth-divider">or sign up securely with</div>
        <div className="auth-google-button">
          {GOOGLE_CLIENT_ID ? (
            <GoogleLogin
              onSuccess={(response) => submitGoogle(response.credential)}
              onError={() => setError('Google sign-up was cancelled or could not start.')}
              shape="rectangular"
              size="large"
              text="signup_with"
              theme="outline"
              width="390"
            />
          ) : (
            <button className="auth-google-disabled" disabled type="button">
              Sign up with Google (configuration required)
            </button>
          )}
        </div>
        <p className="auth-signin">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
