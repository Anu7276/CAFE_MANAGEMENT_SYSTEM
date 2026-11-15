import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register PWA service worker for offline kiosk / kitchen tablet
if ('serviceWorker' in navigator && (import.meta.env?.PROD || process.env.NODE_ENV === 'production')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
    }).catch((err) => {
      console.warn('PWA service worker registration failed:', err);
    });
  });
}

