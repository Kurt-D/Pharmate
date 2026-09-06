import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { inquiryPrivacy, INQUIRY_PRIVACY_VERSION } from '../../../shared/inquiryPrivacy.mjs';
import '../styles/inquiry-privacy.css';

export default function InquiryConsent({ consent }) {
  const { language } = useLanguage();
  const copy = inquiryPrivacy[language] || inquiryPrivacy.en;
  const [checked, setChecked] = useState(false);
  return (
    <section className="pm-inquiry-consent" aria-label={copy.title}>
      <h2>{copy.title}</h2>
      <p>{copy.storage}</p>
      <p>{copy.retention}</p>
      <details>
        <summary>
          {language === 'fil'
            ? 'Sino ang may access at ang iyong mga pagpipilian'
            : 'Who can access it and your choices'}
        </summary>
        {['access', 'identity', 'operators', 'device', 'record', 'choice', 'contact'].map((key) => (
          <p key={key}>{copy[key]}</p>
        ))}
      </details>
      <a href="/privacy#inquiries" target="_blank" rel="noreferrer">
        {copy.policyLink}
      </a>
      <p className="pm-inquiry-consent__status" role="status">
        {consent.busy
          ? language === 'fil'
            ? 'Sinusuri ang pahintulot…'
            : 'Checking consent…'
          : consent.consented
            ? copy.enabled
            : copy.disabled}
      </p>
      {consent.error && <p role="alert">{consent.error}</p>}
      {consent.error && (
        <button type="button" disabled={consent.busy} onClick={consent.refresh}>
          {language === 'fil' ? 'Subukan muli' : 'Retry'}
        </button>
      )}
      {consent.consented ? (
        <>
          <p>{copy.choice}</p>
          <button
            type="button"
            disabled={consent.busy}
            onClick={() => {
              setChecked(false);
              consent.update(false);
            }}
          >
            {copy.withdraw}
          </button>
        </>
      ) : (
        <>
          <label className="pm-inquiry-consent__check">
            <input
              type="checkbox"
              checked={checked}
              disabled={consent.busy}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <span>{copy.agreement}</span>
          </label>
          <button
            type="button"
            disabled={!checked || consent.busy || !consent.state}
            onClick={() => consent.update(true)}
          >
            {copy.grant}
          </button>
        </>
      )}
      <small>
        {language === 'fil' ? 'Bersiyon ng policy' : 'Policy version'}: {INQUIRY_PRIVACY_VERSION}
      </small>
    </section>
  );
}
