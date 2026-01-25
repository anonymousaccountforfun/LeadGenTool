/**
 * API v1: Single Search Endpoints
 *
 * GET /api/v1/search/[id] - Get search status and basic info
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateRequest,
  requirePermission,
  recordUsage,
  ApiRateLimitError,
} from '@/lib/api-auth';
import { getJob, getEmailCountByJobId } from '@/lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

/**
 * GET /api/v1/search/[id]
 * Get search status and summary
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { apiKey, rateLimitInfo } = validateRequest(request.headers);
    requirePermission(apiKey, 'search:read');

    const { id } = await params;

    // Get job
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json(
        { error: 'Search not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Get email counts
    const counts = await getEmailCountByJobId(id);

    // Record usage
    recordUsage(apiKey, 'request');

    return NextResponse.json(
      {
        success: true,
        data: {
          id: job.id,
          query: job.query,
          location: job.location,
          targetCount: job.target_count,
          status: job.status,
          progress: job.progress,
          message: job.message,
          priority: job.priority,
          createdAt: job.created_at,
          filters: {
            industryCategory: job.industry_category,
            companySizeMin: job.company_size_min,
            companySizeMax: job.company_size_max,
            targetState: job.target_state,
          },
          results: {
            total: counts.total,
            withEmail: counts.withEmail,
            verified: counts.verified,
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
