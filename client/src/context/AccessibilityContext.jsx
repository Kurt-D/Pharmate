/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'pm_senior_accessibility';

export const DEFAULT_ACCESSIBILITY = {
  textSize: 'standard',
  highContrast: false,
  warmTint: false,
  darkMode: false,
  boldText: false,
  extraSpacing: false,
  reduceMotion: true,
  enhancedFocus: true,
  ttsEnabled: true,
  speechRate: 'slow',
  speechLanguage: 'en',
  largeTouch: true,
  confirmActions: true,
};

export function readAccessibilityPreferences() {
  try {
    return { ...DEFAULT_ACCESSIBILITY, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return DEFAULT_ACCESSIBILITY;
  }
}

function applyPreferences(preferences) {
  const rootSizes = { standard: 16, large: 18, extraLarge: 22 };
  document.documentElement.style.fontSize = `${rootSizes[preferences.textSize] || 16}px`;
  document.body.classList.toggle('pm-a11y-high-contrast', preferences.highContrast);
  document.body.classList.toggle('pm-a11y-warm-tint', preferences.warmTint);
  document.body.classList.toggle('pm-a11y-dark-mode', preferences.darkMode);
  document.body.classList.toggle('pm-a11y-bold-text', preferences.boldText);
  document.body.classList.toggle('pm-a11y-extra-spacing', preferences.extraSpacing);
  document.body.classList.toggle('pm-a11y-reduce-motion', preferences.reduceMotion);
  document.body.classList.toggle('pm-a11y-enhanced-focus', preferences.enhancedFocus);
  document.body.classList.toggle('pm-a11y-large-touch', preferences.largeTouch);
  document.body.classList.toggle('pm-a11y-confirm-actions', preferences.confirmActions);
  document.body.classList.toggle('pm-a11y-tts-off', !preferences.ttsEnabled);
}

const AccessibilityContext = createContext(null);

export function AccessibilityProvider({ children }) {
  const [preferences, setPreferences] = useState(readAccessibilityPreferences);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    applyPreferences(preferences);
  }, [preferences]);

  const value = useMemo(
    () => ({
      preferences,
      updatePreference(key, value) {
        setPreferences((current) => ({ ...current, [key]: value }));
      },
      resetPreferences() {
        setPreferences(DEFAULT_ACCESSIBILITY);
      },
    }),
    [preferences]
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility() {
  const value = useContext(AccessibilityContext);
  if (!value) throw new Error('useAccessibility must be used inside AccessibilityProvider');
  return value;
}
