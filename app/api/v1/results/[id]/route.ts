/**
 * API v1: Results Endpoints
 *
 * GET /api/v1/results/[id] - Get full results for a search
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateRequest,
  requirePermission,
  recordUsage,
  ApiRateLimitError,
} from '@/lib/api-auth';
import { getJob, getBusinessesByJobId } from '@/lib/db';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

/**
 * GET /api/v1/results/[id]
 * Get full results for a search
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { apiKey, rateLimitInfo } = validateRequest(request.headers);
    requirePermission(apiKey, 'results:read');

    const { id } = await params;

    // Get job to verify it exists
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json(
        { error: 'Search not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Get pagination params
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const perPage = Math.min(parseInt(request.nextUrl.searchParams.get('per_page') || '50'), 100);
    const emailOnly = request.nextUrl.searchParams.get('email_only') === 'true';
    const minConfidence = parseFloat(request.nextUrl.searchParams.get('min_confidence') || '0');

    // Get all businesses
    let businesses = await getBusinessesByJobId(id);

    // Apply filters
    if (emailOnly) {
      businesses = businesses.filter(b => b.email);
    }
    if (minConfidence > 0) {
      businesses = businesses.filter(b => b.email_confidence >= minConfidence);
    }

    // Paginate
    const total = businesses.length;
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const paginatedBusinesses = businesses.slice(offset, offset + perPage);

    // Record usage
    recordUsage(apiKey, 'request');

    return NextResponse.json(
      {
        success: true,
        data: {
          searchId: id,
          query: job.query,
          location: job.location,
          status: job.status,
          results: paginatedBusinesses.map(b => ({
            id: b.id,
            name: b.name,
            email: b.email,
            emailConfidence: b.email_confidence,
            emailSource: b.email_source,
            website: b.website,
            phone: b.phone,
            address: b.address,
            instagram: b.instagram,
            rating: b.rating,
            reviewCount: b.review_count,
            yearsInBusiness: b.years_in_business,
            source: b.source,
            employeeCount: b.employee_count,
            industryCode: b.industry_code,
            isB2B: b.is_b2b,
          })),
        },
        pagination: {
          page,
          perPage,
          total,
          totalPages,
          hasMore: page < totalPages,
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
