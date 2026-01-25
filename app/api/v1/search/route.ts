/**
 * API v1: Search Endpoints
 *
 * POST /api/v1/search - Start a new lead search
 * GET /api/v1/search - List all searches
 * GET /api/v1/search/[id] - Get search status
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateRequest,
  requirePermission,
  recordUsage,
  triggerWebhooks,
  ApiRateLimitError,
} from '@/lib/api-auth';
import { createJob, getSearchHistory } from '@/lib/db';

// CORS headers for API
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

/**
 * POST /api/v1/search
 * Start a new lead search
 */
export async function POST(request: NextRequest) {
  try {
    const { apiKey, rateLimitInfo } = validateRequest(request.headers);
    requirePermission(apiKey, 'search:write');

    const body = await request.json();

    // Validate required fields
    if (!body.query || typeof body.query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Create the search job
    const job = await createJob({
      query: body.query,
      location: body.location || null,
      count: body.count || 50,
      priority: body.priority || 'normal',
      industryCategory: body.industryCategory || null,
      targetState: body.targetState || null,
      companySizeMin: body.companySizeMin || null,
      companySizeMax: body.companySizeMax || null,
    });

    // Record usage
    recordUsage(apiKey, 'search');

    // Trigger webhook for search started
    await triggerWebhooks(apiKey.userId, 'search.started', {
      jobId: job.id,
      query: body.query,
      location: body.location,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: job.id,
          query: job.query,
          location: job.location,
          targetCount: job.target_count,
          status: job.status,
          createdAt: job.created_at,
        },
        rateLimit: {
          remaining: rateLimitInfo.remaining,
          limit: rateLimitInfo.limit,
          resetAt: rateLimitInfo.resetAt.toISOString(),
        },
      },
      {
        status: 201,
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

/**
 * GET /api/v1/search
 * List all searches for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const { apiKey, rateLimitInfo } = validateRequest(request.headers);
    requirePermission(apiKey, 'search:read');

    // Record usage
    recordUsage(apiKey, 'request');

    // Get search history
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20');
    const searches = await getSearchHistory(Math.min(limit, 100));

    return NextResponse.json(
      {
        success: true,
        data: searches.map(s => ({
          id: s.id,
          query: s.query,
          location: s.location,
          targetCount: s.target_count,
          status: s.status,
          createdAt: s.created_at,
          totalLeads: s.total_leads,
          emailsFound: s.emails_found,
          verifiedEmails: s.verified_emails,
        })),
        pagination: {
          limit,
          count: searches.length,
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
