/**
 * Simple Email Finder
 * Finds emails by fetching website HTML without browser automation
 * Works as a fallback when APIs and Browserless aren't available
 */

export interface SimpleEmailResult {
  email: string;
  source: string;
  confidence: number;
}

// Common paths where contact info is usually found
const CONTACT_PATHS = [
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/team',
  '/company',
  '/info',
  '/support',
  '/get-in-touch',
  '/reach-us',
  '/connect',
];

// Email regex pattern - stricter to avoid false positives
// Must start with a letter and not contain file extensions
const EMAIL_REGEX = /\b[a-zA-Z][a-zA-Z0-9._%+-]{0,63}@[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(?:\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})*\.[a-zA-Z]{2,10}\b/gi;

// File extensions to reject (false positives from image/asset URLs)
const REJECT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.css', '.js', '.pdf'];

// Domains to skip (generic, tracking, etc.)
const SKIP_DOMAINS = [
  'example.com',
  'email.com',
  'mail.com',
  'test.com',
  'domain.com',
  'yoursite.com',
  'yourdomain.com',
  'yourcompany.com',
  'sentry.io',
  'wixpress.com',
  'wordpress.com',
  'squarespace.com',
  'shopify.com',
  'google.com',
  'googleapis.com',
  'gstatic.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'linkedin.com',
  'schema.org',
  'w3.org',
  'gravatar.com',
  'mailchimp.com',
  'sendgrid.net',
  'hubspot.com',
  'constantcontact.com',
  // Government domains - never business contact emails
  '.gov',
  'ca.gov',
  'state.',
  // Directory/aggregator sites
  'yellowpages.com',
  'yelp.com',
  'bbb.org',
  'localsearch.com',
  'give.org',
  // Other non-business domains
  'harvesttotable.com', // gardening site incorrectly matched
  'wickedthemusicalstore.com', // unrelated store
];

// Prefixes that indicate business contact emails (PRIORITIZE these)
const BUSINESS_PREFIXES = ['info', 'contact', 'hello', 'office', 'mail', 'enquiries', 'inquiries'];

// Prefixes that are less desirable
const LOW_PRIORITY_PREFIXES = ['noreply', 'no-reply', 'donotreply', 'mailer', 'newsletter', 'marketing'];

/**
 * Extract domain from URL
 */
function getDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
  }
}

/**
 * Check if email domain matches or is related to website domain
 */
function emailMatchesDomain(email: string, websiteDomain: string): boolean {
  const emailDomain = email.split('@')[1]?.toLowerCase();
  if (!emailDomain) return false;

  // Exact match
  if (emailDomain === websiteDomain) return true;

  // Subdomain match (e.g., mail.company.com matches company.com)
  if (emailDomain.endsWith('.' + websiteDomain)) return true;
  if (websiteDomain.endsWith('.' + emailDomain)) return true;

  // Check if base domain names match (ignoring TLD)
  // e.g., company.com and company.net should match
  const emailBase = emailDomain.split('.').slice(0, -1).join('.');
  const websiteBase = websiteDomain.split('.').slice(0, -1).join('.');
  if (emailBase && websiteBase && emailBase === websiteBase) return true;

  return false;
}

/**
 * Score an email based on quality signals
 * IMPROVED: Domain matching is a bonus, not a requirement
 */
function scoreEmail(email: string, websiteDomain: string, foundOnContactPage: boolean): number {
  let score = 0.60; // Higher base score

  const emailLower = email.toLowerCase();
  const prefix = emailLower.split('@')[0];
  const emailDomain = emailLower.split('@')[1];

  // Domain matching is a BONUS (not a penalty for non-match)
  if (emailMatchesDomain(email, websiteDomain)) {
    score += 0.20; // Significant bonus for matching domain
  }

  // Contact page bonus
  if (foundOnContactPage) {
    score += 0.15; // Bigger bonus for contact page
  }

  // Business prefixes get bonus (these are what we want!)
  if (BUSINESS_PREFIXES.some(p => prefix === p || prefix.startsWith(p))) {
    score += 0.10;
  }

  // Low priority prefixes get penalty
  if (LOW_PRIORITY_PREFIXES.some(p => prefix === p || prefix.startsWith(p))) {
    score -= 0.15;
  }

  // Personal-looking emails (first.last@) get small bonus
  if (prefix.includes('.') && /^[a-z]+\.[a-z]+$/.test(prefix)) {
    score += 0.05;
  }

  // Gmail/Yahoo/Hotmail get penalty (but still valid - many small businesses use them)
  const genericProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
  if (genericProviders.includes(emailDomain)) {
    score -= 0.10;
  }

  return Math.min(0.95, Math.max(0.40, score));
}

/**
 * Validate email format and quality
 */
