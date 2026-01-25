import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance Monitoring
  tracesSampleRate: 0.1, // 10% of transactions

  // Session Replay (optional)
  replaysSessionSampleRate: 0.01, // 1% of sessions
  replaysOnErrorSampleRate: 0.1, // 10% on error

  // Only send errors in production
  enabled: process.env.NODE_ENV === 'production',

  // Filter out noisy errors
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
  ],

  beforeSend(event) {
    // Don't send errors from bots/crawlers
    const userAgent = event.request?.headers?.['user-agent'] || '';
    if (/bot|crawler|spider|googlebot|bingbot/i.test(userAgent)) {
      return null;
    }
    return event;
  },
});
