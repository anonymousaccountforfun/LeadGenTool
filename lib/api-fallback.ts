/**
 * Official API Integration Module
 * Reliable data sources without scraping risks
 *
 * Supported APIs:
 * - Google Places API ($200/month free credit)
 * - Yelp Fusion API (5000 calls/day free)
 * - Foursquare Places API (100k calls/month free)
 * - HERE Places API (250k calls/month free)
 * - TomTom Search API (2500 calls/day free)
 * - OpenCage Geocoding (2500 calls/day for address validation)
 */

import { loadConfig } from './config';
import type { ScrapedBusiness } from './scraper';

// ============ API Key Pooling ============

interface KeyQuotaState {
  used: number;
  limit: number;
  resetAt: number;
}

// Track quota per API key (not just per API)
const keyQuotaState: Record<string, KeyQuotaState> = {};

// Track current key index for round-robin rotation
const keyRotationIndex: Record<string, number> = {};

function getKeyQuotaKey(api: string, apiKey: string): string {
  const today = new Date().toISOString().split('T')[0];
  // Use first 8 chars of key as identifier (safe for logging)
  const keyId = apiKey.substring(0, 8);
  return `${api}:${keyId}:${today}`;
}

/**
 * Get all available API keys for a service
 */
function getApiKeys(api: string): string[] {
  const config = loadConfig();

  switch (api) {
    case 'googlePlaces':
      return config.apiFallback.googlePlacesApiKeys.length > 0
        ? config.apiFallback.googlePlacesApiKeys
        : config.apiFallback.googlePlacesApiKey ? [config.apiFallback.googlePlacesApiKey] : [];
    case 'yelpFusion':
      return config.apiFallback.yelpFusionApiKeys.length > 0
        ? config.apiFallback.yelpFusionApiKeys
        : config.apiFallback.yelpFusionApiKey ? [config.apiFallback.yelpFusionApiKey] : [];
    case 'foursquare':
      return config.apiFallback.foursquareApiKeys.length > 0
        ? config.apiFallback.foursquareApiKeys
        : config.apiFallback.foursquareApiKey ? [config.apiFallback.foursquareApiKey] : [];
    case 'here':
      return config.apiFallback.hereApiKeys.length > 0
        ? config.apiFallback.hereApiKeys
        : config.apiFallback.hereApiKey ? [config.apiFallback.hereApiKey] : [];
    case 'tomtom':
      return config.apiFallback.tomtomApiKeys.length > 0
        ? config.apiFallback.tomtomApiKeys
        : config.apiFallback.tomtomApiKey ? [config.apiFallback.tomtomApiKey] : [];
    case 'opencage':
      return config.apiFallback.opencageApiKeys.length > 0
        ? config.apiFallback.opencageApiKeys
        : config.apiFallback.opencageApiKey ? [config.apiFallback.opencageApiKey] : [];
    default:
      return [];
  }
}

/**
 * Get the next available API key using round-robin with quota awareness
 */
function getNextApiKey(api: string): string | null {
  const keys = getApiKeys(api);
  if (keys.length === 0) return null;

  const config = loadConfig();
  const limits = config.apiFallback.quotaLimits;
  const limitPerKey = limits[api as keyof typeof limits] || 1000;

  // Try each key starting from current rotation index
  const startIndex = keyRotationIndex[api] || 0;

  for (let i = 0; i < keys.length; i++) {
    const index = (startIndex + i) % keys.length;
    const key = keys[index];
    const quotaKey = getKeyQuotaKey(api, key);

    // Initialize quota state for this key if needed
    if (!keyQuotaState[quotaKey]) {
      keyQuotaState[quotaKey] = {
        used: 0,
        limit: limitPerKey,
        resetAt: new Date().setUTCHours(24, 0, 0, 0),
      };
    }

    const state = keyQuotaState[quotaKey];

    // Check if quota has reset
    if (Date.now() >= state.resetAt) {
      state.used = 0;
      state.resetAt = new Date().setUTCHours(24, 0, 0, 0);
    }

    // Check if this key has available quota
    if (state.used < state.limit) {
      // Update rotation index to next key for next call
      keyRotationIndex[api] = (index + 1) % keys.length;
      return key;
    }
  }

  // All keys exhausted
  return null;
}

