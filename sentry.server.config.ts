import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Performance Monitoring
  tracesSampleRate: 0.1,

  // Only send errors in production
  enabled: process.env.NODE_ENV === 'production',

  // Capture unhandled promise rejections
  integrations: [
    Sentry.captureConsoleIntegration({ levels: ['error'] }),
  ],

  beforeSend(event) {
    // Filter out expected errors
    if (event.exception?.values?.[0]?.type === 'RateLimitError') {
      return null; // Don't report rate limit errors
    }
    return event;
  },
});
