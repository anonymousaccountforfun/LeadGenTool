/**
 * API v1: Webhook Endpoints
 *
 * GET /api/v1/webhooks - List webhooks
 * POST /api/v1/webhooks - Create a webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateRequest,
  requirePermission,
  recordUsage,
  createWebhook,
  getUserWebhooks,
  ApiRateLimitError,
  type WebhookEvent,
} from '@/lib/api-auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
};

const VALID_EVENTS: WebhookEvent[] = [
  'search.started',
  'search.completed',
  'search.failed',
  'export.ready',
];

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

/**
 * GET /api/v1/webhooks
 * List all webhooks for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const { apiKey, rateLimitInfo } = validateRequest(request.headers);
    requirePermission(apiKey, 'webhooks:write');

    // Record usage
    recordUsage(apiKey, 'request');

    const webhooks = getUserWebhooks(apiKey.userId);

    return NextResponse.json(
      {
        success: true,
        data: webhooks.map(wh => ({
          id: wh.id,
          url: wh.url,
          events: wh.events,
          isActive: wh.isActive,
          createdAt: wh.createdAt.toISOString(),
          lastTriggeredAt: wh.lastTriggeredAt?.toISOString() || null,
          failureCount: wh.failureCount,
        })),
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

/**
 * POST /api/v1/webhooks
 * Create a new webhook
 */
export async function POST(request: NextRequest) {
  try {
    const { apiKey, rateLimitInfo } = validateRequest(request.headers);
    requirePermission(apiKey, 'webhooks:write');

    const body = await request.json();

    // Validate URL
    if (!body.url || typeof body.url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required and must be a string' },
        { status: 400, headers: corsHeaders }
      );
    }

    try {
      new URL(body.url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate events
    if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json(
        { error: 'Events array is required and must not be empty' },
        { status: 400, headers: corsHeaders }
      );
    }

    const invalidEvents = body.events.filter((e: string) => !VALID_EVENTS.includes(e as WebhookEvent));
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Invalid events: ${invalidEvents.join(', ')}. Valid events are: ${VALID_EVENTS.join(', ')}` },
        { status: 400, headers: corsHeaders }
      );
    }

    // Create webhook
    const webhook = createWebhook(apiKey.userId, body.url, body.events);

    // Record usage
    recordUsage(apiKey, 'request');

    return NextResponse.json(
      {
        success: true,
        data: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          secret: webhook.secret, // Only shown once on creation
          isActive: webhook.isActive,
          createdAt: webhook.createdAt.toISOString(),
        },
        message: 'Webhook created. Save the secret - it will only be shown once.',
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
