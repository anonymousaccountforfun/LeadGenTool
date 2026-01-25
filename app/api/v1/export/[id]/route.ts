/**
 * API v1: Export Endpoints
 *
 * GET /api/v1/export/[id] - Export results as CSV, JSON, or Excel
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateRequest,
  requirePermission,
  recordUsage,
  triggerWebhooks,
  ApiRateLimitError,
} from '@/lib/api-auth';
import { getJob, getBusinessesByJobId } from '@/lib/db';
import {
  generateCsv,
  generateExcel,
  generateJson,
  type ExportFormat,
} from '@/lib/export';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

/**
 * GET /api/v1/export/[id]
 * Export results in various formats
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { apiKey, rateLimitInfo } = validateRequest(request.headers);
    requirePermission(apiKey, 'export:read');

    const { id } = await params;

    // Get job to verify it exists
    const job = await getJob(id);
    if (!job) {
      return NextResponse.json(
        { error: 'Search not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Get format
    const format = (request.nextUrl.searchParams.get('format') || 'csv') as ExportFormat;
    const emailOnly = request.nextUrl.searchParams.get('email_only') === 'true';
    const minConfidence = parseFloat(request.nextUrl.searchParams.get('min_confidence') || '0');

    // Get businesses
    let businesses = await getBusinessesByJobId(id);

    // Apply filters
    if (emailOnly) {
      businesses = businesses.filter(b => b.email);
    }
    if (minConfidence > 0) {
      businesses = businesses.filter(b => b.email_confidence >= minConfidence);
    }

    // Convert to export format
    const exportData = businesses.map(b => ({
      name: b.name,
      email: b.email || '',
      email_confidence: b.email_confidence,
      email_source: b.email_source || '',
      website: b.website || '',
      phone: b.phone || '',
      address: b.address || '',
      instagram: b.instagram || '',
      rating: b.rating,
      review_count: b.review_count,
      years_in_business: b.years_in_business,
      source: b.source,
      employee_count: b.employee_count,
      industry_code: b.industry_code || '',
    }));

    // Record usage
    recordUsage(apiKey, 'export');

    // Trigger webhook
    await triggerWebhooks(apiKey.userId, 'export.ready', {
      jobId: id,
      format,
      count: exportData.length,
    });

    // Generate export based on format
    let content: string;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'json':
        content = JSON.stringify(generateJson(businesses as any), null, 2);
        contentType = 'application/json';
        filename = `leads-${id}.json`;
        break;

      case 'excel':
        const excelBuffer = await generateExcel(businesses as any, job?.query || 'leads');
        return new NextResponse(new Uint8Array(excelBuffer), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="leads-${id}.xlsx"`,
            ...corsHeaders,
            'X-RateLimit-Remaining': String(rateLimitInfo.remaining),
            'X-RateLimit-Limit': String(rateLimitInfo.limit),
            'X-RateLimit-Reset': rateLimitInfo.resetAt.toISOString(),
          },
        });
        break;

      case 'hubspot':
      case 'salesforce':
      case 'pipedrive':
      case 'mailchimp':
        // CRM-specific formats
        const { generateHubSpotCsv, generateSalesforceCsv, generatePipedriveCsv, generateMailchimpCsv } = await import('@/lib/export');
        switch (format) {
          case 'hubspot':
            content = generateHubSpotCsv(businesses as any);
            break;
          case 'salesforce':
            content = generateSalesforceCsv(businesses as any);
            break;
          case 'pipedrive':
            content = generatePipedriveCsv(businesses as any);
            break;
          case 'mailchimp':
            content = generateMailchimpCsv(businesses as any);
            break;
          default:
            content = generateCsv(businesses as any);
        }
        contentType = 'text/csv';
        filename = `leads-${format}-${id}.csv`;
        break;

      case 'csv':
      default:
        content = generateCsv(businesses as any);
        contentType = 'text/csv';
        filename = `leads-${id}.csv`;
        break;
    }

    const response = new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        ...corsHeaders,
        'X-RateLimit-Remaining': String(rateLimitInfo.remaining),
        'X-RateLimit-Limit': String(rateLimitInfo.limit),
        'X-RateLimit-Reset': rateLimitInfo.resetAt.toISOString(),
      },
    });

    return response;
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
