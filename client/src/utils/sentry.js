/**
 * Client Sentry Monitoring Configuration
 * Captures React rendering errors, unhandled promise rejections, and browser crashes.
 */

import * as Sentry from '@sentry/react';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

export function initClientSentry() {
  if (!sentryDsn) {
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE || 'development',
    release: 'cafe-emerald-client@1.0.0',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration()
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0
  });

  console.log('✓ Sentry Client Error Monitoring initialized');
}

export { Sentry };
