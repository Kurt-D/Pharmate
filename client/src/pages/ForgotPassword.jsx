import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import pharmateLogo from '../assets/pharmate-logo.png';
import CaptchaChallenge from '../components/CaptchaChallenge.jsx';
import { apiUrl } from '../config.js';
import '../styles/auth.css';

const PASSWORD_RULES = [
  { label: '12 or more characters', test: (value) => value.length >= 12 },
  { label: 'Uppercase and lowercase letters', test: (value) => /[A-Z]/.test(value) && /[a-z]/.test(value) },
  { label: 'At least one number', test: (value) => /\d/.test(value) },
  { label: 'At least one special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

function PinBoxes({ value, onChange, disabled }) {
  const refs = useRef([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] || '');

  function commit(index, input) {
    const next = digits.slice();
    next[index] = input.replace(/\D/g, '').slice(-1);
    onChange(next.join(''));
    if (next[index] && index < 5) refs.current[index + 1]?.focus();
  }

  function paste(event) {
    const next = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!next) return;
    event.preventDefault();
    onChange(next);
    refs.current[Math.max(0, next.length - 1)]?.focus();
  }

  return (
    <div className="auth-pin-boxes" onPaste={paste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => { refs.current[index] = element; }}
          aria-label={`PIN digit ${index + 1}`}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          type="text"
          value={digit}
          onChange={(event) => commit(index, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digit && index > 0) refs.current[index - 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}

function PasswordField({ label, value, onChange, visible, onToggle, autoFocus = false }) {
  return (
    <label>
      <span>{label}</span>
      <div className="auth-password-field">
        <input
          autoFocus={autoFocus}
          autoComplete="new-password"
          minLength={12}
          placeholder={`Enter ${label.toLowerCase()}`}
          required
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className={visible ? 'is-visible' : ''}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={onToggle}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          <span>{visible ? 'Hide' : 'Show'}</span>
        </button>
      </div>
    </label>
  );
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const linkToken = params.get('token') || '';
  const [step, setStep] = useState(linkToken ? 3 : 1);
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [resetToken, setResetToken] = useState(linkToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [captcha, setCaptcha] = useState({ captchaToken: '', captchaAnswer: '' });
  const captchaRef = useRef(null);

  const passedRules = useMemo(
    () => PASSWORD_RULES.filter((rule) => rule.test(newPassword)).length,
    [newPassword]
  );
  const passwordReady = passedRules === PASSWORD_RULES.length && newPassword === confirmPassword;
  const captchaComplete = Boolean(captcha.captchaToken || captcha.captchaAnswer);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(
      () => setCooldown((current) => Math.max(0, current - 1)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function clearFeedback() {
    setError('');
    setMessage('');
  }

  async function requestPin(event) {
    event?.preventDefault();
    clearFeedback();
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), ...captcha }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The PIN could not be sent. Please try again.');
      setPin('');
      setCaptcha({ captchaToken: '', captchaAnswer: '' });
      setCooldown(60);
      setMessage(data.message || 'If the email exists, a 6-digit code has been sent.');
      setStep(2);
    } catch (requestError) {
      setError(requestError.message || 'PharMate cannot reach the server right now.');
      setCaptcha({ captchaToken: '', captchaAnswer: '' });
      captchaRef.current?.reset();
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
        body: JSON.stringify({ email: email.trim(), pin }),
      });
      const data = await response.json().catch(() => ({}));
      const token = data.reset_token || data.resetToken;
      if (!response.ok || !token) throw new Error(data.error || 'That PIN is invalid or expired.');
      setResetToken(token);
      setStep(3);
    } catch (requestError) {
      setError(requestError.message || 'The PIN could not be verified.');
    } finally {
      setLoading(false);
    }
  }

  async function submitPassword(event) {
    event.preventDefault();
    clearFeedback();
    if (!passwordReady) {
      setError('Complete every password requirement and make sure both passwords match.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reset_token: resetToken,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The password could not be reset.');
      navigate('/login?reset=success', { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'The password could not be reset.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-orb auth-orb--one" aria-hidden="true" />
      <div className="auth-orb auth-orb--two" aria-hidden="true" />
      <section className="auth-shell auth-recovery" aria-labelledby="recovery-title">
        <div className="auth-logo"><img src={pharmateLogo} alt="PharMate" /></div>
        <Link className="auth-back" to="/login"><ArrowLeft size={18} /> Back to login</Link>
        <header className="auth-heading">
          <span className="auth-kicker">Secure account recovery</span>
          <h1 id="recovery-title">{step === 1 ? 'Forgot your password?' : step === 2 ? 'Enter your 6-digit PIN' : 'Create a new password'}</h1>
          <p>{step === 1 ? 'Enter the email connected to your PharMate account.' : step === 2 ? `Enter the one-time code sent to ${email}. It expires in 10 minutes.` : 'Use a strong, unique password that you have not used before.'}</p>
        </header>

        <ol className="auth-steps" aria-label="Account recovery progress">
          {['Email', 'PIN', 'Password'].map((label, index) => {
            const number = index + 1;
            return <li key={label} className={number === step ? 'active' : number < step ? 'done' : ''} aria-current={number === step ? 'step' : undefined}><span>{number < step ? <Check size={16} /> : number}</span><small>{label}</small></li>;
          })}
        </ol>

        <div className="auth-feedback" aria-live="polite">
          {error && <div className="auth-alert error" role="alert">{error}</div>}
          {message && <div className="auth-alert success" role="status">{message}</div>}
        </div>

        {step === 1 && <form className="auth-form" onSubmit={requestPin}><label><span>Email address</span><input autoFocus autoComplete="email" type="email" required placeholder="Enter your email address" value={email} onChange={(event) => setEmail(event.target.value)} /></label><CaptchaChallenge ref={captchaRef} action="forgot_password" onChange={setCaptcha} onError={setError} /><button className="auth-primary" disabled={loading || !captchaComplete}>{loading ? <span className="auth-spinner" aria-hidden="true" /> : <Mail size={19} />}{loading ? 'Sending PIN…' : 'Send 6-Digit PIN'}</button></form>}

        {step === 2 && <form className="auth-form" onSubmit={verifyPin}><fieldset className="auth-pin-fieldset"><legend>6-digit security PIN</legend><PinBoxes value={pin} onChange={setPin} disabled={loading} /></fieldset><button className="auth-primary" disabled={loading || pin.length !== 6}>{loading ? <span className="auth-spinner" aria-hidden="true" /> : <ShieldCheck size={19} />}{loading ? 'Verifying…' : 'Verify PIN'}</button><div className="auth-recovery-actions"><button className="auth-text-button" type="button" onClick={() => { clearFeedback(); setStep(1); }}>Change email</button><button className="auth-text-button" type="button" disabled={loading || cooldown > 0} onClick={() => { clearFeedback(); setMessage('Complete the security check to request a new PIN.'); setStep(1); }}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend PIN'}</button></div></form>}

        {step === 3 && <form className="auth-form" onSubmit={submitPassword}><PasswordField label="New password" value={newPassword} onChange={setNewPassword} visible={showNewPassword} onToggle={() => setShowNewPassword((current) => !current)} autoFocus /><div className={`auth-meter auth-meter--${passedRules}`} aria-label={`${passedRules} of 4 password requirements met`}><div>{PASSWORD_RULES.map((rule) => <span key={rule.label} className={rule.test(newPassword) ? 'filled' : ''} />)}</div><strong>{passedRules}/4 met</strong></div><ul className="auth-password-rules">{PASSWORD_RULES.map((rule) => <li key={rule.label} className={rule.test(newPassword) ? 'met' : ''}><span aria-hidden="true">{rule.test(newPassword) ? '✓' : '○'}</span>{rule.label}</li>)}</ul><PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirmation} onToggle={() => setShowConfirmation((current) => !current)} />{confirmPassword && newPassword !== confirmPassword && <div className="auth-alert error" role="alert">The passwords do not match.</div>}<button className="auth-primary" disabled={loading || !passwordReady}>{loading ? <span className="auth-spinner" aria-hidden="true" /> : <KeyRound size={19} />}{loading ? 'Resetting password…' : 'Reset Password'}</button></form>}
      </section>
    </main>
  );
}
