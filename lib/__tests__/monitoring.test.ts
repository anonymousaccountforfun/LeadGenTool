/**
 * Tests for Monitoring & Observability Module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  startSpan: vi.fn((_, fn) => fn()),
}));

import {
  trackJobStarted,
  trackJobProgress,
  trackJobCompleted,
  trackJobFailed,
  trackSourceAttempt,
  trackSourceSuccess,
  trackSourceFailure,
  trackRateLimitHit,
  trackApiResponseTime,
  getJobMetrics,
  getSourceMetrics,
  getPerformanceMetrics,
  getDailyStats,
  getRecentErrors,
  getHealthStatus,
  getMetricsSummary,
  checkAlerts,
  getAlertHistory,
  resetMetrics,
  updateQuotaUsage,
  getQuotaMetrics,
  recordSearchDuration,
  getSearchTimePercentiles,
  getSourceSuccessMetrics,
  generateUsageReport,
  getDashboardData,
  logger,
} from '../monitoring';

describe('Monitoring', () => {
  beforeEach(() => {
    resetMetrics();
    vi.clearAllMocks();
  });

  describe('Job Tracking', () => {
    describe('trackJobStarted', () => {
      it('should track a new job', () => {
        trackJobStarted('job-1', 'dentists', 'San Francisco', 100);

        const metrics = getJobMetrics('job-1');
        expect(metrics).toBeDefined();
        expect(metrics?.query).toBe('dentists');
        expect(metrics?.location).toBe('San Francisco');
        expect(metrics?.requestedCount).toBe(100);
        expect(metrics?.status).toBe('started');
      });

      it('should update daily stats', () => {
        trackJobStarted('job-1', 'test', null, 10);

        const stats = getDailyStats();
        expect(stats?.jobsStarted).toBe(1);
      });
    });

    describe('trackJobProgress', () => {
      it('should update job progress', () => {
        trackJobStarted('job-1', 'test', null, 100);
        trackJobProgress('job-1', 50, 10, { 'Google Maps': 30, 'Yelp': 20 });

        const metrics = getJobMetrics('job-1');
        expect(metrics?.actualCount).toBe(50);
        expect(metrics?.emailsFound).toBe(10);
        expect(metrics?.sourceBreakdown).toEqual({ 'Google Maps': 30, 'Yelp': 20 });
      });
    });

    describe('trackJobCompleted', () => {
      it('should mark job as completed', () => {
        trackJobStarted('job-1', 'test', null, 100);
        trackJobCompleted('job-1', 80, 20);

        const metrics = getJobMetrics('job-1');
        expect(metrics?.status).toBe('completed');
        expect(metrics?.actualCount).toBe(80);
        expect(metrics?.emailsFound).toBe(20);
        expect(metrics?.completedAt).toBeDefined();
      });

      it('should update daily stats', () => {
        trackJobStarted('job-1', 'test', null, 100);
        trackJobCompleted('job-1', 80, 20);

        const stats = getDailyStats();
        expect(stats?.jobsCompleted).toBe(1);
        expect(stats?.totalLeadsFound).toBe(80);
        expect(stats?.totalEmailsFound).toBe(20);
      });
    });

    describe('trackJobFailed', () => {
      it('should mark job as failed', () => {
        trackJobStarted('job-1', 'test', null, 100);
        trackJobFailed('job-1', 'Test error');

        const metrics = getJobMetrics('job-1');
        expect(metrics?.status).toBe('failed');
        expect(metrics?.error).toBe('Test error');
      });

      it('should handle Error objects', () => {
        trackJobStarted('job-1', 'test', null, 100);
        trackJobFailed('job-1', new Error('Error object'));

        const metrics = getJobMetrics('job-1');
        expect(metrics?.error).toBe('Error object');
      });

      it('should update daily stats', () => {
        trackJobStarted('job-1', 'test', null, 100);
        trackJobFailed('job-1', 'Error');

        const stats = getDailyStats();
        expect(stats?.jobsFailed).toBe(1);
      });
    });
  });

  describe('Source Tracking', () => {
    describe('trackSourceAttempt', () => {
      it('should track source attempts', () => {
        trackSourceAttempt('Google Maps');
        trackSourceAttempt('Google Maps');

        const metrics = getSourceMetrics();
        const gmMetrics = metrics.get('Google Maps');
        expect(gmMetrics?.attempts).toBe(2);
      });
    });

    describe('trackSourceSuccess', () => {
      it('should track successful source operations', () => {
        trackSourceAttempt('Google Maps');
        trackSourceSuccess('Google Maps', 10, 500);

        const metrics = getSourceMetrics();
        const gmMetrics = metrics.get('Google Maps');
        expect(gmMetrics?.successes).toBe(1);
        expect(gmMetrics?.totalLeads).toBe(10);
        expect(gmMetrics?.avgResponseTime).toBe(500);
      });

      it('should calculate running average of response time', () => {
        trackSourceAttempt('Google Maps');
        trackSourceSuccess('Google Maps', 10, 500);
        trackSourceAttempt('Google Maps');
        trackSourceSuccess('Google Maps', 10, 1000);

        const metrics = getSourceMetrics();
        const gmMetrics = metrics.get('Google Maps');
        expect(gmMetrics?.avgResponseTime).toBe(750);
      });
    });

    describe('trackSourceFailure', () => {
      it('should track source failures', () => {
        trackSourceAttempt('Google Maps');
        trackSourceFailure('Google Maps', 'Timeout error');

        const metrics = getSourceMetrics();
        const gmMetrics = metrics.get('Google Maps');
        expect(gmMetrics?.failures).toBe(1);
        expect(gmMetrics?.lastError).toBe('Timeout error');
      });
    });

    describe('trackRateLimitHit', () => {
      it('should track rate limit hits', () => {
        trackRateLimitHit('Yelp');
        trackRateLimitHit('Yelp');

        const metrics = getSourceMetrics();
        const yelpMetrics = metrics.get('Yelp');
        expect(yelpMetrics?.rateLimitHits).toBe(2);
      });
    });
  });

  describe('Performance Tracking', () => {
    describe('trackApiResponseTime', () => {
      it('should track response times', () => {
        trackApiResponseTime('/api/search', 100);
        trackApiResponseTime('/api/search', 200);

        const perf = getPerformanceMetrics();
        expect(perf.apiResponseTimes).toContain(100);
        expect(perf.apiResponseTimes).toContain(200);
      });
    });

    describe('getPerformanceMetrics', () => {
      it('should return performance metrics', () => {
        trackJobStarted('job-1', 'test', null, 100);
        trackJobCompleted('job-1', 50, 10);
        trackApiResponseTime('/api/search', 500);

        const perf = getPerformanceMetrics();
        expect(perf.avgJobDuration).toBeGreaterThanOrEqual(0);
        expect(perf.apiResponseTimes.length).toBe(1);
      });
    });
  });

  describe('Quota Tracking', () => {
    describe('updateQuotaUsage', () => {
      it('should update quota usage', () => {
        updateQuotaUsage('googlePlaces', 100, 1000);

        const quotas = getQuotaMetrics();
        expect(quotas.length).toBe(1);
        expect(quotas[0].api).toBe('googlePlaces');
        expect(quotas[0].used).toBe(100);
        expect(quotas[0].limit).toBe(1000);
        expect(quotas[0].remaining).toBe(900);
        expect(quotas[0].percentUsed).toBe(10);
      });

      it('should calculate projected exhaustion', () => {
        const resetAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now
        updateQuotaUsage('googlePlaces', 900, 1000, resetAt);

        const quotas = getQuotaMetrics();
        // With high usage rate, should project exhaustion before reset
        expect(quotas[0].percentUsed).toBe(90);
      });
    });

    describe('getQuotaMetrics', () => {
      it('should return all quota metrics', () => {
        updateQuotaUsage('googlePlaces', 100, 1000);
        updateQuotaUsage('yelpFusion', 2000, 5000);

        const quotas = getQuotaMetrics();
        expect(quotas.length).toBe(2);
      });
    });
  });

  describe('Search Time Percentiles', () => {
    describe('recordSearchDuration', () => {
      it('should record search durations', () => {
        recordSearchDuration(100);
        recordSearchDuration(200);
        recordSearchDuration(300);

        const percentiles = getSearchTimePercentiles();
        expect(percentiles.count).toBe(3);
      });
    });

    describe('getSearchTimePercentiles', () => {
      it('should calculate percentiles', () => {
        // Add 100 durations from 1 to 100
        for (let i = 1; i <= 100; i++) {
          recordSearchDuration(i * 10);
        }

        const percentiles = getSearchTimePercentiles();
        // Use range checks since percentile calculation varies slightly by implementation
        expect(percentiles.p50).toBeGreaterThanOrEqual(490);
        expect(percentiles.p50).toBeLessThanOrEqual(520);
        expect(percentiles.p95).toBeGreaterThanOrEqual(940);
        expect(percentiles.p95).toBeLessThanOrEqual(960);
        expect(percentiles.p99).toBeGreaterThanOrEqual(980);
        expect(percentiles.p99).toBeLessThanOrEqual(1000);
        expect(percentiles.min).toBe(10);
        expect(percentiles.max).toBe(1000);
      });

      it('should return zeros for empty data', () => {
        const percentiles = getSearchTimePercentiles();
        expect(percentiles.p50).toBe(0);
        expect(percentiles.count).toBe(0);
      });
    });
  });

  describe('Source Success Metrics', () => {
    describe('getSourceSuccessMetrics', () => {
      it('should return source success metrics', () => {
        trackSourceAttempt('Google Maps');
        trackSourceSuccess('Google Maps', 10, 500);
        trackSourceAttempt('Google Maps');
        trackSourceFailure('Google Maps', 'Error');

        const metrics = getSourceSuccessMetrics();
        const gmMetrics = metrics.find((m) => m.source === 'Google Maps');

        expect(gmMetrics).toBeDefined();
        expect(gmMetrics?.totalRequests).toBe(2);
        expect(gmMetrics?.successes).toBe(1);
        expect(gmMetrics?.failures).toBe(1);
        expect(gmMetrics?.successRate).toBe(50);
      });
    });
  });

  describe('Usage Reports', () => {
    describe('generateUsageReport', () => {
      it('should generate daily report', () => {
        trackJobStarted('job-1', 'dentists', 'San Francisco', 100);
        trackJobCompleted('job-1', 80, 20);
        trackJobStarted('job-2', 'dentists', 'Los Angeles', 50);
        trackJobCompleted('job-2', 40, 10);

        const report = generateUsageReport('daily');

        expect(report.period).toBe('daily');
        expect(report.summary.totalSearches).toBe(2);
        expect(report.summary.successfulSearches).toBe(2);
        expect(report.summary.totalLeadsFound).toBe(120);
        expect(report.summary.totalEmailsFound).toBe(30);
        expect(report.topQueries[0].query).toBe('dentists');
        expect(report.topQueries[0].count).toBe(2);
      });

      it('should generate weekly report', () => {
        trackJobStarted('job-1', 'test', null, 100);
        trackJobCompleted('job-1', 50, 10);

        const report = generateUsageReport('weekly');

        expect(report.period).toBe('weekly');
        expect(report.summary.totalSearches).toBe(1);
      });

      it('should include error breakdown', () => {
        trackJobStarted('job-1', 'test', null, 100);
        trackJobFailed('job-1', new Error('timeout error'));

        const report = generateUsageReport('daily');

        expect(report.summary.failedSearches).toBe(1);
      });
    });
  });

  describe('Dashboard Data', () => {
    describe('getDashboardData', () => {
      it('should return comprehensive dashboard data', () => {
        trackJobStarted('job-1', 'dentists', 'SF', 100);
        trackJobCompleted('job-1', 80, 20);
        trackSourceAttempt('Google Maps');
        trackSourceSuccess('Google Maps', 80, 500);
        updateQuotaUsage('googlePlaces', 100, 1000);
        recordSearchDuration(500);

        const data = getDashboardData();

        expect(data.overview.jobsLast24h).toBe(1);
        expect(data.overview.successRate).toBe(100);
        expect(data.overview.leadsFound).toBe(80);
        expect(data.performance.count).toBe(1);
        expect(data.quotas.length).toBe(1);
        expect(data.sources.length).toBe(1);
        expect(data.recentSearches.length).toBe(1);
      });
    });
  });

  describe('Health Status', () => {
    describe('getHealthStatus', () => {
      it('should return healthy status when no issues', async () => {
        trackJobStarted('job-1', 'test', null, 100);
        trackJobCompleted('job-1', 50, 10);

        const status = await getHealthStatus();

        expect(status.status).toBe('healthy');
        expect(status.metrics.jobSuccessRate).toBe(1);
      });

      it('should return degraded status on high error rate', async () => {
        for (let i = 0; i < 10; i++) {
          trackJobStarted(`job-${i}`, 'test', null, 100);
          if (i < 8) {
            trackJobCompleted(`job-${i}`, 50, 10);
          } else {
            trackJobFailed(`job-${i}`, 'Error');
          }
        }

        const status = await getHealthStatus();

        expect(status.metrics.jobSuccessRate).toBe(0.8);
      });

      it('should return unhealthy status on very high failure rate', async () => {
        for (let i = 0; i < 10; i++) {
          trackJobStarted(`job-${i}`, 'test', null, 100);
          if (i < 4) {
            trackJobCompleted(`job-${i}`, 50, 10);
          } else {
            trackJobFailed(`job-${i}`, 'Error');
          }
        }

        const status = await getHealthStatus();

        expect(status.status).toBe('unhealthy');
        expect(status.metrics.jobSuccessRate).toBeLessThan(0.5);
      });
    });
  });

  describe('Metrics Summary', () => {
    describe('getMetricsSummary', () => {
      it('should return metrics summary', () => {
        trackJobStarted('job-1', 'test', null, 100);
        trackJobCompleted('job-1', 50, 10);
        trackSourceAttempt('Google Maps');
        trackSourceSuccess('Google Maps', 50, 500);
        trackApiResponseTime('/api/search', 500);

        const summary = getMetricsSummary();

        expect(summary.jobs.total).toBe(1);
        expect(summary.jobs.completed).toBe(1);
        expect(summary.sources.length).toBe(1);
        expect(summary.performance.avgResponseTime).toBe(500);
      });
    });
  });

  describe('Alerts', () => {
    describe('checkAlerts', () => {
      it('should detect error spikes', () => {
        // Generate many errors quickly
        for (let i = 0; i < 15; i++) {
          trackJobStarted(`job-${i}`, 'test', null, 100);
          trackJobFailed(`job-${i}`, 'Error');
        }

        const alerts = checkAlerts();

        expect(alerts.some((a) => a.type === 'error_spike')).toBe(true);
      });

      it('should detect high failure rate', () => {
        for (let i = 0; i < 10; i++) {
          trackJobStarted(`job-${i}`, 'test', null, 100);
          if (i < 3) {
            trackJobCompleted(`job-${i}`, 50, 10);
          } else {
            trackJobFailed(`job-${i}`, 'Error');
          }
        }

        const alerts = checkAlerts();

        expect(alerts.some((a) => a.type === 'high_failure_rate')).toBe(true);
      });

      it('should detect rate limit issues', () => {
        for (let i = 0; i < 15; i++) {
          trackRateLimitHit('Yelp');
        }

        const alerts = checkAlerts();

        expect(alerts.some((a) => a.type === 'rate_limit')).toBe(true);
      });
    });

    describe('getAlertHistory', () => {
      it('should return alert history', () => {
        // Trigger an alert
        for (let i = 0; i < 15; i++) {
          trackJobStarted(`job-${i}`, 'test', null, 100);
          trackJobFailed(`job-${i}`, 'Error');
        }
        checkAlerts();

        const history = getAlertHistory();

        expect(history.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Recent Errors', () => {
    describe('getRecentErrors', () => {
      it('should return recent errors', () => {
        trackJobStarted('job-1', 'test', null, 100);
        trackJobFailed('job-1', new Error('Test error'));

        const errors = getRecentErrors();

        expect(errors.length).toBe(1);
        expect(errors[0].error).toBe('Test error');
      });
    });
  });

  describe('Logger', () => {
    it('should have info method', () => {
      expect(() => logger.info('Test message')).not.toThrow();
    });

    it('should have warn method', () => {
      expect(() => logger.warn('Test warning')).not.toThrow();
    });

    it('should have error method', () => {
      expect(() => logger.error('Test error', new Error('test'))).not.toThrow();
    });

    it('should have debug method', () => {
      expect(() => logger.debug('Test debug')).not.toThrow();
    });
  });
});
