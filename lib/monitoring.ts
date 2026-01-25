/**
 * Monitoring & Observability Module
 * Tracks metrics, logs events, and reports errors
 */

import * as Sentry from '@sentry/nextjs';

// ============ Types ============

export interface JobMetrics {
  jobId: string;
  query: string;
  location: string | null;
  requestedCount: number;
  actualCount: number;
  startedAt: number;
  completedAt?: number;
  status: 'started' | 'completed' | 'failed';
  error?: string;
  emailsFound: number;
  sourceBreakdown: Record<string, number>;
}

export interface SourceMetrics {
  source: string;
  attempts: number;
  successes: number;
  failures: number;
  totalLeads: number;
  avgResponseTime: number;
  rateLimitHits: number;
  lastError?: string;
}

export interface PerformanceMetrics {
  apiResponseTimes: number[];
  browserPoolUtilization: number;
  cacheHitRate: number;
  avgJobDuration: number;
}

export interface DailyStats {
  date: string;
  jobsStarted: number;
  jobsCompleted: number;
  jobsFailed: number;
  totalLeadsFound: number;
  totalEmailsFound: number;
  uniqueUsers: number;
  topQueries: Array<{ query: string; count: number }>;
  topLocations: Array<{ location: string; count: number }>;
  sourcePerformance: Record<string, SourceMetrics>;
}

// ============ In-Memory Metrics Store ============
// In production, this would be backed by Redis or a metrics service

const metricsStore = {
  jobs: new Map<string, JobMetrics>(),
  sources: new Map<string, SourceMetrics>(),
  apiResponseTimes: [] as number[],
  recentErrors: [] as Array<{ timestamp: number; error: string; context: Record<string, unknown> }>,
  dailyStats: new Map<string, Partial<DailyStats>>(),
};

// Limit stored data to prevent memory issues
const MAX_JOBS = 1000;
const MAX_RESPONSE_TIMES = 1000;
const MAX_ERRORS = 100;

// ============ Logging ============

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(formatLog('debug', message, context));
    }
  },

  info(message: string, context?: LogContext) {
    console.info(formatLog('info', message, context));
  },

  warn(message: string, context?: LogContext) {
    console.warn(formatLog('warn', message, context));
    // Also send to Sentry as breadcrumb
    Sentry.addBreadcrumb({
      category: 'warning',
      message,
      level: 'warning',
      data: context,
    });
  },

  error(message: string, error?: Error | unknown, context?: LogContext) {
    console.error(formatLog('error', message, context));

    // Store recent error
    metricsStore.recentErrors.push({
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : String(error),
      context: context || {},
    });
    if (metricsStore.recentErrors.length > MAX_ERRORS) {
      metricsStore.recentErrors.shift();
    }

    // Report to Sentry
    if (error instanceof Error) {
      Sentry.captureException(error, {
        extra: context,
        tags: { component: 'lead-gen-tool' },
      });
    } else {
      Sentry.captureMessage(message, {
        level: 'error',
        extra: { error, ...context },
      });
    }
  },
};

// ============ Job Tracking ============

export function trackJobStarted(
  jobId: string,
  query: string,
  location: string | null,
  requestedCount: number
): void {
  const metrics: JobMetrics = {
    jobId,
    query,
    location,
    requestedCount,
    actualCount: 0,
    startedAt: Date.now(),
    status: 'started',
    emailsFound: 0,
    sourceBreakdown: {},
  };

  metricsStore.jobs.set(jobId, metrics);

  // Trim old jobs
  if (metricsStore.jobs.size > MAX_JOBS) {
    const oldest = Array.from(metricsStore.jobs.keys())[0];
    metricsStore.jobs.delete(oldest);
  }

  // Update daily stats
  updateDailyStats((stats) => {
    stats.jobsStarted = (stats.jobsStarted || 0) + 1;
  });

  logger.info('Job started', { jobId, query, location, requestedCount });

  // Sentry transaction
  Sentry.startSpan(
    {
      name: 'job.process',
      op: 'job',
      attributes: { jobId, query, location: location || 'none' },
    },
    () => {}
  );
}

