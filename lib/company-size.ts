/**
 * Company Size Estimation Module
 * Estimates employee count for B2C businesses using multiple heuristics
 */

import type { Browser } from 'playwright';
import { withPooledBrowser } from './browser-pool';

export interface CompanySizeEstimate {
  employeeCount: number | null;
  confidence: number; // 0-1
  source: string;
  reasoning: string;
}

export interface CompanySizeInput {
  name: string;
  website: string | null;
  reviewCount: number | null;
  yearsInBusiness: number | null;
  address: string | null;
  rating: number | null;
}

// Review count to employee count heuristics for B2C businesses
const REVIEW_HEURISTICS = {
  // Local service businesses (salons, restaurants, etc.)
  local: [
    { maxReviews: 50, estimatedEmployees: 3, label: '1-5' },
    { maxReviews: 150, estimatedEmployees: 8, label: '6-10' },
    { maxReviews: 500, estimatedEmployees: 25, label: '11-50' },
    { maxReviews: 2000, estimatedEmployees: 75, label: '51-100' },
    { maxReviews: 10000, estimatedEmployees: 150, label: '101-200' },
    { maxReviews: Infinity, estimatedEmployees: 300, label: '200+' },
  ],
};

/**
 * Estimate company size based on review count
 * More reviews generally correlate with larger operations
 */
export function estimateFromReviews(reviewCount: number | null): CompanySizeEstimate {
  if (!reviewCount || reviewCount < 1) {
    return {
      employeeCount: null,
      confidence: 0,
      source: 'review_heuristic',
      reasoning: 'No review data available',
    };
  }

  const heuristics = REVIEW_HEURISTICS.local;
  for (const tier of heuristics) {
    if (reviewCount <= tier.maxReviews) {
      // Confidence decreases for very high or very low counts
      const confidence = reviewCount < 10 ? 0.3 : reviewCount > 5000 ? 0.4 : 0.5;
      return {
        employeeCount: tier.estimatedEmployees,
        confidence,
        source: 'review_heuristic',
        reasoning: `${reviewCount} reviews suggests approximately ${tier.label} employees`,
      };
    }
  }

  return {
    employeeCount: 300,
    confidence: 0.3,
    source: 'review_heuristic',
    reasoning: `Very high review count (${reviewCount}) suggests 200+ employees`,
  };
}

/**
 * Estimate company size based on years in business
 * Older businesses tend to be more established
 */
export function estimateFromYearsInBusiness(years: number | null): CompanySizeEstimate {
  if (!years || years < 1) {
    return {
      employeeCount: null,
      confidence: 0,
      source: 'years_heuristic',
      reasoning: 'No years in business data available',
    };
  }

  // Very rough heuristic - older doesn't always mean larger
  if (years < 2) {
    return {
      employeeCount: 3,
      confidence: 0.2,
      source: 'years_heuristic',
      reasoning: `New business (${years} years) - likely small team`,
    };
  } else if (years < 5) {
    return {
      employeeCount: 8,
      confidence: 0.25,
      source: 'years_heuristic',
      reasoning: `Established business (${years} years) - possibly growing`,
    };
  } else if (years < 10) {
    return {
      employeeCount: 15,
      confidence: 0.3,
      source: 'years_heuristic',
      reasoning: `Mature business (${years} years) - likely stable team`,
    };
  } else {
    return {
      employeeCount: 25,
      confidence: 0.25,
      source: 'years_heuristic',
      reasoning: `Long-established business (${years}+ years) - varies widely`,
    };
  }
}

/**
 * Detect multi-location businesses from website
 * Multi-location typically means larger organizations
 */
export async function detectMultiLocation(
  website: string | null,
  browser?: Browser
): Promise<{ isMultiLocation: boolean; locationCount: number | null }> {
  if (!website) {
    return { isMultiLocation: false, locationCount: null };
  }

  const detect = async (b: Browser) => {
    const context = await b.newContext();
    const page = await context.newPage();

    try {
      await page.goto(website, { timeout: 15000, waitUntil: 'domcontentloaded' });

      // Look for multi-location indicators
      const content = await page.content();
      const lowerContent = content.toLowerCase();

      const multiLocationSignals = [
        /\b(\d+)\s*locations?\b/i,
        /find\s+a\s+location/i,
        /store\s+locator/i,
        /our\s+locations/i,
        /franchise/i,
        /near\s+you/i,
      ];

      let isMultiLocation = false;
      let locationCount: number | null = null;

      for (const pattern of multiLocationSignals) {
        const match = lowerContent.match(pattern);
        if (match) {
          isMultiLocation = true;
          // Try to extract location count
          if (match[1]) {
            const count = parseInt(match[1]);
            if (!isNaN(count) && count > 1 && count < 10000) {
              locationCount = count;
            }
          }
          break;
        }
      }

      await context.close();
      return { isMultiLocation, locationCount };
    } catch {
      await context.close();
      return { isMultiLocation: false, locationCount: null };
    }
  };

  if (browser) {
    return detect(browser);
  }

  return withPooledBrowser(detect);
}

/**
 * Try to find employee count from LinkedIn company page (public data only)
 * Note: LinkedIn heavily restricts scraping, so this is best-effort
 */
export async function estimateFromLinkedIn(
  companyName: string,
  website: string | null
): Promise<CompanySizeEstimate> {
  // LinkedIn heavily restricts automated access
  // This would require LinkedIn API access or careful rate-limited scraping
  // For now, return null and rely on other heuristics
  return {
    employeeCount: null,
    confidence: 0,
    source: 'linkedin',
    reasoning: 'LinkedIn data not available without API access',
  };
}

