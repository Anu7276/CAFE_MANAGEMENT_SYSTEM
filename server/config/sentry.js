/**
 * Sentry Server SDK Configuration
 * Captures unhandled backend exceptions, database errors, and APM performance traces in production.
 */

const Sentry = require('@sentry/node');

const isSentryEnabled = Boolean(process.env.SENTRY_DSN);

function initSentry(app) {
  if (!isSentryEnabled) {
    return {
      enabled: false,
      captureException: (err) => console.error('[Error Tracker (Local)]', err.message)
    };
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: 'cafe-emerald-server@1.0.0',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    integrations: [
      // Standard HTTP integrations
      ...(Sentry.autoDiscoverNodePerformanceMonitoringIntegrations ? Sentry.autoDiscoverNodePerformanceMonitoringIntegrations() : [])
    ]
  });

  console.log('✓ Sentry Error Tracking initialized on backend');
  return {
    enabled: true,
    captureException: Sentry.captureException,
    captureMessage: Sentry.captureMessage
  };
}

module.exports = {
  initSentry,
  Sentry
};
