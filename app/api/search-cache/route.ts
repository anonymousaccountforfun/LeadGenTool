/**
 * Edge-optimized Search Cache API
 *
 * This endpoint runs on the edge and provides fast access to cached search results
 * using Upstash Redis (edge-compatible). For cache misses, returns a redirect
 * to the full search endpoint.
 *
 * GET /api/search-cache?query=...&location=...
 */

import { NextResponse } from 'next/server';

// Enable edge runtime for global low-latency
export const runtime = 'edge';

// Create a simple hash for cache keys (edge-compatible)
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// Cache key prefix
const CACHE_PREFIX = 'search:';

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);

  const query = searchParams.get('query');
  const location = searchParams.get('location') || '';

  if (!query) {
    return NextResponse.json(
      { error: 'Query parameter is required' },
      { status: 400 }
    );
  }

  // Check for Upstash Redis configuration
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!redisUrl || !redisToken) {
    return NextResponse.json({
      cached: false,
      reason: 'cache_not_configured',
      latencyMs: Date.now() - startTime,
    });
  }

  try {
    // Generate cache key
    const cacheKey = `${CACHE_PREFIX}${simpleHash(query.toLowerCase())}:${simpleHash(location.toLowerCase())}`;

    // Fetch from Upstash Redis using REST API (edge-compatible)
    const response = await fetch(`${redisUrl}/get/${cacheKey}`, {
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Redis error: ${response.status}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;

    if (data.result) {
      // Cache hit - parse and return the cached data
      const cachedData = JSON.parse(data.result);

      return NextResponse.json({
        cached: true,
        cachedAt: cachedData.cachedAt,
        cacheAgeSeconds: Math.round((Date.now() - cachedData.cachedAt) / 1000),
        query,
        location,
        results: cachedData.businesses || [],
        totalCount: cachedData.businesses?.length || 0,
        latencyMs,
      }, {
        headers: {
          'X-Cache': 'HIT',
          'X-Cache-Age': Math.round((Date.now() - cachedData.cachedAt) / 1000).toString(),
          'X-Response-Time': `${latencyMs}ms`,
        },
      });
    }

    // Cache miss
    return NextResponse.json({
      cached: false,
      reason: 'cache_miss',
      query,
      location,
      latencyMs,
      hint: 'Use POST /api/jobs to start a new search',
    }, {
      headers: {
        'X-Cache': 'MISS',
        'X-Response-Time': `${latencyMs}ms`,
      },
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error('Edge cache error:', error);

    return NextResponse.json({
      cached: false,
      reason: 'cache_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      latencyMs,
    }, {
      status: 500,
      headers: {
        'X-Cache': 'ERROR',
        'X-Response-Time': `${latencyMs}ms`,
      },
    });
  }
}
