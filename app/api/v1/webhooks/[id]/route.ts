/**
 * API v1: Single Webhook Endpoints
 *
 * DELETE /api/v1/webhooks/[id] - Delete a webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateRequest,
  requirePermission,
  recordUsage,
  deleteWebhook,
  getUserWebhooks,
  ApiRateLimitError,
} from '@/lib/api-auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

/**
 * DELETE /api/v1/webhooks/[id]
 * Delete a webhook
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { apiKey, rateLimitInfo } = validateRequest(request.headers);
    requirePermission(apiKey, 'webhooks:write');

    const { id } = await params;

    // Verify the webhook belongs to this user
    const userWebhooks = getUserWebhooks(apiKey.userId);
    const webhook = userWebhooks.find(wh => wh.id === id);

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Delete the webhook
    const deleted = deleteWebhook(id);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete webhook' },
        { status: 500, headers: corsHeaders }
      );
    }

    // Record usage
    recordUsage(apiKey, 'request');

    return NextResponse.json(
      {
        success: true,
        message: 'Webhook deleted successfully',
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