/**
 * Record quota usage for a specific key
 */
function recordKeyUsage(api: string, apiKey: string, count: number = 1): void {
  const quotaKey = getKeyQuotaKey(api, apiKey);
  if (keyQuotaState[quotaKey]) {
    keyQuotaState[quotaKey].used += count;
  }
}

// ============ Legacy Quota Tracking (for backwards compatibility) ============

interface QuotaState {
  used: number;
  limit: number;
  resetAt: number; // Timestamp when quota resets
}

const quotaState: Record<string, QuotaState> = {};

function getQuotaKey(api: string): string {
  // Daily reset at midnight UTC
  const today = new Date().toISOString().split('T')[0];
  return `${api}:${today}`;
}

function checkQuota(api: string): { available: boolean; remaining: number } {
  // Check if ANY key has available quota
  const keys = getApiKeys(api);
  if (keys.length === 0) {
    return { available: false, remaining: 0 };
  }

  const config = loadConfig();
  const limits = config.apiFallback.quotaLimits;
  const limitPerKey = limits[api as keyof typeof limits] || 1000;

  let totalRemaining = 0;
  let anyAvailable = false;

  for (const key of keys) {
    const quotaKey = getKeyQuotaKey(api, key);

    if (!keyQuotaState[quotaKey]) {
      keyQuotaState[quotaKey] = {
        used: 0,
        limit: limitPerKey,
        resetAt: new Date().setUTCHours(24, 0, 0, 0),
      };
    }

    const state = keyQuotaState[quotaKey];

    // Check if quota has reset
    if (Date.now() >= state.resetAt) {
      state.used = 0;
      state.resetAt = new Date().setUTCHours(24, 0, 0, 0);
    }

    const remaining = Math.max(0, state.limit - state.used);
    totalRemaining += remaining;
    if (remaining > 0) anyAvailable = true;
  }

  return {
    available: anyAvailable,
    remaining: totalRemaining,
  };
}

function consumeQuota(api: string, count: number = 1): void {
  const key = getNextApiKey(api);
  if (key) {
    recordKeyUsage(api, key, count);
  }
}

export function getQuotaStats(): Record<string, { used: number; limit: number; remaining: number; keyCount: number }> {
  const config = loadConfig();
  const limits = config.apiFallback.quotaLimits;
  const stats: Record<string, { used: number; limit: number; remaining: number; keyCount: number }> = {};

  for (const api of Object.keys(limits)) {
    const keys = getApiKeys(api);
    const limitPerKey = limits[api as keyof typeof limits];
    let totalUsed = 0;
    let totalRemaining = 0;

    for (const key of keys) {
      const quotaKey = getKeyQuotaKey(api, key);
      const state = keyQuotaState[quotaKey];
      if (state) {
        totalUsed += state.used;
        totalRemaining += Math.max(0, state.limit - state.used);
      } else {
        totalRemaining += limitPerKey;
      }
    }

    const totalLimit = limitPerKey * Math.max(1, keys.length);
    stats[api] = {
      used: totalUsed,
      limit: totalLimit,
      remaining: totalRemaining,
      keyCount: keys.length,
    };
  }

  return stats;
}

// ============ API-First Mode: Source Tracking & Cost Savings ============

interface SourceUsageRecord {
  source: string;
  resultsFound: number;
  timestamp: number;
  durationMs: number;
  isApi: boolean;
}

interface CostSavings {
  apiCalls: number;
  scrapingAvoided: number;
  estimatedTimeSavedMs: number;
  estimatedCostSavedUsd: number;
}

// Track source usage for the current session
const sessionSourceUsage: SourceUsageRecord[] = [];

