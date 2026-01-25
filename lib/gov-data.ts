/**
 * Government Data Integration Module
 * Free public data sources for business verification and enrichment
 *
 * Sources:
 * - SEC EDGAR: Public company filings (10-K, 10-Q) with employee counts
 * - State Business Registries: Business verification (CA, TX, FL, NY, IL)
 */

// SEC EDGAR API base URL (free, no API key required)
const SEC_EDGAR_BASE = 'https://data.sec.gov';
const SEC_EDGAR_SEARCH = 'https://efts.sec.gov/LATEST/search-index';

// User-Agent required by SEC (they block requests without proper identification)
const SEC_USER_AGENT = 'LeadGenTool/1.0 (contact@example.com)';

export interface SECCompanyInfo {
  cik: string;
  name: string;
  ticker: string | null;
  sic: string | null;
  sicDescription: string | null;
  employeeCount: number | null;
  fiscalYearEnd: string | null;
  stateOfIncorporation: string | null;
  businessAddress: {
    street: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
}

export interface StateRegistryResult {
  found: boolean;
  businessName: string | null;
  status: 'active' | 'inactive' | 'unknown';
  registrationDate: string | null;
  state: string;
  entityType: string | null;
}

/**
 * Search SEC EDGAR for a company by name
 * Returns basic company info if found
 */
export async function searchSECCompany(companyName: string): Promise<SECCompanyInfo | null> {
  try {
    // SEC full-text search endpoint
    const searchUrl = `${SEC_EDGAR_BASE}/cgi-bin/browse-edgar?company=${encodeURIComponent(companyName)}&CIK=&type=10-K&owner=include&count=10&action=getcompany&output=atom`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': SEC_USER_AGENT,
        'Accept': 'application/atom+xml',
      },
    });

    if (!response.ok) {
      console.warn(`SEC EDGAR search failed: ${response.status}`);
      return null;
    }

    const text = await response.text();

    // Parse the Atom feed to find CIK
    const cikMatch = text.match(/CIK=(\d{10})/);
    if (!cikMatch) {
      return null;
    }

    const cik = cikMatch[1];
    return await getSECCompanyByCIK(cik);
  } catch (error) {
    console.error('SEC EDGAR search error:', error);
    return null;
  }
}

/**
 * Get detailed company info from SEC by CIK number
 */
