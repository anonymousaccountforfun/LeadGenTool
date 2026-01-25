/**
 * GET /api/suggestions - Get search suggestions
 *
 * Query params:
 *   - q: search query (for industry suggestions and autocomplete)
 *   - location: location string (for nearby location suggestions)
 *   - type: 'all' | 'autocomplete' | 'related' | 'locations' | 'trending'
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAllSuggestions,
  getAutocompleteSuggestions,
  getRelatedIndustries,
  getNearbyLocations,
  getTrendingSearches,
} from '@/lib/suggestions';

// Run on edge for low latency
export const runtime = 'edge';

// Cache for 5 minutes (suggestions don't change often)
export const revalidate = 300;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);

  const query = searchParams.get('q') || '';
  const location = searchParams.get('location') || '';
  const type = searchParams.get('type') || 'all';

  try {
    let result;

    switch (type) {
      case 'autocomplete':
        result = {
          suggestions: getAutocompleteSuggestions(query),
        };
        break;

      case 'related':
        result = {
          suggestions: getRelatedIndustries(query),
        };
        break;

      case 'locations':
        result = {
          suggestions: getNearbyLocations(location),
        };
        break;

      case 'trending':
        result = {
          suggestions: getTrendingSearches(10),
        };
        break;

      case 'all':
      default:
        result = getAllSuggestions(query, location);
        break;
    }

    return NextResponse.json({
      ...result,
      latencyMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error('Suggestions error:', error);
    return NextResponse.json({
      error: 'Failed to get suggestions',
      message: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - startTime,
    }, { status: 500 });
  }
}
