/**
 * Email Discovery API Integrations
 * Supports multiple email finder services for maximum coverage
 */

export interface EmailApiResult {
  email: string;
  confidence: number;
  source: string;
  verified?: boolean;
}

// Cache for API results to avoid duplicate calls
const apiCache = new Map<string, { result: EmailApiResult | null; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCached(key: string): EmailApiResult | null | undefined {
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }
  return undefined;
}

function setCache(key: string, result: EmailApiResult | null): void {
  apiCache.set(key, { result, timestamp: Date.now() });
}

/**
 * Apollo.io API - Large B2B database
 * Requires APOLLO_API_KEY env var
 */
export async function searchApollo(domain: string, companyName?: string): Promise<EmailApiResult | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `apollo:${domain}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  try {
    // Search for organization first
    const orgResponse = await fetch('https://api.apollo.io/v1/organizations/enrich', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ domain }),
    });

    if (!orgResponse.ok) {
      setCache(cacheKey, null);
      return null;
    }

    const orgData = await orgResponse.json();

    // Search for people at the organization
    const peopleResponse = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({
        organization_domains: [domain],
        page: 1,
        per_page: 10,
        // Prioritize decision makers
        seniority: ['owner', 'founder', 'c_suite', 'vp', 'director', 'manager'],
      }),
    });

    if (!peopleResponse.ok) {
      setCache(cacheKey, null);
      return null;
    }

    const peopleData = await peopleResponse.json();

    if (peopleData.people && peopleData.people.length > 0) {
      // Find first person with verified email
      for (const person of peopleData.people) {
        if (person.email && person.email_status === 'verified') {
          const result: EmailApiResult = {
            email: person.email.toLowerCase(),
            confidence: 0.95,
            source: 'apollo-api',
            verified: true,
          };
          setCache(cacheKey, result);
          return result;
        }
      }

      // Fall back to first person with any email
      const firstWithEmail = peopleData.people.find((p: { email?: string }) => p.email);
      if (firstWithEmail) {
        const result: EmailApiResult = {
          email: firstWithEmail.email.toLowerCase(),
          confidence: 0.85,
          source: 'apollo-api',
          verified: false,
        };
        setCache(cacheKey, result);
        return result;
      }
    }

    // Check if org has a generic email
    if (orgData.organization?.primary_phone) {
      // Sometimes Apollo returns company contact info
    }

    setCache(cacheKey, null);
    return null;
  } catch (error) {
    console.warn('Apollo API error:', error);
    return null;
  }
}

/**
 * Clearbit API - Company enrichment + emails
 * Requires CLEARBIT_API_KEY env var
 */
export async function searchClearbit(domain: string): Promise<EmailApiResult | null> {
  const apiKey = process.env.CLEARBIT_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `clearbit:${domain}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  try {
    // Use Clearbit's Company API
    const response = await fetch(`https://company.clearbit.com/v2/companies/find?domain=${encodeURIComponent(domain)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      setCache(cacheKey, null);
      return null;
    }

    const data = await response.json();

    // Clearbit provides company emails in the response
    if (data.emailAddresses && data.emailAddresses.length > 0) {
      const result: EmailApiResult = {
        email: data.emailAddresses[0].toLowerCase(),
        confidence: 0.90,
        source: 'clearbit-api',
        verified: true,
      };
      setCache(cacheKey, result);
      return result;
    }

    // Try to find people at the company via Prospector (if available)
    // This requires Clearbit Prospector which is a separate product

    setCache(cacheKey, null);
    return null;
  } catch (error) {
    console.warn('Clearbit API error:', error);
    return null;
  }
}

/**
 * RocketReach API - Professional email finder
 * Requires ROCKETREACH_API_KEY env var
 */
export async function searchRocketReach(domain: string, companyName?: string): Promise<EmailApiResult | null> {
  const apiKey = process.env.ROCKETREACH_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `rocketreach:${domain}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  try {
    // Search for company
    const searchResponse = await fetch('https://api.rocketreach.co/v2/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': apiKey,
      },
      body: JSON.stringify({
        query: {
          current_employer_domain: [domain],
        },
        start: 1,
        page_size: 5,
      }),
    });

    if (!searchResponse.ok) {
      setCache(cacheKey, null);
      return null;
    }

    const searchData = await searchResponse.json();

    if (searchData.profiles && searchData.profiles.length > 0) {
      // Look up first profile for email
      const profileId = searchData.profiles[0].id;

      const lookupResponse = await fetch(`https://api.rocketreach.co/v2/api/lookupProfile?id=${profileId}`, {
        headers: {
          'Api-Key': apiKey,
        },
      });

      if (lookupResponse.ok) {
        const profileData = await lookupResponse.json();

        if (profileData.emails && profileData.emails.length > 0) {
          // Prefer professional emails
          const professionalEmail = profileData.emails.find(
            (e: { type?: string }) => e.type === 'professional' || e.type === 'work'
          );
          const email = professionalEmail || profileData.emails[0];

          const result: EmailApiResult = {
            email: (email.email || email).toLowerCase(),
            confidence: 0.90,
            source: 'rocketreach-api',
            verified: email.verified || false,
          };
          setCache(cacheKey, result);
          return result;
        }
      }
    }

    setCache(cacheKey, null);
    return null;
  } catch (error) {
    console.warn('RocketReach API error:', error);
    return null;
  }
}