export function trackJobProgress(
  jobId: string,
  leadsFound: number,
  emailsFound: number,
  sourceBreakdown: Record<string, number>
): void {
  const metrics = metricsStore.jobs.get(jobId);
  if (metrics) {
    metrics.actualCount = leadsFound;
    metrics.emailsFound = emailsFound;
    metrics.sourceBreakdown = sourceBreakdown;
  }
}

export function trackJobCompleted(
  jobId: string,
  leadsFound: number,
  emailsFound: number
): void {
  const metrics = metricsStore.jobs.get(jobId);
  if (metrics) {
    metrics.status = 'completed';
    metrics.completedAt = Date.now();
    metrics.actualCount = leadsFound;
    metrics.emailsFound = emailsFound;

    const duration = metrics.completedAt - metrics.startedAt;

    // Update daily stats
    updateDailyStats((stats) => {
      stats.jobsCompleted = (stats.jobsCompleted || 0) + 1;
      stats.totalLeadsFound = (stats.totalLeadsFound || 0) + leadsFound;
      stats.totalEmailsFound = (stats.totalEmailsFound || 0) + emailsFound;
    });

    logger.info('Job completed', {
      jobId,
      leadsFound,
      emailsFound,
      durationMs: duration,
    });
  }
}

export function trackJobFailed(jobId: string, error: Error | string): void {
  const metrics = metricsStore.jobs.get(jobId);
  if (metrics) {
    metrics.status = 'failed';
    metrics.completedAt = Date.now();
    metrics.error = error instanceof Error ? error.message : error;

    // Update daily stats
    updateDailyStats((stats) => {
      stats.jobsFailed = (stats.jobsFailed || 0) + 1;
    });

    logger.error('Job failed', error instanceof Error ? error : new Error(String(error)), {
      jobId,
    });
  }
}

// ============ Source Tracking ============

export function trackSourceAttempt(source: string): void {
  const metrics = getOrCreateSourceMetrics(source);
  metrics.attempts++;
}

export function trackSourceSuccess(
  source: string,
  leadsFound: number,
  responseTimeMs: number
): void {
  const metrics = getOrCreateSourceMetrics(source);
  metrics.successes++;
  metrics.totalLeads += leadsFound;

  // Running average of response time
  const totalResponses = metrics.successes;
  metrics.avgResponseTime =
    (metrics.avgResponseTime * (totalResponses - 1) + responseTimeMs) / totalResponses;

  logger.debug('Source success', { source, leadsFound, responseTimeMs });
}

export function trackSourceFailure(source: string, error: string): void {
  const metrics = getOrCreateSourceMetrics(source);
  metrics.failures++;
  metrics.lastError = error;

  logger.warn('Source failure', { source, error });
}

export function trackRateLimitHit(source: string): void {
  const metrics = getOrCreateSourceMetrics(source);
  metrics.rateLimitHits++;

  logger.warn('Rate limit hit', { source });
}

function getOrCreateSourceMetrics(source: string): SourceMetrics {
  let metrics = metricsStore.sources.get(source);
  if (!metrics) {
    metrics = {
      source,
      attempts: 0,
      successes: 0,
      failures: 0,
      totalLeads: 0,
      avgResponseTime: 0,
      rateLimitHits: 0,
    };
    metricsStore.sources.set(source, metrics);
  }
  return metrics;
}

// ============ Performance Tracking ============

export function trackApiResponseTime(endpoint: string, durationMs: number): void {
  metricsStore.apiResponseTimes.push(durationMs);
  if (metricsStore.apiResponseTimes.length > MAX_RESPONSE_TIMES) {
    metricsStore.apiResponseTimes.shift();
  }

  // Log slow requests
  if (durationMs > 5000) {
    logger.warn('Slow API response', { endpoint, durationMs });
  }
}

export function trackBrowserPoolMetrics(
  totalBrowsers: number,
  activeBrowsers: number,
  queuedRequests: number
): void {
  const utilization = totalBrowsers > 0 ? activeBrowsers / totalBrowsers : 0;

  if (utilization > 0.9) {
    logger.warn('Browser pool near capacity', {
      totalBrowsers,
      activeBrowsers,
      queuedRequests,
    });
  }
}

