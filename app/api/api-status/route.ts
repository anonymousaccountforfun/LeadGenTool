import { NextResponse } from 'next/server';
import {
  getQuotaStats,
  getApiAvailabilityStatus,
  canApisFullfillRequest,
  getCostSavings,
  getSourceUsageSummary,
} from '@/lib/api-fallback';

// Enable edge runtime for faster global response times
export const runtime = 'edge';

// Cache for 10 seconds to reduce redundant calls
export const revalidate = 10;

/**
 * GET /api/api-status - Get API availability and usage statistics
 *
 * Query params:
 *   - count: number - Target result count to check if APIs can fulfill
 *
 * Returns:
 *   - apis: Array of API availability status
 *   - quotas: Quota usage per API
 *   - fulfillment: Whether APIs can fulfill requested count
 *   - session: Current session usage summary
 *   - savings: Estimated cost savings from using APIs
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const count = parseInt(searchParams.get('count') || '50', 10);

    const apis = getApiAvailabilityStatus();
    const quotas = getQuotaStats();
    const fulfillment = canApisFullfillRequest(count);
    const session = getSourceUsageSummary();
    const savings = getCostSavings();

    return NextResponse.json({
      apis,
      quotas,
      fulfillment: {
        requestedCount: count,
        ...fulfillment,
      },
      session: {
        ...session,
        apiPercentage: Math.round(session.apiPercentage),
      },
      savings: {
        apiCalls: savings.apiCalls,
        scrapingAvoided: savings.scrapingAvoided,
        timeSavedSeconds: Math.round(savings.estimatedTimeSavedMs / 1000),
        costSavedUsd: Math.round(savings.estimatedCostSavedUsd * 1000) / 1000,
      },
    });
  } catch (error) {
    console.error('API status error:', error);
    return NextResponse.json(
      { error: 'Failed to get API status' },
      { status: 500 }
    );
  }
}
