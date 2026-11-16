import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { initClientSentry } from './utils/sentry';

initClientSentry();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Manage PWA service worker (only in production; unregister in development to avoid stale asset cache)
if ('serviceWorker' in navigator) {
  if (import.meta.env?.PROD || process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        reg.update();
        console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
      }).catch((err) => {
        console.warn('PWA service worker registration failed:', err);
      });
    });
  } else {
    // In local development, unregister any service worker that may have been previously installed
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
      }
    });
  }
}

