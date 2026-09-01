import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import { apiUrl } from '../config.js';

const PROVIDER = (import.meta.env.VITE_CAPTCHA_PROVIDER || 'turnstile').trim().toLowerCase();
const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
const DEVELOPMENT_BYPASS =
  import.meta.env.DEV && import.meta.env.VITE_DISABLE_CAPTCHA === 'true';

const CaptchaChallenge = forwardRef(function CaptchaChallenge(
  { action, onChange, onError },
  ref
) {
  const turnstileRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  const [svg, setSvg] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  const loadSelfHosted = useCallback(async () => {
    setLoading(true);
    setAnswer('');
    onChangeRef.current({ captchaToken: '', captchaAnswer: '' });
    try {
      const response = await fetch(apiUrl('/api/auth/captcha'), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.svg) throw new Error('Security challenge could not load.');
      setSvg(data.svg);
    } catch (error) {
      setSvg('');
      onErrorRef.current(error.message || 'Security challenge could not load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    onChangeRef.current = onChange;
    onErrorRef.current = onError;
  }, [onChange, onError]);

  useEffect(() => {
    if (DEVELOPMENT_BYPASS) {
      console.warn('[DEV] Bot protection bypassed for local testing');
      onChangeRef.current({ captchaToken: 'DEV_MODE_ACTIVE', captchaAnswer: '' });
    } else if (PROVIDER === 'self-hosted') {
      loadSelfHosted();
    }
  }, [loadSelfHosted]);

  useImperativeHandle(ref, () => ({
    reset() {
      if (DEVELOPMENT_BYPASS) {
        onChangeRef.current({ captchaToken: 'DEV_MODE_ACTIVE', captchaAnswer: '' });
      } else {
        onChangeRef.current({ captchaToken: '', captchaAnswer: '' });
      }
      if (!DEVELOPMENT_BYPASS && PROVIDER === 'self-hosted') loadSelfHosted();
      else turnstileRef.current?.reset();
    },
  }), [loadSelfHosted]);

  if (DEVELOPMENT_BYPASS) return null;

  if (PROVIDER === 'self-hosted') {
    const imageSource = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : '';
    return (
      <div className="auth-self-captcha" aria-label="Security verification">
        <div className="auth-self-captcha__image">
          {imageSource ? <img src={imageSource} alt="Security verification characters" /> : <span>{loading ? 'Loading security check…' : 'Security check unavailable'}</span>}
          <button type="button" onClick={loadSelfHosted} disabled={loading} aria-label="Get a new security challenge"><RefreshCw aria-hidden="true" /></button>
        </div>
        <label>
          <span>Enter the characters shown above</span>
          <input
            autoComplete="off"
            maxLength={8}
            required
            spellCheck="false"
            value={answer}
            onChange={(event) => {
              const value = event.target.value;
              setAnswer(value);
              onChange({ captchaToken: '', captchaAnswer: value.trim() });
            }}
          />
        </label>
      </div>
    );
  }

  if (PROVIDER !== 'turnstile' || !TURNSTILE_SITE_KEY) {
    return <div className="auth-security-notice" role="alert">Security verification is not configured. Contact the PharMate administrator.</div>;
  }

  return (
    <div className="auth-recaptcha" aria-label="Security verification">
      <Turnstile
        ref={turnstileRef}
        siteKey={TURNSTILE_SITE_KEY}
        onSuccess={(token) => onChange({ captchaToken: token, captchaAnswer: '' })}
        onExpire={() => onChange({ captchaToken: '', captchaAnswer: '' })}
        onError={() => {
          onChange({ captchaToken: '', captchaAnswer: '' });
          onError('Security verification could not load. Please try again.');
        }}
        options={{ action, appearance: 'always', refreshExpired: 'auto', theme: 'light' }}
      />
      <span className="auth-turnstile-label"><ShieldCheck aria-hidden="true" /> Privacy-friendly security check</span>
    </div>
  );
});

export default CaptchaChallenge;