/**
 * Snov.io API - Email finder with verification
 * Requires SNOV_CLIENT_ID and SNOV_CLIENT_SECRET env vars
 */
let snovAccessToken: string | null = null;
let snovTokenExpiry = 0;

async function getSnovToken(): Promise<string | null> {
  const clientId = process.env.SNOV_CLIENT_ID;
  const clientSecret = process.env.SNOV_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  // Return cached token if still valid
  if (snovAccessToken && Date.now() < snovTokenExpiry) {
    return snovAccessToken;
  }

  try {
    const response = await fetch('https://api.snov.io/v1/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    snovAccessToken = data.access_token;
    snovTokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 1 min before expiry
    return snovAccessToken;
  } catch {
    return null;
  }
}

export async function searchSnov(domain: string): Promise<EmailApiResult | null> {
  const token = await getSnovToken();
  if (!token) return null;

  const cacheKey = `snov:${domain}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;

  try {
    // Domain search
    const response = await fetch('https://api.snov.io/v1/get-domain-emails-count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        domain,
      }),
    });

    if (!response.ok) {
      setCache(cacheKey, null);
      return null;
    }

    const countData = await response.json();

    if (countData.result > 0) {
      // Get actual emails
      const emailsResponse = await fetch('https://api.snov.io/v1/get-domain-emails-with-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
          domain,
          type: 'all',
          limit: 10,
        }),
      });

      if (emailsResponse.ok) {
        const emailsData = await emailsResponse.json();

        if (emailsData.emails && emailsData.emails.length > 0) {
          // Prefer generic company emails
          const genericEmail = emailsData.emails.find((e: { email: string }) =>
            e.email.toLowerCase().startsWith('info@') ||
            e.email.toLowerCase().startsWith('contact@') ||
            e.email.toLowerCase().startsWith('hello@')
          );

          const email = genericEmail || emailsData.emails[0];

          const result: EmailApiResult = {
            email: email.email.toLowerCase(),
            confidence: email.status === 'valid' ? 0.95 : 0.85,
            source: 'snov-api',
            verified: email.status === 'valid',
          };
          setCache(cacheKey, result);
          return result;
        }
      }
    }

    setCache(cacheKey, null);
    return null;
  } catch (error) {
    console.warn('Snov API error:', error);
    return null;
  }
}

/**
 * NeverBounce API - Email verification
 * Requires NEVERBOUNCE_API_KEY env var
 */
export async function verifyWithNeverBounce(email: string): Promise<{
  valid: boolean;
  result: string;
  confidence: number;
} | null> {
  const apiKey = process.env.NEVERBOUNCE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.neverbounce.com/v4/single/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: apiKey,
        email,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();

    // NeverBounce result codes: valid, invalid, disposable, catchall, unknown
    const resultMap: Record<string, { valid: boolean; confidence: number }> = {
      valid: { valid: true, confidence: 0.98 },
      catchall: { valid: true, confidence: 0.70 }, // Accept-all domain
      unknown: { valid: true, confidence: 0.60 },
      invalid: { valid: false, confidence: 0.05 },
      disposable: { valid: false, confidence: 0.10 },
    };

    const resultInfo = resultMap[data.result] || { valid: false, confidence: 0.50 };

    return {
      valid: resultInfo.valid,
      result: data.result,
      confidence: resultInfo.confidence,
    };
  } catch (error) {
    console.warn('NeverBounce API error:', error);
    return null;
  }
}

/**
 * ZeroBounce API - Email verification with deliverability scoring
 * Requires ZEROBOUNCE_API_KEY env var
 */
export async function verifyWithZeroBounce(email: string): Promise<{
  valid: boolean;
  status: string;
  subStatus: string;
  confidence: number;
  isCatchAll: boolean;
} | null> {
  const apiKey = process.env.ZEROBOUNCE_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://api.zerobounce.net/v2/validate?api_key=${apiKey}&email=${encodeURIComponent(email)}`
    );

    if (!response.ok) return null;

    const data = await response.json();

    // ZeroBounce status: valid, invalid, catch-all, unknown, spamtrap, abuse, do_not_mail
    const validStatuses = ['valid', 'catch-all'];
    const isValid = validStatuses.includes(data.status);

    let confidence = 0.50;
    if (data.status === 'valid') confidence = 0.98;
    else if (data.status === 'catch-all') confidence = 0.70;
    else if (data.status === 'unknown') confidence = 0.55;
    else if (data.status === 'invalid') confidence = 0.05;

    return {
      valid: isValid,
      status: data.status,
      subStatus: data.sub_status || '',
      confidence,
      isCatchAll: data.status === 'catch-all',
    };
  } catch (error) {
    console.warn('ZeroBounce API error:', error);
    return null;
  }
}