/**
 * Combine multiple estimates into a final estimate
 */
export function combineEstimates(estimates: CompanySizeEstimate[]): CompanySizeEstimate {
  const validEstimates = estimates.filter(e => e.employeeCount !== null && e.confidence > 0);

  if (validEstimates.length === 0) {
    return {
      employeeCount: null,
      confidence: 0,
      source: 'combined',
      reasoning: 'No valid estimates available',
    };
  }

  // Weight by confidence
  let totalWeight = 0;
  let weightedSum = 0;
  const sources: string[] = [];
  const reasons: string[] = [];

  for (const estimate of validEstimates) {
    if (estimate.employeeCount !== null) {
      weightedSum += estimate.employeeCount * estimate.confidence;
      totalWeight += estimate.confidence;
      sources.push(estimate.source);
      reasons.push(estimate.reasoning);
    }
  }

  const avgEmployees = Math.round(weightedSum / totalWeight);
  const avgConfidence = totalWeight / validEstimates.length;

  return {
    employeeCount: avgEmployees,
    confidence: Math.min(avgConfidence, 0.7), // Cap confidence since these are estimates
    source: sources.join(', '),
    reasoning: reasons.join('; '),
  };
}

/**
 * Main function to estimate company size
 */
export async function estimateCompanySize(
  input: CompanySizeInput,
  browser?: Browser
): Promise<CompanySizeEstimate> {
  const estimates: CompanySizeEstimate[] = [];

  // Estimate from review count (most reliable for B2C)
  const reviewEstimate = estimateFromReviews(input.reviewCount);
  if (reviewEstimate.confidence > 0) {
    estimates.push(reviewEstimate);
  }

  // Estimate from years in business
  const yearsEstimate = estimateFromYearsInBusiness(input.yearsInBusiness);
  if (yearsEstimate.confidence > 0) {
    estimates.push(yearsEstimate);
  }

  // Check for multi-location (indicates larger company)
  if (input.website) {
    try {
      const multiLocation = await detectMultiLocation(input.website, browser);
      if (multiLocation.isMultiLocation) {
        const locationMultiplier = multiLocation.locationCount || 5;
        // Multi-location businesses are typically larger
        estimates.push({
          employeeCount: Math.max(50, locationMultiplier * 10),
          confidence: 0.6,
          source: 'multi_location',
          reasoning: multiLocation.locationCount
            ? `Multi-location business with ${multiLocation.locationCount} locations`
            : 'Multi-location business detected',
        });
      }
    } catch {
      // Ignore errors in multi-location detection
    }
  }

  return combineEstimates(estimates);
}

/**
 * Check if a business matches the company size filter
 */
export function matchesCompanySizeFilter(
  estimate: CompanySizeEstimate,
  minSize: number | null,
  maxSize: number | null
): boolean {
  // If no filter set, match all
  if (minSize === null && maxSize === null) {
    return true;
  }

  // If we don't have an estimate, include the business (don't filter out)
  if (estimate.employeeCount === null) {
    return true;
  }

  // Check bounds
  if (minSize !== null && estimate.employeeCount < minSize) {
    return false;
  }

  if (maxSize !== null && estimate.employeeCount > maxSize) {
    return false;
  }

  return true;
}

/**
 * Classify a business as B2B or B2C based on indicators
 */
export function classifyBusinessType(
  name: string,
  category: string | null
): { isB2C: boolean; confidence: number } {
  const nameLower = name.toLowerCase();

  // B2B indicators
  const b2bIndicators = [
    'wholesale', 'distributor', 'manufacturing', 'industrial',
    'solutions', 'consulting', 'enterprise', 'technologies',
    'systems', 'services llc', 'inc.', 'corp', 'supply',
    'logistics', 'staffing', 'outsourcing', 'b2b',
  ];

  // B2C indicators (consumer-facing businesses)
  const b2cIndicators = [
    'restaurant', 'cafe', 'coffee', 'bakery', 'pizza', 'bar', 'grill',
    'salon', 'spa', 'barber', 'nail', 'beauty', 'hair',
    'gym', 'fitness', 'yoga', 'pilates', 'crossfit',
    'retail', 'store', 'shop', 'boutique', 'market',
    'dental', 'dentist', 'clinic', 'medical', 'doctor', 'vet',
    'auto', 'car wash', 'repair', 'mechanic',
    'hotel', 'inn', 'resort', 'motel',
    'school', 'academy', 'learning', 'tutoring',
  ];

  // Check for B2B indicators
  const hasB2bIndicator = b2bIndicators.some(ind => nameLower.includes(ind));

  // Check for B2C indicators
  const hasB2cIndicator = b2cIndicators.some(ind => nameLower.includes(ind));

  // Category-based classification
  const b2cCategories = [
    'restaurant_food', 'beauty_wellness', 'retail', 'medical',
    'automotive', 'entertainment', 'education', 'pet_services',
  ];

  const categoryIsB2C = category ? b2cCategories.includes(category) : false;

  if (hasB2cIndicator || categoryIsB2C) {
    return { isB2C: true, confidence: hasB2cIndicator ? 0.8 : 0.6 };
  }

  if (hasB2bIndicator) {
    return { isB2C: false, confidence: 0.7 };
  }

  // Default: assume B2C for local businesses
  return { isB2C: true, confidence: 0.4 };
}