// Estimated costs per operation (for tracking savings)
const OPERATION_COSTS = {
  // Scraping costs (compute, proxy, time)
  scrapingPerResult: 0.002, // $0.002 per scraped result
  scrapingTimeMs: 2000, // ~2 seconds per result

  // API costs (mostly free tier)
  googlePlacesPerCall: 0.017, // $0.017 per Places call (but first $200 free)
  yelpFusionPerCall: 0, // Free tier
  foursquarePerCall: 0, // Free tier (100k/month)
  herePerCall: 0, // Free tier (250k/month)
  tomtomPerCall: 0, // Free tier (2500/day)
  apiTimeMs: 300, // ~300ms per API call
};

/**
 * Record source usage for tracking
 */
export function recordSourceUsage(
  source: string,
  resultsFound: number,
  durationMs: number,
  isApi: boolean
): void {
  sessionSourceUsage.push({
    source,
    resultsFound,
    timestamp: Date.now(),
    durationMs,
    isApi,
  });
}

/**
 * Get cost savings from using APIs over scraping
 */
export function getCostSavings(): CostSavings {
  const apiUsage = sessionSourceUsage.filter(u => u.isApi);
  const totalApiResults = apiUsage.reduce((sum, u) => sum + u.resultsFound, 0);
  const totalApiTime = apiUsage.reduce((sum, u) => sum + u.durationMs, 0);

  // Calculate what scraping would have cost
  const scrapingCostAvoided = totalApiResults * OPERATION_COSTS.scrapingPerResult;
  const scrapingTimeAvoided = totalApiResults * OPERATION_COSTS.scrapingTimeMs;

  return {
    apiCalls: apiUsage.length,
    scrapingAvoided: totalApiResults,
    estimatedTimeSavedMs: scrapingTimeAvoided - totalApiTime,
    estimatedCostSavedUsd: Math.max(0, scrapingCostAvoided),
  };
}

/**
 * Get detailed API availability status for display
 */
export interface ApiAvailabilityStatus {
  name: string;
  available: boolean;
  remaining: number;
  limit: number;
  percentUsed: number;
  priority: number;
  estimatedResults: number;
}

export function getApiAvailabilityStatus(): ApiAvailabilityStatus[] {
  const apis = getAvailableApis();
  const quotaStats = getQuotaStats();

  // Estimate how many results each API can provide
  const resultsPerCall: Record<string, number> = {
    googlePlaces: 15, // ~15 results per search
    yelpFusion: 40, // Up to 50 per search
    foursquare: 40, // Up to 50 per search
    here: 80, // Up to 100 per search
    tomtom: 80, // Up to 100 per search
  };

  return apis.map(api => {
    const apiKey = api.name.toLowerCase().replace(' ', '');
    const normalizedKey = apiKey === 'googleplaces' ? 'googlePlaces'
      : apiKey === 'yelpfusion' ? 'yelpFusion'
      : apiKey;
    const stats = quotaStats[normalizedKey] || { used: 0, limit: 1000, remaining: 1000 };

    return {
      name: api.name,
      available: api.isAvailable(),
      remaining: stats.remaining,
      limit: stats.limit,
      percentUsed: stats.limit > 0 ? (stats.used / stats.limit) * 100 : 0,
      priority: api.priority,
      estimatedResults: stats.remaining * (resultsPerCall[normalizedKey] || 20),
    };
  }).sort((a, b) => a.priority - b.priority);
}

/**
 * Check if APIs can satisfy a request without scraping
 */
export function canApisFullfillRequest(requestedCount: number): {
  canFulfill: boolean;
  estimatedFromApis: number;
  needsScraping: boolean;
  recommendedApis: string[];
} {
  const availableApis = getApiAvailabilityStatus().filter(a => a.available);
  const totalEstimated = availableApis.reduce((sum, a) => sum + a.estimatedResults, 0);

  // Select APIs that should be used (sorted by priority)
  const recommendedApis = availableApis
    .filter(a => a.estimatedResults > 0)
    .slice(0, 3) // Top 3 APIs
    .map(a => a.name);

  return {
    canFulfill: totalEstimated >= requestedCount,
    estimatedFromApis: Math.min(totalEstimated, requestedCount),
    needsScraping: totalEstimated < requestedCount,
    recommendedApis,
  };
}

