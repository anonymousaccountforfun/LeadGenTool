import { NextRequest, NextResponse } from 'next/server';
import { getCacheHealthStatus, warmPopularQueries, maintainCache } from '@/lib/cache-warmer';

/**
 * GET /api/cache - Get cache health and stats
 */
export async function GET() {
  try {
    const status = await getCacheHealthStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get cache status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cache - Trigger cache operations
 * Body: { action: 'warm' | 'maintain', maxQueries?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, maxQueries = 10 } = body;

    switch (action) {
      case 'warm': {
        const result = await warmPopularQueries({ maxQueries });
        return NextResponse.json({
          success: true,
          action: 'warm',
          result,
        });
      }

      case 'maintain': {
        const result = await maintainCache();
        return NextResponse.json({
          success: true,
          action: 'maintain',
          result,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use "warm" or "maintain"' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Cache operation failed:', error);
    return NextResponse.json(
      { error: 'Cache operation failed' },
      { status: 500 }
    );
  }
}
