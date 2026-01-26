/**
 * Yelp Fusion API Integration
 *
 * Provides reliable business data without CAPTCHA issues.
 * Free tier: 5,000 requests/day
 *
 * API Docs: https://docs.developer.yelp.com/reference/v3_business_search
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local if it exists
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config(); // Also load .env

import { ScrapedBusiness } from './scraper';

const YELP_API_BASE = 'https://api.yelp.com/v3';

interface YelpBusiness {
  id: string;
  alias: string;
  name: string;
  image_url?: string;
  is_closed: boolean;
  url: string;
  review_count: number;
  rating: number;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  phone?: string;
  display_phone?: string;
  distance?: number;
  location?: {
    address1?: string;
    address2?: string;
    address3?: string;
    city?: string;
    zip_code?: string;
    country?: string;
    state?: string;
    display_address?: string[];
  };
  categories?: Array<{
    alias: string;
    title: string;
  }>;
}

interface YelpSearchResponse {
  total: number;
  businesses: YelpBusiness[];
  region?: {
    center: {
      longitude: number;
      latitude: number;
    };
  };
}

/**
 * Get Yelp API key from environment
 */
function getYelpApiKey(): string | null {
  return process.env.YELP_API_KEY || process.env.YELP_FUSION_API_KEY || null;
}

/**
 * Check if Yelp API is available
 */
export function isYelpApiAvailable(): boolean {
  return !!getYelpApiKey();
}

/**
 * Search businesses via Yelp Fusion API
 */
export async function searchYelpApi(
  query: string,
  location: string,
  limit: number = 20,
  onProgress?: (message: string) => void
): Promise<ScrapedBusiness[]> {
  const apiKey = getYelpApiKey();

  if (!apiKey) {
    console.log('[YelpAPI] No API key found (set YELP_API_KEY env var)');
    return [];
  }

  const results: ScrapedBusiness[] = [];
  const seenNames = new Set<string>();

  try {
    // Yelp API returns max 50 per request, and up to 1000 total via offset
    const maxPerRequest = 50;
    const maxOffset = Math.min(limit, 200); // Cap at 200 to stay within free tier limits
    let offset = 0;

    while (results.length < limit && offset < maxOffset) {
      const requestLimit = Math.min(maxPerRequest, limit - results.length);

      const params = new URLSearchParams({
        term: query,
        location: location,
        limit: requestLimit.toString(),
        offset: offset.toString(),
        sort_by: 'best_match',
      });

      const url = `${YELP_API_BASE}/businesses/search?${params}`;

      onProgress?.(`Searching Yelp API (offset ${offset})...`);
      console.log(`[YelpAPI] Requesting: term="${query}", location="${location}", limit=${requestLimit}, offset=${offset}`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[YelpAPI] Error ${response.status}: ${errorText}`);

        if (response.status === 401) {
          console.error('[YelpAPI] Invalid API key');
        } else if (response.status === 429) {
          console.error('[YelpAPI] Rate limit exceeded');
        }

        break;
      }

      const data: YelpSearchResponse = await response.json();
      console.log(`[YelpAPI] Found ${data.businesses.length} businesses (total: ${data.total})`);

      if (data.businesses.length === 0) {
        break;
      }

      for (const biz of data.businesses) {
        if (results.length >= limit) break;

        const nameLower = biz.name.toLowerCase();
        if (seenNames.has(nameLower)) continue;
        seenNames.add(nameLower);

        // Format address from location object
        let address: string | null = null;
        if (biz.location?.display_address?.length) {
          address = biz.location.display_address.join(', ');
        } else if (biz.location?.address1) {
          const parts = [biz.location.address1];
          if (biz.location.city) parts.push(biz.location.city);
          if (biz.location.state) parts.push(biz.location.state);
          if (biz.location.zip_code) parts.push(biz.location.zip_code);
          address = parts.join(', ');
        }

        // Extract website from Yelp URL (the actual business website isn't in search results)
        // We'll need to get the business details for the actual website
        // For now, store the Yelp URL and let website discovery find the real site

        results.push({
          name: biz.name,
          website: null, // Yelp search doesn't return business websites
          phone: biz.display_phone || biz.phone || null,
          address: address,
          instagram: null,
          rating: biz.rating || null,
          review_count: biz.review_count || null,
          source: 'yelp_api',
          email: null,
        });

        console.log(`[YelpAPI] ✓ ${biz.name} | phone: ${biz.phone ? 'yes' : 'no'} | rating: ${biz.rating}`);
        onProgress?.(`Yelp API: ${biz.name} (${results.length}/${limit})`);
      }

      offset += data.businesses.length;

      // If we got fewer than requested, we've hit the end
      if (data.businesses.length < requestLimit) {
        break;
      }

      // Small delay between paginated requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`[YelpAPI] Complete: ${results.length} businesses extracted`);
    return results;

  } catch (error) {
    console.error(`[YelpAPI] Error: ${error}`);
    return results;
  }
}

/**
 * Get detailed business info including website
 * This uses an additional API call per business
 */
export async function getYelpBusinessDetails(
  businessId: string
): Promise<{ website: string | null; hours: string | null } | null> {
  const apiKey = getYelpApiKey();

  if (!apiKey) {
    return null;
  }

  try {
    const url = `${YELP_API_BASE}/businesses/${businessId}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // The details endpoint returns the actual business website in 'url' field
    // but we need to filter out yelp.com URLs
    let website = data.url || null;
    if (website && website.includes('yelp.com')) {
      website = null; // This is the Yelp page, not the business website
    }

    return {
      website,
      hours: data.hours?.[0]?.is_open_now ? 'Open now' : null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch business details to get website URL
 * Returns the business website if available
 */
async function fetchBusinessWebsite(businessId: string, apiKey: string): Promise<string | null> {
  try {
    const url = `${YELP_API_BASE}/businesses/${businessId}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // The 'url' field in details is the Yelp page URL
    // Business websites are in a different field or need to be extracted
    // Some businesses have a 'website' attribute in special_hours or attributes
    // But most don't expose it - we'll need to rely on other discovery methods

    return null; // Yelp doesn't expose business websites in the API
  } catch {
    return null;
  }
}

/**
 * Search with business details (slower but gets more info)
 * Uses 1 + N API calls where N is the number of results
 */
export async function searchYelpApiWithDetails(
  query: string,
  location: string,
  limit: number = 20,
  onProgress?: (message: string) => void
): Promise<ScrapedBusiness[]> {
  // First get search results
  const businesses = await searchYelpApi(query, location, limit, onProgress);

  // Note: The Yelp API doesn't actually return the business's own website URL
  // in either search or details endpoint - only the Yelp page URL.
  // Website discovery via search engines is still needed.

  return businesses;
}