export async function getSECCompanyByCIK(cik: string): Promise<SECCompanyInfo | null> {
  try {
    // Pad CIK to 10 digits
    const paddedCik = cik.padStart(10, '0');

    // Get company facts (includes employee count from 10-K filings)
    const factsUrl = `${SEC_EDGAR_BASE}/submissions/CIK${paddedCik}.json`;

    const response = await fetch(factsUrl, {
      headers: {
        'User-Agent': SEC_USER_AGENT,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Extract employee count from recent filings
    let employeeCount: number | null = null;
    if (data.filings?.recent?.form) {
      // Look for most recent 10-K filing
      const forms = data.filings.recent.form;
      const tenKIndex = forms.findIndex((f: string) => f === '10-K');
      if (tenKIndex !== -1) {
        // Would need to parse the actual 10-K filing for employee count
        // For now, we'll use the company facts API
      }
    }

    // Try to get employee count from company facts
    try {
      const conceptUrl = `${SEC_EDGAR_BASE}/api/xbrl/companyfacts/CIK${paddedCik}.json`;
      const conceptResponse = await fetch(conceptUrl, {
        headers: {
          'User-Agent': SEC_USER_AGENT,
          'Accept': 'application/json',
        },
      });

      if (conceptResponse.ok) {
        const conceptData = await conceptResponse.json();
        // Look for NumberOfEmployees in dei (Document and Entity Information)
        const employeeData = conceptData?.facts?.dei?.EntityNumberOfEmployees?.units?.pure;
        if (employeeData && employeeData.length > 0) {
          // Get most recent value
          const sorted = [...employeeData].sort((a: any, b: any) =>
            new Date(b.end).getTime() - new Date(a.end).getTime()
          );
          employeeCount = sorted[0]?.val || null;
        }
      }
    } catch {
      // Employee count not available
    }

    return {
      cik: paddedCik,
      name: data.name || null,
      ticker: data.tickers?.[0] || null,
      sic: data.sic || null,
      sicDescription: data.sicDescription || null,
      employeeCount,
      fiscalYearEnd: data.fiscalYearEnd || null,
      stateOfIncorporation: data.stateOfIncorporation || null,
      businessAddress: data.addresses?.business ? {
        street: data.addresses.business.street1 || null,
        city: data.addresses.business.city || null,
        state: data.addresses.business.stateOrCountry || null,
        zip: data.addresses.business.zipCode || null,
      } : null,
    };
  } catch (error) {
    console.error('SEC EDGAR company fetch error:', error);
    return null;
  }
}

/**
 * SIC Code to Industry mapping (common B2C industries)
 */
const SIC_TO_INDUSTRY: Record<string, string> = {
  '5812': 'restaurant_food', // Eating Places
  '5813': 'restaurant_food', // Drinking Places
  '7011': 'entertainment', // Hotels and Motels
  '7231': 'beauty_wellness', // Beauty Shops
  '7241': 'beauty_wellness', // Barber Shops
  '7991': 'beauty_wellness', // Physical Fitness Facilities
  '7999': 'entertainment', // Amusement and Recreation
  '8011': 'medical', // Physicians
  '8021': 'medical', // Dentists
  '8042': 'medical', // Optometrists
  '8049': 'medical', // Health Practitioners
  '5311': 'retail', // Department Stores
  '5411': 'retail', // Grocery Stores
  '5461': 'retail', // Retail Bakeries
  '5531': 'automotive', // Auto Parts
  '5541': 'automotive', // Gas Stations
  '7538': 'automotive', // Auto Repair
  '8211': 'education', // Elementary Schools
  '8221': 'education', // Colleges
  '0742': 'pet_services', // Veterinary Services
  '1520': 'home_services', // General Contractors
  '1711': 'home_services', // Plumbing, Heating
  '1731': 'home_services', // Electrical Work
};

/**
 * Map SIC code to industry category
 */
export function sicToIndustry(sic: string | null): string | null {
  if (!sic) return null;
  return SIC_TO_INDUSTRY[sic] || null;
}

/**
 * State registry lookup URLs (for reference - actual scraping would need implementation)
 * These are public business search portals
 */
const STATE_REGISTRY_URLS: Record<string, string> = {
  'CA': 'https://bizfileonline.sos.ca.gov/search/business',
  'TX': 'https://mycpa.cpa.state.tx.us/coa/',
  'FL': 'https://search.sunbiz.org/Inquiry/CorporationSearch',
  'NY': 'https://apps.dos.ny.gov/publicInquiry/',
  'IL': 'https://apps.ilsos.gov/corporatellc/',
};

/**
 * Check if a business is registered in a state (simplified version)
 * Note: Full implementation would require scraping each state's portal
 */
export async function checkStateRegistry(
  businessName: string,
  state: string
): Promise<StateRegistryResult> {
  // State registries typically require CAPTCHA or have rate limits
  // This is a placeholder that returns unknown status
  // In production, you might use a paid service like Cobalt Intelligence

  const registryUrl = STATE_REGISTRY_URLS[state.toUpperCase()];

  if (!registryUrl) {
    return {
      found: false,
      businessName: null,
      status: 'unknown',
      registrationDate: null,
      state,
      entityType: null,
    };
  }

  // For now, return unknown - actual implementation would scrape the registry
  return {
    found: false,
    businessName: businessName,
    status: 'unknown',
    registrationDate: null,
    state,
    entityType: null,
  };
}

/**
 * Enrich a business with government data
 */
export async function enrichWithGovData(
  businessName: string,
  state: string | null
): Promise<{
  secInfo: SECCompanyInfo | null;
  stateRegistry: StateRegistryResult | null;
  industryCode: string | null;
}> {
  const results = {
    secInfo: null as SECCompanyInfo | null,
    stateRegistry: null as StateRegistryResult | null,
    industryCode: null as string | null,
  };

  // Try SEC EDGAR (only for larger/public companies)
  try {
    results.secInfo = await searchSECCompany(businessName);
    if (results.secInfo?.sic) {
      results.industryCode = sicToIndustry(results.secInfo.sic);
    }
  } catch {
    // SEC lookup failed, continue
  }

  // Try state registry if state is provided
  if (state) {
    try {
      results.stateRegistry = await checkStateRegistry(businessName, state);
    } catch {
      // State registry lookup failed, continue
    }
  }

  return results;
}

/**
 * Batch enrich multiple businesses (with rate limiting)
 */
export async function batchEnrichWithGovData(
  businesses: Array<{ name: string; state: string | null }>,
  options?: { delayMs?: number; maxConcurrent?: number }
): Promise<Map<string, { secInfo: SECCompanyInfo | null; industryCode: string | null }>> {
  const results = new Map<string, { secInfo: SECCompanyInfo | null; industryCode: string | null }>();
  const delayMs = options?.delayMs || 500; // SEC rate limit friendly

  for (const business of businesses) {
    try {
      const enriched = await enrichWithGovData(business.name, business.state);
      results.set(business.name, {
        secInfo: enriched.secInfo,
        industryCode: enriched.industryCode,
      });

      // Rate limit delay
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch {
      results.set(business.name, { secInfo: null, industryCode: null });
    }
  }

  return results;
}
