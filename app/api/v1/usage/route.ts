/**
 * API v1: Usage Endpoints
 *
 * GET /api/v1/usage - Get API usage statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateRequest,
  requirePermission,
  recordUsage,
  getUserUsageStats,
  getKeyUsage,
  getRateLimitInfo,
  ApiRateLimitError,
} from '@/lib/api-auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

/**
 * GET /api/v1/usage
 * Get API usage statistics
 */
export async function GET(request: NextRequest) {
  try {
    const { apiKey, rateLimitInfo } = validateRequest(request.headers);
    requirePermission(apiKey, 'usage:read');

    // Get usage parameters
    const days = parseInt(request.nextUrl.searchParams.get('days') || '30');

    // Get user-level usage stats
    const userStats = getUserUsageStats(apiKey.userId);

    // Get this key's usage
    const keyUsage = getKeyUsage(apiKey.id, days);

    // Get rate limit info
    const currentLimits = getRateLimitInfo(apiKey);

    // Record usage
    recordUsage(apiKey, 'request');

    return NextResponse.json(
      {
        success: true,
        data: {
          key: {
            id: apiKey.id,
            name: apiKey.name,
            permissions: apiKey.permissions,
            createdAt: apiKey.createdAt.toISOString(),
            lastUsedAt: apiKey.lastUsedAt?.toISOString() || null,
          },
          limits: {
            rateLimit: {
              limit: currentLimits.limit,
              remaining: currentLimits.remaining,
              resetAt: currentLimits.resetAt.toISOString(),
            },
            monthly: {
              limit: currentLimits.monthlyLimit,
              remaining: currentLimits.monthlyRemaining,
            },
          },
          usage: {
            period: `${days} days`,
            total: {
              requests: userStats.totalRequests,
              searches: userStats.totalSearches,
              exports: userStats.totalExports,
              bytesTransferred: userStats.totalBytes,
            },
            daily: keyUsage.map(u => ({
              date: u.date,
              requests: u.requestCount,
              searches: u.searchCount,
              exports: u.exportCount,
              bytes: u.bytesTransferred,
            })),
          },
        },
        rateLimit: {
          remaining: rateLimitInfo.remaining,
          limit: rateLimitInfo.limit,
          resetAt: rateLimitInfo.resetAt.toISOString(),
        },
      },
      {
        headers: {
          ...corsHeaders,
          'X-RateLimit-Remaining': String(rateLimitInfo.remaining),
          'X-RateLimit-Limit': String(rateLimitInfo.limit),
          'X-RateLimit-Reset': rateLimitInfo.resetAt.toISOString(),
        },
      }
    );
  } catch (error) {
    if (error instanceof ApiRateLimitError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Retry-After': String(error.retryAfter),
          },
        }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: error instanceof Error && error.message.includes('API key') ? 401 : 500, headers: corsHeaders }
    );
  }
}