// ============ Daily Stats ============

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function updateDailyStats(updater: (stats: Partial<DailyStats>) => void): void {
  const key = getTodayKey();
  let stats = metricsStore.dailyStats.get(key);
  if (!stats) {
    stats = { date: key };
    metricsStore.dailyStats.set(key, stats);
  }
  updater(stats);
}

// ============ Metrics Retrieval ============

export function getJobMetrics(jobId: string): JobMetrics | undefined {
  return metricsStore.jobs.get(jobId);
}

export function getSourceMetrics(): Map<string, SourceMetrics> {
  return new Map(metricsStore.sources);
}

export function getPerformanceMetrics(): PerformanceMetrics {
  const responseTimes = metricsStore.apiResponseTimes;
  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

  // Calculate job durations
  const completedJobs = Array.from(metricsStore.jobs.values()).filter(
    (j) => j.status === 'completed' && j.completedAt
  );
  const avgJobDuration =
    completedJobs.length > 0
      ? completedJobs.reduce((a, j) => a + (j.completedAt! - j.startedAt), 0) /
        completedJobs.length
      : 0;

  return {
    apiResponseTimes: responseTimes.slice(-100), // Last 100
    browserPoolUtilization: 0, // Would need to integrate with browser pool
    cacheHitRate: 0, // Would need to integrate with cache
    avgJobDuration,
  };
}

export function getDailyStats(date?: string): Partial<DailyStats> | undefined {
  const key = date || getTodayKey();
  return metricsStore.dailyStats.get(key);
}

export function getRecentErrors(): Array<{
  timestamp: number;
  error: string;
  context: Record<string, unknown>;
}> {
  return [...metricsStore.recentErrors].reverse(); // Most recent first
}

// ============ Health Check ============

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: boolean;
    cache: boolean;
    browserPool: boolean;
  };
  metrics: {
    jobSuccessRate: number;
    avgResponseTime: number;
    errorRate: number;
  };
  timestamp: number;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const jobs = Array.from(metricsStore.jobs.values());
  const recentJobs = jobs.filter((j) => j.startedAt > Date.now() - 3600000); // Last hour

  const completedJobs = recentJobs.filter((j) => j.status === 'completed').length;
  const failedJobs = recentJobs.filter((j) => j.status === 'failed').length;
  const totalJobs = completedJobs + failedJobs;

  const jobSuccessRate = totalJobs > 0 ? completedJobs / totalJobs : 1;

  const responseTimes = metricsStore.apiResponseTimes.slice(-100);
  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

  const recentErrors = metricsStore.recentErrors.filter(
    (e) => e.timestamp > Date.now() - 3600000
  ).length;
  const errorRate = recentErrors / Math.max(totalJobs, 1);

  // Determine overall status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (jobSuccessRate < 0.5 || errorRate > 0.5) {
    status = 'unhealthy';
  } else if (jobSuccessRate < 0.9 || errorRate > 0.1 || avgResponseTime > 10000) {
    status = 'degraded';
  }

  return {
    status,
    checks: {
      database: true, // Would need actual DB check
      cache: true, // Would need actual cache check
      browserPool: true, // Would need actual pool check
    },
    metrics: {
      jobSuccessRate,
      avgResponseTime,
      errorRate,
    },
    timestamp: Date.now(),
  };
}

// ============ Metrics Summary ============

export function getMetricsSummary(): {
  jobs: { total: number; completed: number; failed: number; inProgress: number };
  sources: Array<{ source: string; successRate: number; avgLeads: number }>;
  performance: { avgResponseTime: number; p95ResponseTime: number };
  errors: { last24h: number; lastHour: number };
} {
  const jobs = Array.from(metricsStore.jobs.values());

  // Job stats
  const jobStats = {
    total: jobs.length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    inProgress: jobs.filter((j) => j.status === 'started').length,
  };

  // Source stats
  const sourceStats = Array.from(metricsStore.sources.values())
    .map((s) => ({
      source: s.source,
      successRate: s.attempts > 0 ? s.successes / s.attempts : 0,
      avgLeads: s.successes > 0 ? s.totalLeads / s.successes : 0,
    }))
    .sort((a, b) => b.successRate - a.successRate);

  // Performance stats
  const responseTimes = [...metricsStore.apiResponseTimes].sort((a, b) => a - b);
  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;
  const p95Index = Math.floor(responseTimes.length * 0.95);
  const p95ResponseTime = responseTimes[p95Index] || 0;

  // Error stats
  const now = Date.now();
  const errors = metricsStore.recentErrors;
  const last24h = errors.filter((e) => e.timestamp > now - 86400000).length;
  const lastHour = errors.filter((e) => e.timestamp > now - 3600000).length;

  return {
    jobs: jobStats,
    sources: sourceStats,
    performance: { avgResponseTime, p95ResponseTime },
    errors: { last24h, lastHour },
  };
}

