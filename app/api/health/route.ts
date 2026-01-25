/**
 * Health Check & Metrics API
 * GET /api/health - Health status
 * GET /api/health?metrics=true - Full metrics
 */

import { NextResponse } from 'next/server';
import {
  getHealthStatus,
  getMetricsSummary,
  getSourceMetrics,
  getRecentErrors,
  getAlertHistory,
  checkAlerts,
} from '@/lib/monitoring';
import { getCacheStats, checkCacheHealth } from '@/lib/cache';
import { getQuotaStats } from '@/lib/api-fallback';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeMetrics = searchParams.get('metrics') === 'true';
  const includeDetails = searchParams.get('details') === 'true';

  try {
    // Basic health check
    const health = await getHealthStatus();

    // Check for new alerts
    const newAlerts = checkAlerts();

    // Check cache health
    const cacheHealth = await checkCacheHealth();

    const response: Record<string, unknown> = {
      status: health.status,
      timestamp: new Date().toISOString(),
      checks: {
        ...health.checks,
        cache: cacheHealth.healthy,
      },
    };

    if (includeMetrics) {
      const summary = getMetricsSummary();
      const cacheStats = getCacheStats();
      const apiQuotas = getQuotaStats();

      response.metrics = {
        jobs: summary.jobs,
        performance: {
          ...summary.performance,
          jobSuccessRate: health.metrics.jobSuccessRate,
        },
        errors: summary.errors,
        cache: {
          hitRate: cacheStats.hitRate,
          size: cacheStats.memoryCacheSize,
          redisConnected: cacheStats.redisAvailable,
        },
        apiQuotas,
      };

      response.sources = summary.sources.slice(0, 10); // Top 10 sources
    }

    if (includeDetails) {
      response.sourceMetrics = Object.fromEntries(getSourceMetrics());
      response.recentErrors = getRecentErrors().slice(0, 20);
      response.alerts = getAlertHistory().slice(0, 10);
    }

    if (newAlerts.length > 0) {
      response.newAlerts = newAlerts;
    }

    // Set appropriate status code
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

    return NextResponse.json(response, { status: statusCode });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
