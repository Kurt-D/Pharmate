import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import pharmateLogo from '../assets/pharmate-logo.png';
import CaptchaChallenge from '../components/CaptchaChallenge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiUrl } from '../config.js';
import { homeForRole } from '../config/roleRoutes.js';
import '../styles/auth.css';

const MAX_FAILED_ATTEMPTS = 5;
const DEFAULT_COOLDOWN_SECONDS = 60;
const COOLDOWN_STORAGE_KEY = 'pm_login_cooldown_until';
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

const PASSWORD_CHECKS = [
  { label: '12+ characters', test: (value) => value.length >= 12 },
  { label: 'Upper & lowercase', test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { label: 'At least one number', test: (value) => /\d/.test(value) },
  { label: 'At least one symbol', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

function PasswordToggleIcon({ visible }) {
  return visible ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.3A10.7 10.7 0 0 1 12 4c5.5 0 9 5.2 9 5.2a14 14 0 0 1-2.2 2.6M6.6 6.6A15.2 15.2 0 0 0 3 10.2S6.5 16 12 16a10 10 0 0 0 3-.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 10.2S6.5 4 12 4s9 6.2 9 6.2S17.5 16 12 16s-9-5.8-9-5.8Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

function PinInput({ value, onChange, disabled }) {
  const inputRefs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] || '');

  function updateDigit(index, nextValue) {
    const next = digits.slice();
    next[index] = nextValue.replace(/\D/g, '').slice(-1);
    onChange(next.join(''));
    if (next[index] && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handlePaste(event) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, 6) - 1]?.focus();
  }

  return (
    <div className="auth-pin-boxes" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          aria-label={`PIN digit ${index + 1}`}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          disabled={disabled}
          inputMode="numeric"
          key={index}
          maxLength={1}
          onChange={(event) => updateDigit(index, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digit && index > 0) {
              inputRefs.current[index - 1]?.focus();
            }
          }}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          type="text"
          value={digit}
        />
      ))}
    </div>
  );
}

function getStoredCooldown() {
  const stored = Number(sessionStorage.getItem(COOLDOWN_STORAGE_KEY));
  return Number.isFinite(stored) && stored > Date.now() ? stored : 0;
}

function retryAfterSeconds(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1, Math.ceil(seconds));
  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? 0 : Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
}

