/**
 * API v1: API Key Management Endpoints
 *
 * GET /api/v1/keys - List API keys (requires session auth)
 * POST /api/v1/keys - Create a new API key (requires session auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  generateApiKey,
  getUserApiKeys,
  type ApiPermission,
} from '@/lib/api-auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

/**
 * GET /api/v1/keys
 * List all API keys for the current user
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: corsHeaders }
      );
    }

    const keys = getUserApiKeys(session.user.id);

    return NextResponse.json(
      {
        success: true,
        data: keys.map(k => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          permissions: k.permissions,
          rateLimit: k.rateLimit,
          monthlyLimit: k.monthlyLimit,
          isActive: k.isActive,
          expiresAt: k.expiresAt?.toISOString() || null,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() || null,
        })),
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * POST /api/v1/keys
 * Create a new API key
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json();

    // Validate name
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required and must be a string' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate permissions if provided
    const validPermissions: ApiPermission[] = [
      'search:read',
      'search:write',
      'results:read',
      'export:read',
      'webhooks:write',
      'usage:read',
    ];

    let permissions: ApiPermission[] | undefined;
    if (body.permissions) {
      if (!Array.isArray(body.permissions)) {
        return NextResponse.json(
          { error: 'Permissions must be an array' },
          { status: 400, headers: corsHeaders }
        );
      }

      const invalidPerms = body.permissions.filter((p: string) => !validPermissions.includes(p as ApiPermission));
      if (invalidPerms.length > 0) {
        return NextResponse.json(
          { error: `Invalid permissions: ${invalidPerms.join(', ')}. Valid permissions are: ${validPermissions.join(', ')}` },
          { status: 400, headers: corsHeaders }
        );
      }

      permissions = body.permissions;
    }

    // Generate the key
    const { key, apiKey } = generateApiKey(session.user.id, body.name, {
      permissions,
      rateLimit: body.rateLimit,
      monthlyLimit: body.monthlyLimit,
      expiresInDays: body.expiresInDays,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: apiKey.id,
          name: apiKey.name,
          key, // Only shown once!
          keyPrefix: apiKey.keyPrefix,
          permissions: apiKey.permissions,
          rateLimit: apiKey.rateLimit,
          monthlyLimit: apiKey.monthlyLimit,
          isActive: apiKey.isActive,
          expiresAt: apiKey.expiresAt?.toISOString() || null,
          createdAt: apiKey.createdAt.toISOString(),
        },
        message: 'API key created. Save the key now - it will only be shown once!',
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
