/**
 * Edge Metrics API
 *
 * GET /api/metrics/edge - Get latency metrics for edge functions
 *
 * Query params:
 *   - endpoint: Filter by specific endpoint
 *   - histogram: Include latency histogram (true/false)
 */

import { NextResponse } from 'next/server';
import {
  getLatencySummary,
  getAllLatencySummaries,
  getLatencyHistogram,
  getCurrentRegion,
} from '@/lib/edge-metrics';

// Run on edge for self-measuring
export const runtime = 'edge';

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);

  const endpoint = searchParams.get('endpoint');
  const includeHistogram = searchParams.get('histogram') === 'true';

  try {
    const currentRegion = getCurrentRegion();

    if (endpoint) {
      // Get metrics for specific endpoint
      const summary = getLatencySummary(endpoint);

      if (!summary) {
        return NextResponse.json({
          error: 'No metrics found for endpoint',
          endpoint,
          currentRegion,
          latencyMs: Date.now() - startTime,
        }, { status: 404 });
      }

      const response: Record<string, unknown> = {
        endpoint,
        summary,
        currentRegion,
        latencyMs: Date.now() - startTime,
      };

      if (includeHistogram) {
        response.histogram = getLatencyHistogram(endpoint);
      }

      return NextResponse.json(response);
    }

    // Get all endpoint summaries
    const summaries = getAllLatencySummaries();

    return NextResponse.json({
      currentRegion,
      endpointCount: summaries.length,
      summaries,
      latencyMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error('Edge metrics error:', error);
    return NextResponse.json({
      error: 'Failed to get metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - startTime,
    }, { status: 500 });
  }
}