function isValidEmail(email: string): boolean {
  // Must have exactly one @
  const parts = email.split('@');
  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;

  // Local part validation
  if (!localPart || localPart.length === 0 || localPart.length > 64) return false;
  if (/^\d+$/.test(localPart)) return false; // All numbers = likely phone number
  if (/^\d{3,}/.test(localPart)) return false; // Starts with 3+ digits = likely phone number
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (localPart.includes('..')) return false;

  // Domain validation
  if (!domain || domain.length < 4) return false;
  if (!domain.includes('.')) return false;

  // Check for file extensions (false positives)
  const lowerEmail = email.toLowerCase();
  if (REJECT_EXTENSIONS.some(ext => lowerEmail.endsWith(ext))) return false;

  // Check domain TLD
  const tld = domain.split('.').pop() || '';
  if (tld.length < 2 || tld.length > 10) return false;
  if (/\d/.test(tld)) return false; // TLD shouldn't have numbers

  return true;
}

/**
 * Extract emails from HTML content
 */
function extractEmails(html: string, websiteDomain: string, isContactPage: boolean): SimpleEmailResult[] {
  const matches = html.match(EMAIL_REGEX) || [];
  const seen = new Set<string>();
  const results: SimpleEmailResult[] = [];

  for (const match of matches) {
    const email = match.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);

    // Validate email format
    if (!isValidEmail(email)) continue;

    const emailDomain = email.split('@')[1];

    // Skip unwanted domains
    if (SKIP_DOMAINS.some(d => emailDomain?.includes(d))) continue;

    // Skip obvious fake/placeholder emails
    if (email.includes('example') || email.includes('test@') || email.includes('your@')) continue;

    const confidence = scoreEmail(email, websiteDomain, isContactPage);

    results.push({
      email,
      source: isContactPage ? 'website-contact-page' : 'website-scrape',
      confidence,
    });
  }

  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Fetch a URL with timeout and error handling
 */
async function fetchWithTimeout(url: string, timeoutMs: number = 10000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Find email for a website using simple HTTP requests
 * IMPROVED: More lenient thresholds, collects all emails before deciding
 */
export async function findEmailSimple(website: string): Promise<SimpleEmailResult | null> {
  if (!website) return null;

  const baseUrl = website.startsWith('http') ? website : `https://${website}`;
  const domain = getDomain(website);
  const allEmails: SimpleEmailResult[] = [];

  // Try homepage first
  const homepageHtml = await fetchWithTimeout(baseUrl);
  if (homepageHtml) {
    const homeEmails = extractEmails(homepageHtml, domain, false);
    allEmails.push(...homeEmails);
  }

  // IMPROVED: Check for high-confidence email (lowered threshold from 0.75 to 0.70)
  // AND don't require domain match for early exit
  const highConfidenceHome = allEmails.find(e => e.confidence >= 0.70);
  if (highConfidenceHome) {
    return highConfidenceHome;
  }

  // Try contact pages
  for (const path of CONTACT_PATHS) {
    try {
      const url = new URL(path, baseUrl).toString();
      const html = await fetchWithTimeout(url, 8000);
      if (html) {
        const contactEmails = extractEmails(html, domain, true);
        allEmails.push(...contactEmails);

        // IMPROVED: Lower threshold (0.65) and don't require domain match
        const good = contactEmails.find(e => e.confidence >= 0.65);
        if (good) {
          return good;
        }
      }
    } catch {
      // Continue to next path
    }
  }

  // IMPROVED: Return best email regardless of domain match
  // Sort all emails by confidence and return best
  if (allEmails.length > 0) {
    // Deduplicate
    const uniqueEmails = new Map<string, SimpleEmailResult>();
    for (const e of allEmails) {
      if (!uniqueEmails.has(e.email) || uniqueEmails.get(e.email)!.confidence < e.confidence) {
        uniqueEmails.set(e.email, e);
      }
    }

    // Sort by confidence and return best
    const sorted = [...uniqueEmails.values()].sort((a, b) => b.confidence - a.confidence);
    return sorted[0];
  }

  return null;
}

/**
 * Find emails for multiple businesses in parallel
 */
export async function findEmailsSimpleBatch(
  businesses: Array<{ name: string; website: string | null }>,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number, result: { name: string; email: string | null }) => void;
  } = {}
): Promise<Map<string, SimpleEmailResult | null>> {
  const { concurrency = 5, onProgress } = options;
  const results = new Map<string, SimpleEmailResult | null>();
  const queue = [...businesses];
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const business = queue.shift();
      if (!business) break;

      let result: SimpleEmailResult | null = null;

      if (business.website) {
        try {
          result = await findEmailSimple(business.website);
        } catch {
          result = null;
        }
      }

      results.set(business.name, result);
      completed++;

      onProgress?.(completed, businesses.length, {
        name: business.name,
        email: result?.email || null,
      });
    }
  }

  // Run workers in parallel
  const workers = Array.from({ length: Math.min(concurrency, businesses.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