/**
 * Search all available APIs in parallel
 */
export async function searchAllApis(domain: string, companyName?: string): Promise<EmailApiResult | null> {
  // Run all API searches in parallel
  const results = await Promise.allSettled([
    searchApollo(domain, companyName),
    searchClearbit(domain),
    searchRocketReach(domain, companyName),
    searchSnov(domain),
  ]);

  // Collect successful results
  const validResults: EmailApiResult[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      validResults.push(result.value);
    }
  }

  if (validResults.length === 0) return null;

  // Sort by confidence and return best result
  validResults.sort((a, b) => b.confidence - a.confidence);
  return validResults[0];
}

/**
 * Verify email with best available service
 */
export async function verifyEmailWithApi(email: string): Promise<{
  valid: boolean;
  confidence: number;
  source: string;
  isCatchAll?: boolean;
} | null> {
  // Try ZeroBounce first (more detailed)
  const zbResult = await verifyWithZeroBounce(email);
  if (zbResult) {
    return {
      valid: zbResult.valid,
      confidence: zbResult.confidence,
      source: 'zerobounce',
      isCatchAll: zbResult.isCatchAll,
    };
  }

  // Fall back to NeverBounce
  const nbResult = await verifyWithNeverBounce(email);
  if (nbResult) {
    return {
      valid: nbResult.valid,
      confidence: nbResult.confidence,
      source: 'neverbounce',
      isCatchAll: nbResult.result === 'catchall',
    };
  }

  return null;
}
