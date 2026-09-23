import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import './styles/brand.css';
import App from './App.jsx';

const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
const application = googleClientId ? (
  <GoogleOAuthProvider clientId={googleClientId}>
    <App />
  </GoogleOAuthProvider>
) : (
  <App />
);

createRoot(document.getElementById('root')).render(<StrictMode>{application}</StrictMode>);

// The app shell is available after the first successful online visit. Sensitive
// API responses are intentionally excluded; patient pages keep a scoped cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
  );
}
