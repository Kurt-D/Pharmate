import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { INQUIRY_PRIVACY_VERSION } from '../../../shared/inquiryPrivacy.mjs';

export function useInquiryConsent() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await api('/api/patient/inquiry-consent');
      setState(response.data);
      setError('');
    } catch (failure) {
      setState(null);
      setError(failure.body?.message || failure.message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  async function update(accepted) {
    setBusy(true);
    setError('');
    try {
      const response = await api('/api/patient/inquiry-consent', {
        method: accepted ? 'POST' : 'DELETE',
        ...(accepted ? { body: { accepted: true, policy_version: INQUIRY_PRIVACY_VERSION } } : {}),
      });
      setState(response.data);
    } catch (failure) {
      setError(failure.body?.message || failure.message);
    } finally {
      setBusy(false);
    }
  }
  return {
    consented:
      !busy && state?.consented === true && state?.policy_version === INQUIRY_PRIVACY_VERSION,
    state,
    busy,
    error,
    refresh,
    update,
  };
}