function formatCooldown(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export default function LoginRedesign() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useAuth();
  const tokenFromEmail = params.get('token') || '';
  const rememberedEmail = localStorage.getItem('pm_remember_email') || '';

  const [mode, setMode] = useState(tokenFromEmail ? 'recovery' : 'login');
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(Boolean(rememberedEmail));
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState({ captchaToken: '', captchaAnswer: '' });
  const captchaRef = useRef(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(
    params.get('reset') === 'success'
      ? 'Your password was reset successfully. Sign in with your new password.'
      : params.get('reason') === 'session-expired'
        ? 'Your session expired. Please sign in again to continue.'
        : ''
  );
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(getStoredCooldown);
  const [cooldownSeconds, setCooldownSeconds] = useState(() =>
    Math.max(0, Math.ceil((getStoredCooldown() - Date.now()) / 1000))
  );

  const [recoveryStep, setRecoveryStep] = useState(tokenFromEmail ? 3 : 1);
  const [recoveryEmail, setRecoveryEmail] = useState(rememberedEmail);
  const [pin, setPin] = useState('');
  const [resetToken, setResetToken] = useState(tokenFromEmail);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  const passwordScore = useMemo(
    () => PASSWORD_CHECKS.filter((check) => check.test(newPassword)).length,
    [newPassword]
  );
  const strengthLabel = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][passwordScore];
  const loginLocked = cooldownSeconds > 0;
  const captchaComplete = Boolean(captcha.captchaToken || captcha.captchaAnswer);

  useEffect(() => {
    if (!cooldownUntil) return undefined;

    function updateCountdown() {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownSeconds(remaining);

      if (remaining === 0) {
        sessionStorage.removeItem(COOLDOWN_STORAGE_KEY);
        setCooldownUntil(0);
        setFailedAttempts(0);
      }
    }

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setInterval(
      () => setResendSeconds((current) => Math.max(0, current - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  function startCooldown(seconds = DEFAULT_COOLDOWN_SECONDS) {
    const safeSeconds = Math.max(1, Math.ceil(seconds));
    const until = Date.now() + safeSeconds * 1000;
    sessionStorage.setItem(COOLDOWN_STORAGE_KEY, String(until));
    setCooldownSeconds(safeSeconds);
    setCooldownUntil(until);
    setPassword('');
  }

  function clearFeedback() {
    setError('');
    setMessage('');
  }

  function returnToLogin() {
    clearFeedback();
    setMode('login');
    setRecoveryStep(1);
    setPin('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setResetComplete(false);
    navigate('/login', { replace: true });
  }

  async function authenticate(loginEmail, loginPassword, shouldRemember = remember) {
    if (loginLocked) return;
    clearFeedback();
    setLoading(true);

    try {
      const cleanEmail = loginEmail.trim();
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: cleanEmail, password: loginPassword, ...captcha }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCaptcha({ captchaToken: '', captchaAnswer: '' });
        captchaRef.current?.reset();
        if (response.status === 429 || response.status === 423) {
          startCooldown(
            Number(data.retryAfter) ||
              retryAfterSeconds(response.headers.get('Retry-After')) ||
              DEFAULT_COOLDOWN_SECONDS
          );
          return;
        }

        if (response.status === 401) {
          const nextAttempt = failedAttempts + 1;
          setFailedAttempts(nextAttempt);
          if (nextAttempt >= MAX_FAILED_ATTEMPTS) {
            setError('');
            startCooldown();
            return;
          }
        }

        setError(data.error || 'We could not sign you in. Check your details and try again.');
        return;
      }

      if (shouldRemember) localStorage.setItem('pm_remember_email', cleanEmail);
      else localStorage.removeItem('pm_remember_email');

      sessionStorage.removeItem(COOLDOWN_STORAGE_KEY);
      setFailedAttempts(0);

      login(data.user, data.accessToken, data.refreshToken);
      navigate(homeForRole(data.role || data.user.role), { replace: true });
    } catch {
      setError('PharMate cannot reach the server right now. Please check your connection.');
      setCaptcha({ captchaToken: '', captchaAnswer: '' });
      captchaRef.current?.reset();
    } finally {
      setLoading(false);
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    await authenticate(email, password);
  }

  async function submitGoogle(credential) {
    clearFeedback();
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || 'Google sign-in could not be completed.');
        return;
      }
      login(data.user, data.accessToken, data.refreshToken);
      navigate(homeForRole(data.role || data.user.role), { replace: true });
    } catch {
      setError('PharMate cannot reach the server right now. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function requestPin(event) {
    event?.preventDefault();
    clearFeedback();
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'We could not send a recovery PIN. Please try again.');
        return;
      }
      setMessage('If this email is registered, a 6-digit PIN has been sent.');
      setPin('');
      setResendSeconds(60);
      setRecoveryStep(2);
    } catch {
      setError('PharMate cannot reach the server right now. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyPin(event) {
    event.preventDefault();
    clearFeedback();
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/api/auth/verify-pin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim(), pin }),
      });
      const data = await response.json();
      if (!response.ok || !data.resetToken) {
        setError(data.error || 'That PIN is invalid or has expired.');
        return;
      }
      setResetToken(data.resetToken);
      setRecoveryStep(3);
    } catch {
      setError('PharMate cannot reach the server right now. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    clearFeedback();
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'We could not reset your password. Please request a new PIN.');
        return;
      }
      setResetComplete(true);
    } catch {
      setError('PharMate cannot reach the server right now. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-orb auth-orb--one" aria-hidden="true" />
      <div className="auth-orb auth-orb--two" aria-hidden="true" />

      <section className="auth-shell" aria-labelledby="auth-title">
        <div className="auth-logo" aria-label="PharMate">
          <img src={pharmateLogo} alt="PharMate" />
        </div>

        {mode === 'login' ? (
          <>
            <header className="auth-heading">
              <h1 id="auth-title">Welcome Back!</h1>
              <p>Sign in to your PharMate account.</p>
            </header>

            <div className="auth-feedback" aria-live="assertive">
              {loginLocked ? (
                <div className="auth-alert cooldown" role="alert">
                  <span className="auth-alert-icon" aria-hidden="true">
                    !
                  </span>
                  <span>
                    <strong>Too many failed attempts</strong>
                    Sign-in is temporarily paused. Retry in <b>{formatCooldown(cooldownSeconds)}</b>
                    .
                  </span>
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>

            <form
              className={`auth-form${loginLocked ? ' auth-form--locked' : ''}`}
              onSubmit={submitLogin}
            >
              <label>
                <span>Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email address"
                  autoComplete="email"
                  disabled={loginLocked || loading}
                  required
                />
              </label>

              <label>
                <span>Password</span>
                <div className="auth-password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    disabled={loginLocked || loading}
                    required
                  />
                  <button
                    className={`auth-password-toggle${showPassword ? ' is-visible' : ''}`}
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    disabled={loginLocked}
                  >
                    <PasswordToggleIcon visible={showPassword} />
                    <span>{showPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
              </label>

              <div className="auth-options">
                <label className="auth-check">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  className="auth-text-button"
                  onClick={() => navigate('/forgot-password')}
                >
                  Forgot password?
                </button>
              </div>

              <CaptchaChallenge
                ref={captchaRef}
                action="login"
                onChange={setCaptcha}
                onError={setError}
              />

              <button
                className="auth-primary"
                disabled={loading || loginLocked || !captchaComplete}
              >
                {loading ? <span className="auth-spinner" aria-hidden="true" /> : null}
                {loading ? 'Signing in…' : 'Login'}
              </button>
            </form>

            <div className="auth-divider">or continue securely with</div>
            <div className="auth-google-button">
              {GOOGLE_CLIENT_ID ? (
                <GoogleLogin
                  onSuccess={(response) => submitGoogle(response.credential)}
                  onError={() => setError('Google sign-in was cancelled or could not start.')}
                  size="large"
                  shape="rectangular"
                  text="continue_with"
                  theme="outline"
                  width="360"
                />
              ) : (
                <button className="auth-google-disabled" disabled type="button">
                  Continue with Google (configuration required)
                </button>
              )}
            </div>

            <div className="auth-signup-footer">
              <p>
                Don&apos;t have an account? <Link to="/signup">Sign Up</Link>
              </p>
            </div>
          </>
        ) : (
          <div className="auth-recovery">
            <button type="button" className="auth-back" onClick={returnToLogin}>
              <span aria-hidden="true">←</span> Back to login
            </button>

            {!resetComplete ? (
              <>
                <header className="auth-heading">
                  <span className="auth-kicker">Account recovery</span>
                  <h1 id="auth-title">
                    {recoveryStep === 1 && 'Forgot your password?'}
                    {recoveryStep === 2 && 'Enter your 6-digit PIN'}
                    {recoveryStep === 3 && 'Create a new password'}
                  </h1>
                  <p>
                    {recoveryStep === 1 && 'Enter the email connected to your PharMate account.'}
                    {recoveryStep === 2 && `We sent a recovery PIN to ${recoveryEmail}.`}
                    {recoveryStep === 3 && 'Choose a strong password you have not used before.'}
                  </p>
                </header>

                <ol className="auth-steps" aria-label="Password recovery progress">
                  {[1, 2, 3].map((step) => (
                    <li
                      key={step}
                      className={
                        step === recoveryStep ? 'active' : step < recoveryStep ? 'done' : ''
                      }
                      aria-current={step === recoveryStep ? 'step' : undefined}
                    >
                      <span>{step < recoveryStep ? '✓' : step}</span>
                      <small>{['Email', 'PIN', 'Password'][step - 1]}</small>
                    </li>
                  ))}
                </ol>

                <div className="auth-feedback" aria-live="polite">
                  {error && <div className="auth-alert error">{error}</div>}
                  {message && <div className="auth-alert success">{message}</div>}
                </div>

                {recoveryStep === 1 && (
                  <form className="auth-form" onSubmit={requestPin}>
                    <label>
                      <span>Email address</span>
                      <input
                        type="email"
                        value={recoveryEmail}
                        onChange={(event) => setRecoveryEmail(event.target.value)}
                        placeholder="Enter your email address"
                        autoComplete="email"
                        required
                      />
                    </label>
                    <button className="auth-primary" disabled={loading}>
                      {loading ? 'Sending PIN…' : 'Send 6-Digit PIN'}
                    </button>
                  </form>
                )}

                {recoveryStep === 2 && (
                  <form className="auth-form" onSubmit={verifyPin}>
                    <fieldset className="auth-pin-fieldset">
                      <legend>6-digit PIN</legend>
                      <PinInput value={pin} onChange={setPin} disabled={loading} />
                    </fieldset>
                    <button className="auth-primary" disabled={loading || pin.length !== 6}>
                      {loading ? 'Verifying…' : 'Verify PIN'}
                    </button>
                    <div className="auth-recovery-actions">
                      <button
                        type="button"
                        className="auth-text-button"
                        onClick={() => {
                          clearFeedback();
                          setRecoveryStep(1);
                        }}
                      >
                        Change email
                      </button>
                      <button
                        type="button"
                        className="auth-text-button"
                        disabled={loading || resendSeconds > 0}
                        onClick={() => requestPin()}
                      >
                        {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend PIN'}
                      </button>
                    </div>
                  </form>
                )}

                {recoveryStep === 3 && (
                  <form className="auth-form" onSubmit={resetPassword}>
                    <label>
                      <span>New password</span>
                      <div className="auth-password-field">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          placeholder="Enter your new password"
                          autoComplete="new-password"
                          minLength={12}
                          required
                        />
                        <button
                          className={`auth-password-toggle${showNewPassword ? ' is-visible' : ''}`}
                          type="button"
                          onClick={() => setShowNewPassword((value) => !value)}
                          aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                          aria-pressed={showNewPassword}
                          title={showNewPassword ? 'Hide password' : 'Show password'}
                        >
                          <PasswordToggleIcon visible={showNewPassword} />
                          <span>{showNewPassword ? 'Hide' : 'Show'}</span>
                        </button>
                      </div>
                    </label>

                    <div className={`auth-meter auth-meter--${passwordScore}`}>
                      <div>
                        {[1, 2, 3, 4].map((bar) => (
                          <span key={bar} className={bar <= passwordScore ? 'filled' : ''} />
                        ))}
                      </div>
                      <strong>{strengthLabel}</strong>
                    </div>

                    <ul className="auth-password-rules">
                      {PASSWORD_CHECKS.map((check) => (
                        <li key={check.label} className={check.test(newPassword) ? 'met' : ''}>
                          <span aria-hidden="true">{check.test(newPassword) ? '✓' : '○'}</span>
                          {check.label}
                        </li>
                      ))}
                    </ul>

                    <label>
                      <span>Confirm new password</span>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="Re-enter your new password"
                        autoComplete="new-password"
                        minLength={12}
                        required
                      />
                    </label>

                    <button
                      className="auth-primary"
                      disabled={loading || newPassword.length < 12 || !confirmPassword}
                    >
                      {loading ? 'Updating password…' : 'Reset Password'}
                    </button>
                  </form>
                )}
              </>
            ) : (
              <div className="auth-reset-success" role="status">
                <span aria-hidden="true">✓</span>
                <h1 id="auth-title">Password updated</h1>
                <p>Your password has been reset. You can now sign in to your PharMate account.</p>
                <button type="button" className="auth-primary" onClick={returnToLogin}>
                  Return to Login
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
