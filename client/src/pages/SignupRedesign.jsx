import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import pharmateLogo from '../assets/pharmate-logo.png';
import splashLogo from '../assets/pharmate-splash-logo.png';
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
  { label: 'Special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  error,
  errorId,
}) {
  return (
    <label>
      <span>{label}</span>
      <div className="auth-password-field">
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          maxLength={72}
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
      {error && (
        <small className="auth-field-error" id={errorId} role="alert">
          {error}
        </small>
      )}
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
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: '' }));
  };
  const passwordChecks = useMemo(
    () => PASSWORD_CHECKS.map((check) => ({ ...check, met: check.test(form.password) })),
    [form.password]
  );
  const captchaComplete = Boolean(captcha.captchaToken || captcha.captchaAnswer);
  const formReadyForCaptcha =
    form.name.trim().length >= 2 &&
    EMAIL_PATTERN.test(form.email.trim()) &&
    passwordChecks.every((check) => check.met) &&
    form.password === form.confirm &&
    agreed;

  useEffect(() => {
    if (!formReadyForCaptcha) setCaptcha({ captchaToken: '', captchaAnswer: '' });
  }, [formReadyForCaptcha]);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setInterval(
      () => setResendSeconds((current) => Math.max(0, current - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  function finishAuthentication(data) {
    login(data.user, data.accessToken, data.csrfToken);
    const role = data.role || data.user.role;
    navigate(role === 'patient' ? '/patient/onboarding' : homeForRole(role), { replace: true });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    const cleanName = form.name.trim();
    const cleanEmail = form.email.trim().toLowerCase();
    const nextErrors = {};
    const nameLetters = cleanName.match(/\p{L}/gu) || [];
    if (cleanName.length < 2 || cleanName.length > 100 || nameLetters.length < 2) {
      nextErrors.name = 'Enter a valid full name using 2 to 100 characters.';
    }
    if (cleanEmail.length > 254 || !EMAIL_PATTERN.test(cleanEmail)) {
      nextErrors.email = 'Enter a valid email address, such as name@example.com.';
    }
    if (!passwordChecks.every((check) => check.met)) {
      nextErrors.password =
        'Use 12+ characters with uppercase, lowercase, a number, and a special character.';
    }
    if (form.password !== form.confirm) nextErrors.confirm = 'Passwords do not match.';
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return setError('Please correct the highlighted fields.');
    }
    if (!agreed) return setError('Please agree to the Terms of Service and Privacy Policy.');
    if (!captchaComplete) return setError('Please complete the security verification.');
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: cleanEmail,
          password: form.password,
          confirmPassword: form.confirm,
          ...captcha,
          role: form.role,
          full_name: cleanName,
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
        setVerificationEmail(data.email || cleanEmail);
        setVerificationCode('');
        setResendSeconds(Number(data.retryAfter) || 60);
        setMessage(
          data.codeSent === false
            ? data.message || 'A code was sent recently. Check your email before resending.'
            : data.message || 'A new six-digit code was sent to your email.'
        );
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
    setMessage('');
    try {
      const response = await fetch(apiUrl('/api/auth/verify-email'), {
        method: 'POST',
        credentials: 'include',
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
    setMessage('');
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
      setVerificationCode('');
      setResendSeconds(60);
      setMessage('A new six-digit verification code was sent. The previous code no longer works.');
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
          {message && (
            <div className="auth-alert success" role="status">
              {message}
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
      <section className="auth-shell signup auth-shell--signup-compact" aria-labelledby="signup-title">
        <header className="auth-app-hero">
          <button className="auth-app-hero__back" type="button" onClick={() => navigate('/login')} aria-label="Back">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7-7-7 7" /></svg>
          </button>
          <div className="auth-app-hero__brand">
            <img src={splashLogo} alt="" />
            <h1 id="signup-title">Sign up</h1>
            <p>Create your account</p>
          </div>
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
              aria-describedby={fieldErrors.name ? 'signup-name-error' : undefined}
              aria-invalid={Boolean(fieldErrors.name)}
              autoComplete="name"
              maxLength={100}
              minLength={2}
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="e.g. Juan Dela Cruz"
              required
            />
            {fieldErrors.name && (
              <small className="auth-field-error" id="signup-name-error" role="alert">
                {fieldErrors.name}
              </small>
            )}
          </label>
          <label>
            <span>Email address</span>
            <input
              aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
              aria-invalid={Boolean(fieldErrors.email)}
              autoComplete="email"
              maxLength={254}
              spellCheck="false"
              type="email"
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              placeholder="e.g. juan.delacruz@email.com"
              required
            />
            {fieldErrors.email && (
              <small className="auth-field-error" id="signup-email-error" role="alert">
                {fieldErrors.email}
              </small>
            )}
          </label>
          <PasswordField
            label="Password"
            value={form.password}
            onChange={(event) => set('password', event.target.value)}
            visible={showPassword}
            onToggle={() => setShowPassword((current) => !current)}
            autoComplete="new-password"
            error={fieldErrors.password}
            errorId="signup-password-error"
          />
          {form.password && (
            <ul className="auth-password-rules" aria-label="Password requirements">
              {passwordChecks.map((check) => (
                <li className={check.met ? 'met' : ''} key={check.label}>
                  <span aria-hidden="true">{check.met ? '✓' : '○'}</span>
                  {check.label}
                </li>
              ))}
            </ul>
          )}
          <PasswordField
            label="Confirm password"
            value={form.confirm}
            onChange={(event) => set('confirm', event.target.value)}
            visible={showConfirm}
            onToggle={() => setShowConfirm((current) => !current)}
            autoComplete="new-password"
            error={fieldErrors.confirm}
            errorId="signup-confirm-error"
          />
          <section className="auth-consent">
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
              Pharmacist questions are optional. We will ask for your permission before saving a
              conversation.
            </p>
          </section>
          {formReadyForCaptcha && (
            <CaptchaChallenge
              ref={captchaRef}
              action="register"
              onChange={setCaptcha}
              onError={setError}
            />
          )}
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
              width="300"
            />
          ) : (
            <button className="auth-google-disabled" disabled type="button">
              Sign up with Google (configuration required)
            </button>
          )}
        </div>
        <p className="auth-signin">
          Already have an account? <Link to="/login?view=signin">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