/**
 * Get session source usage summary
 */
export function getSourceUsageSummary(): {
  sources: { name: string; results: number; isApi: boolean }[];
  totalResults: number;
  apiResults: number;
  scrapedResults: number;
  apiPercentage: number;
} {
  const sourceMap = new Map<string, { results: number; isApi: boolean }>();

  for (const usage of sessionSourceUsage) {
    const existing = sourceMap.get(usage.source) || { results: 0, isApi: usage.isApi };
    existing.results += usage.resultsFound;
    sourceMap.set(usage.source, existing);
  }

  const sources = Array.from(sourceMap.entries()).map(([name, data]) => ({
    name,
    results: data.results,
    isApi: data.isApi,
  }));

  const totalResults = sources.reduce((sum, s) => sum + s.results, 0);
  const apiResults = sources.filter(s => s.isApi).reduce((sum, s) => sum + s.results, 0);
  const scrapedResults = totalResults - apiResults;

  return {
    sources,
    totalResults,
    apiResults,
    scrapedResults,
    apiPercentage: totalResults > 0 ? (apiResults / totalResults) * 100 : 0,
  };
}

/**
 * Reset session tracking (call at start of new search)
 */
export function resetSessionTracking(): void {
  sessionSourceUsage.length = 0;
}

// ============ Type Definitions ============

interface GooglePlaceResult {
  name: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
  place_id: string;
}

interface GooglePlacesSearchResponse {
  results: Array<{
    name: string;
    place_id: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
  }>;
  status: string;
  next_page_token?: string;
}

interface GooglePlaceDetailsResponse {
  result: GooglePlaceResult;
  status: string;
}

interface YelpBusiness {
  id: string;
  name: string;
  phone?: string;
  display_phone?: string;
  location?: {
    display_address?: string[];
    address1?: string;
    city?: string;
    state?: string;
    zip_code?: string;
  };
  url?: string;
  rating?: number;
  review_count?: number;
}

interface YelpSearchResponse {
  businesses: YelpBusiness[];
  total: number;
}

interface FoursquarePlace {
  fsq_id: string;
  name: string;
  location?: {
    address?: string;
    formatted_address?: string;
    locality?: string;
    region?: string;
    postcode?: string;
  };
  tel?: string;
  website?: string;
  rating?: number;
  stats?: {
    total_ratings?: number;
  };
}

interface FoursquareSearchResponse {
  results: FoursquarePlace[];
}

interface HerePlace {
  id: string;
  title: string;
  address?: {
    label?: string;
  };
  contacts?: Array<{
    phone?: Array<{ value: string }>;
    www?: Array<{ value: string }>;
  }>;
}

interface HereSearchResponse {
  items: HerePlace[];
}

interface TomTomResult {
  id: string;
  poi?: {
    name: string;
    phone?: string;
    url?: string;
  };
  address?: {
    freeformAddress?: string;
  };
}

interface TomTomSearchResponse {
  results: TomTomResult[];
}

// ============ API Implementations ============

/**
 * Search businesses using Google Places API
 * Uses key pooling for higher throughput
 */