// ============ Alerting ============

export interface Alert {
  type: 'error_spike' | 'high_failure_rate' | 'slow_response' | 'rate_limit';
  severity: 'warning' | 'critical';
  message: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

const alertHistory: Alert[] = [];
const MAX_ALERTS = 100;

export function checkAlerts(): Alert[] {
  const newAlerts: Alert[] = [];
  const now = Date.now();

  // Check error spike
  const recentErrors = metricsStore.recentErrors.filter(
    (e) => e.timestamp > now - 300000 // Last 5 minutes
  ).length;
  if (recentErrors > 10) {
    newAlerts.push({
      type: 'error_spike',
      severity: recentErrors > 50 ? 'critical' : 'warning',
      message: `Error spike detected: ${recentErrors} errors in last 5 minutes`,
      timestamp: now,
      context: { errorCount: recentErrors },
    });
  }

  // Check job failure rate
  const recentJobs = Array.from(metricsStore.jobs.values()).filter(
    (j) => j.startedAt > now - 3600000
  );
  const failedJobs = recentJobs.filter((j) => j.status === 'failed').length;
  const failureRate = recentJobs.length > 0 ? failedJobs / recentJobs.length : 0;
  if (failureRate > 0.3 && recentJobs.length >= 5) {
    newAlerts.push({
      type: 'high_failure_rate',
      severity: failureRate > 0.5 ? 'critical' : 'warning',
      message: `High job failure rate: ${(failureRate * 100).toFixed(1)}%`,
      timestamp: now,
      context: { failureRate, totalJobs: recentJobs.length, failedJobs },
    });
  }

  // Check slow responses
  const recentResponseTimes = metricsStore.apiResponseTimes.slice(-20);
  const avgResponseTime =
    recentResponseTimes.length > 0
      ? recentResponseTimes.reduce((a, b) => a + b, 0) / recentResponseTimes.length
      : 0;
  if (avgResponseTime > 15000) {
    newAlerts.push({
      type: 'slow_response',
      severity: avgResponseTime > 30000 ? 'critical' : 'warning',
      message: `Slow API responses: ${(avgResponseTime / 1000).toFixed(1)}s average`,
      timestamp: now,
      context: { avgResponseTime },
    });
  }

  // Check rate limits
  const highRateLimitSources = Array.from(metricsStore.sources.values())
    .filter((s) => s.rateLimitHits > 10)
    .map((s) => s.source);
  if (highRateLimitSources.length > 0) {
    newAlerts.push({
      type: 'rate_limit',
      severity: 'warning',
      message: `Rate limits hit on sources: ${highRateLimitSources.join(', ')}`,
      timestamp: now,
      context: { sources: highRateLimitSources },
    });
  }

  // Store alerts
  for (const alert of newAlerts) {
    alertHistory.push(alert);
    if (alertHistory.length > MAX_ALERTS) {
      alertHistory.shift();
    }

    // Log alerts
    if (alert.severity === 'critical') {
      logger.error(alert.message, undefined, alert.context);
    } else {
      logger.warn(alert.message, alert.context);
    }
  }

  return newAlerts;
}

export function getAlertHistory(): Alert[] {
  return [...alertHistory].reverse();
}

// ============ Reset (for testing) ============

export function resetMetrics(): void {
  metricsStore.jobs.clear();
  metricsStore.sources.clear();
  metricsStore.apiResponseTimes.length = 0;
  metricsStore.recentErrors.length = 0;
  metricsStore.dailyStats.clear();
  alertHistory.length = 0;
}