export async function searchGooglePlaces(
  query: string,
  location: string,
  limit: number,
  onProgress?: (message: string) => void
): Promise<ScrapedBusiness[]> {
  // Get next available API key from pool
  let apiKey = getNextApiKey('googlePlaces');

  if (!apiKey) {
    console.log('[GooglePlaces] No API keys available or all quotas exhausted');
    return [];
  }

  const quota = checkQuota('googlePlaces');
  if (!quota.available) {
    console.log('[GooglePlaces] Daily quota exhausted across all keys');
    return [];
  }

  const results: ScrapedBusiness[] = [];
  const searchQuery = location ? `${query} in ${location}` : query;

  onProgress?.(`Searching Google Places API for "${searchQuery}"...`);

  try {
    // Text Search API
    const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    searchUrl.searchParams.set('query', searchQuery);
    searchUrl.searchParams.set('key', apiKey);

    const searchResponse = await fetch(searchUrl.toString());
    const searchData: GooglePlacesSearchResponse = await searchResponse.json();
    recordKeyUsage('googlePlaces', apiKey, 1);

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      throw new Error(`Google Places API error: ${searchData.status}`);
    }

    const places = searchData.results.slice(0, Math.min(limit, quota.remaining - 1));
    onProgress?.(`Found ${places.length} places, fetching details...`);

    // Fetch details for each place
    for (let i = 0; i < places.length; i++) {
      const place = places[i];

      // Get next available key (may rotate to different key)
      apiKey = getNextApiKey('googlePlaces');
      if (!apiKey) {
        console.log('[GooglePlaces] Quota limit reached during details fetch');
        break;
      }

      try {
        const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
        detailsUrl.searchParams.set('place_id', place.place_id);
        detailsUrl.searchParams.set('fields', 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total');
        detailsUrl.searchParams.set('key', apiKey);

        const detailsResponse = await fetch(detailsUrl.toString());
        const detailsData: GooglePlaceDetailsResponse = await detailsResponse.json();
        recordKeyUsage('googlePlaces', apiKey, 1);

        if (detailsData.status === 'OK' && detailsData.result) {
          const detail = detailsData.result;

          results.push({
            name: detail.name,
            website: detail.website || null,
            phone: detail.formatted_phone_number || null,
            address: detail.formatted_address || null,
            instagram: null,
            rating: detail.rating || null,
            review_count: detail.user_ratings_total || null,
            source: 'google_places_api',
          });

          onProgress?.(`Google Places API: ${detail.name} (${results.length}/${limit})`);
        }
      } catch {
        // Skip individual place errors
      }

      // Brief delay between API calls
      if (i < places.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    console.error('Google Places API error:', error);
    throw error;
  }

  return results;
}

/**
 * Search businesses using Yelp Fusion API
 * Uses key pooling for higher throughput
 */
export async function searchYelpFusion(
  query: string,
  location: string,
  limit: number,
  onProgress?: (message: string) => void
): Promise<ScrapedBusiness[]> {
  const apiKey = getNextApiKey('yelpFusion');

  if (!apiKey) {
    console.log('[YelpFusion] No API keys available or all quotas exhausted');
    return [];
  }

  const quota = checkQuota('yelpFusion');
  if (!quota.available) {
    console.log('[YelpFusion] Daily quota exhausted across all keys');
    return [];
  }

  const results: ScrapedBusiness[] = [];

  onProgress?.(`Searching Yelp Fusion API for "${query}" in ${location}...`);

  try {
    const searchUrl = new URL('https://api.yelp.com/v3/businesses/search');
    searchUrl.searchParams.set('term', query);
    searchUrl.searchParams.set('location', location || 'United States');
    searchUrl.searchParams.set('limit', Math.min(limit, 50).toString());

    const response = await fetch(searchUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });
    recordKeyUsage('yelpFusion', apiKey, 1);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Yelp API error: ${response.status} - ${errorText}`);
    }

    const data: YelpSearchResponse = await response.json();

    for (const business of data.businesses) {
      const address = business.location?.display_address?.join(', ') ||
        [business.location?.address1, business.location?.city, business.location?.state, business.location?.zip_code]
          .filter(Boolean)
          .join(', ') ||
        null;

      results.push({
        name: business.name,
        website: null, // Yelp doesn't provide website in search
        phone: business.display_phone || business.phone || null,
        address,
        instagram: null,
        rating: business.rating || null,
        review_count: business.review_count || null,
        source: 'yelp_fusion_api',
      });

      onProgress?.(`Yelp API: ${business.name} (${results.length}/${limit})`);
    }
  } catch (error) {
    console.error('Yelp Fusion API error:', error);
    throw error;
  }

  return results;
}

/**
 * Search businesses using Foursquare Places API
 * 100k calls/month free - uses key pooling
 */
export async function searchFoursquare(
  query: string,
  location: string,
  limit: number,
  onProgress?: (message: string) => void
): Promise<ScrapedBusiness[]> {
  const apiKey = getNextApiKey('foursquare');

  if (!apiKey) {
    console.log('[Foursquare] No API keys available or all quotas exhausted');
    return [];
  }

  const quota = checkQuota('foursquare');
  if (!quota.available) {
    console.log('[Foursquare] Daily quota exhausted across all keys');
    return [];
  }

  const results: ScrapedBusiness[] = [];

  onProgress?.(`Searching Foursquare API for "${query}" in ${location}...`);

  try {
    const searchUrl = new URL('https://api.foursquare.com/v3/places/search');
    searchUrl.searchParams.set('query', query);
    searchUrl.searchParams.set('near', location || 'United States');
    searchUrl.searchParams.set('limit', Math.min(limit, 50).toString());

    const response = await fetch(searchUrl.toString(), {
      headers: {
        'Authorization': apiKey,
        'Accept': 'application/json',
      },
    });
    recordKeyUsage('foursquare', apiKey, 1);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Foursquare API error: ${response.status} - ${errorText}`);
    }

    const data: FoursquareSearchResponse = await response.json();

    for (const place of data.results) {
      const address = place.location?.formatted_address ||
        [place.location?.address, place.location?.locality, place.location?.region, place.location?.postcode]
          .filter(Boolean)
          .join(', ') ||
        null;

      results.push({
        name: place.name,
        website: place.website || null,
        phone: place.tel || null,
        address,
        instagram: null,
        rating: place.rating ? place.rating / 2 : null, // Foursquare uses 0-10 scale
        review_count: place.stats?.total_ratings || null,
        source: 'foursquare_api',
      });

      onProgress?.(`Foursquare API: ${place.name} (${results.length}/${limit})`);
    }
  } catch (error) {
    console.error('Foursquare API error:', error);
    throw error;
  }

  return results;
}

/**
 * Search businesses using HERE Places API
 * 250k calls/month free - uses key pooling
 */
export async function searchHere(
  query: string,
  location: string,
  limit: number,
  onProgress?: (message: string) => void
): Promise<ScrapedBusiness[]> {
  let apiKey = getNextApiKey('here');

  if (!apiKey) {
    console.log('[HERE] No API keys available or all quotas exhausted');
    return [];
  }

  const quota = checkQuota('here');
  if (!quota.available) {
    console.log('[HERE] Daily quota exhausted across all keys');
    return [];
  }

  const results: ScrapedBusiness[] = [];

  onProgress?.(`Searching HERE API for "${query}" in ${location}...`);

  try {
    // First, geocode the location to get coordinates
    const geoUrl = new URL('https://geocode.search.hereapi.com/v1/geocode');
    geoUrl.searchParams.set('q', location || 'United States');
    geoUrl.searchParams.set('apiKey', apiKey);

    const geoResponse = await fetch(geoUrl.toString());
    recordKeyUsage('here', apiKey, 1);

    if (!geoResponse.ok) {
      throw new Error(`HERE Geocode error: ${geoResponse.status}`);
    }

    const geoData = await geoResponse.json();
    const position = geoData.items?.[0]?.position;

    if (!position) {
      console.log('[HERE] Could not geocode location');
      return results;
    }

    // Get next available key for the search request
    apiKey = getNextApiKey('here') || apiKey;

    // Search for places near the coordinates
    const searchUrl = new URL('https://discover.search.hereapi.com/v1/discover');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('at', `${position.lat},${position.lng}`);
    searchUrl.searchParams.set('limit', Math.min(limit, 100).toString());
    searchUrl.searchParams.set('apiKey', apiKey);

    const response = await fetch(searchUrl.toString());
    recordKeyUsage('here', apiKey, 1);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HERE API error: ${response.status} - ${errorText}`);
    }

    const data: HereSearchResponse = await response.json();

    for (const place of data.items) {
      const contacts = place.contacts?.[0];
      const phone = contacts?.phone?.[0]?.value || null;
      const website = contacts?.www?.[0]?.value || null;

      results.push({
        name: place.title,
        website,
        phone,
        address: place.address?.label || null,
        instagram: null,
        rating: null, // HERE doesn't provide ratings
        review_count: null,
        source: 'here_api',
      });

      onProgress?.(`HERE API: ${place.title} (${results.length}/${limit})`);
    }
  } catch (error) {
    console.error('HERE API error:', error);
    throw error;
  }

  return results;
}

/**
 * Search businesses using TomTom Search API
 * 2500 calls/day free - uses key pooling
 */
export async function searchTomTom(
  query: string,
  location: string,
  limit: number,
  onProgress?: (message: string) => void
): Promise<ScrapedBusiness[]> {
  const apiKey = getNextApiKey('tomtom');

  if (!apiKey) {
    console.log('[TomTom] No API keys available or all quotas exhausted');
    return [];
  }

  const quota = checkQuota('tomtom');
  if (!quota.available) {
    console.log('[TomTom] Daily quota exhausted across all keys');
    return [];
  }

  const results: ScrapedBusiness[] = [];
  const searchQuery = location ? `${query} ${location}` : query;

  onProgress?.(`Searching TomTom API for "${searchQuery}"...`);

  try {
    const searchUrl = new URL(`https://api.tomtom.com/search/2/poiSearch/${encodeURIComponent(searchQuery)}.json`);
    searchUrl.searchParams.set('key', apiKey);
    searchUrl.searchParams.set('limit', Math.min(limit, 100).toString());
    searchUrl.searchParams.set('categorySet', '7315'); // Business facilities

    const response = await fetch(searchUrl.toString());
    recordKeyUsage('tomtom', apiKey, 1);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TomTom API error: ${response.status} - ${errorText}`);
    }

    const data: TomTomSearchResponse = await response.json();

    for (const result of data.results) {
      if (!result.poi?.name) continue;

      results.push({
        name: result.poi.name,
        website: result.poi.url || null,
        phone: result.poi.phone || null,
        address: result.address?.freeformAddress || null,
        instagram: null,
        rating: null, // TomTom doesn't provide ratings
        review_count: null,
        source: 'tomtom_api',
      });

      onProgress?.(`TomTom API: ${result.poi.name} (${results.length}/${limit})`);
    }
  } catch (error) {
    console.error('TomTom API error:', error);
    throw error;
  }

  return results;
}

/**
 * Validate/enrich address using OpenCage Geocoding
 * 2500 calls/day free - uses key pooling
 */
export async function validateAddress(
  address: string
): Promise<{ valid: boolean; formatted: string | null; confidence: number }> {
  const apiKey = getNextApiKey('opencage');

  if (!apiKey || !address) {
    return { valid: false, formatted: null, confidence: 0 };
  }

  const quota = checkQuota('opencage');
  if (!quota.available) {
    return { valid: false, formatted: null, confidence: 0 };
  }

  try {
    const url = new URL('https://api.opencagedata.com/geocode/v1/json');
    url.searchParams.set('q', address);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('limit', '1');
    url.searchParams.set('no_annotations', '1');

    const response = await fetch(url.toString());
    recordKeyUsage('opencage', apiKey, 1);

    if (!response.ok) {
      return { valid: false, formatted: null, confidence: 0 };
    }

    const data = await response.json();
    const result = data.results?.[0];

    if (!result) {
      return { valid: false, formatted: null, confidence: 0 };
    }

    return {
      valid: result.confidence >= 5,
      formatted: result.formatted || null,
      confidence: result.confidence / 10, // Normalize to 0-1
    };
  } catch {
    return { valid: false, formatted: null, confidence: 0 };
  }
}

// ============ Unified Search ============

interface ApiSource {
  name: string;
  search: (query: string, location: string, limit: number, onProgress?: (message: string) => void) => Promise<ScrapedBusiness[]>;
  isAvailable: () => boolean;
  priority: number; // Lower = higher priority
}

function getAvailableApis(): ApiSource[] {
  const apis: ApiSource[] = [];

  // Check for pooled keys (or single key fallback)
  if (getApiKeys('googlePlaces').length > 0) {
    apis.push({
      name: 'Google Places',
      search: searchGooglePlaces,
      isAvailable: () => checkQuota('googlePlaces').available,
      priority: 1,
    });
  }

  if (getApiKeys('yelpFusion').length > 0) {
    apis.push({
      name: 'Yelp Fusion',
      search: searchYelpFusion,
      isAvailable: () => checkQuota('yelpFusion').available,
      priority: 2,
    });
  }

  if (getApiKeys('foursquare').length > 0) {
    apis.push({
      name: 'Foursquare',
      search: searchFoursquare,
      isAvailable: () => checkQuota('foursquare').available,
      priority: 3,
    });
  }

  if (getApiKeys('here').length > 0) {
    apis.push({
      name: 'HERE',
      search: searchHere,
      isAvailable: () => checkQuota('here').available,
      priority: 4,
    });
  }

  if (getApiKeys('tomtom').length > 0) {
    apis.push({
      name: 'TomTom',
      search: searchTomTom,
      isAvailable: () => checkQuota('tomtom').available,
      priority: 5,
    });
  }

  return apis.sort((a, b) => a.priority - b.priority);
}

/**
 * Search using all available APIs in parallel
 */
export async function searchWithApis(
  query: string,
  location: string,
  limit: number,
  onProgress?: (message: string) => void
): Promise<ScrapedBusiness[]> {
  const apis = getAvailableApis().filter(api => api.isAvailable());

  if (apis.length === 0) {
    console.log('[API] No APIs available (not configured or quota exhausted)');
    return [];
  }

  const results: ScrapedBusiness[] = [];
  const seenKeys = new Set<string>();

  // Run top 3 APIs in parallel for speed
  const parallelApis = apis.slice(0, 3);
  const remainingApis = apis.slice(3);

  onProgress?.(`Searching ${parallelApis.map(a => a.name).join(', ')} APIs...`);

  // Parallel search
  const parallelResults = await Promise.allSettled(
    parallelApis.map(api =>
      api.search(query, location, Math.ceil(limit / parallelApis.length), onProgress)
        .catch(err => {
          console.error(`${api.name} API error:`, err);
          return [] as ScrapedBusiness[];
        })
    )
  );

  for (const result of parallelResults) {
    if (result.status === 'fulfilled') {
      for (const business of result.value) {
        // Dedupe by name + phone or name + address
        const key = `${business.name.toLowerCase()}:${business.phone || business.address || ''}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          results.push(business);
        }
      }
    }
  }

  // Sequential search for remaining APIs if needed
  if (results.length < limit) {
    for (const api of remainingApis) {
      if (results.length >= limit) break;
      if (!api.isAvailable()) continue;

      try {
        onProgress?.(`Searching ${api.name} API...`);
        const apiResults = await api.search(query, location, limit - results.length, onProgress);

        for (const business of apiResults) {
          const key = `${business.name.toLowerCase()}:${business.phone || business.address || ''}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            results.push(business);
          }
        }
      } catch (error) {
        console.error(`${api.name} API error:`, error);
      }
    }
  }

  console.log(`[API] Found ${results.length} businesses from ${apis.length} APIs`);
  return results.slice(0, limit);
}

/**
 * Check if API fallback is available
 */
export function isApiFallbackAvailable(): boolean {
  const config = loadConfig();
  return config.apiFallback.enabled && getAvailableApis().length > 0;
}

/**
 * Check if we should prefer APIs over scraping
 */
export function shouldPreferApis(): boolean {
  const config = loadConfig();
  return config.apiFallback.preferApis && isApiFallbackAvailable();
}

/**
 * Get list of configured APIs
 */
export function getConfiguredApis(): string[] {
  return getAvailableApis().map(api => api.name);
}
