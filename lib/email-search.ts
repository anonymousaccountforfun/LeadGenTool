/**
 * Email Search Module
 * Searches for emails directly via search engines and phone lookups
 */

import { googleSearch, bingSearch, duckDuckGoSearch, extractEmailsFromResults, SearchResult } from './search-engines';
import { scrapeAllDirectories, getBestEmail } from './directory-scraper';

export interface EmailSearchResult {
  email: string;
  source: 'google-search' | 'bing-search' | 'duckduckgo-search' | 'phone-search' | 'directory';
  confidence: number;
  query?: string;
}

// Email regex - strict to avoid false positives
const EMAIL_REGEX = /\b[a-zA-Z][a-zA-Z0-9._%+-]{0,63}@[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(?:\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})*\.[a-zA-Z]{2,10}\b/gi;

// Extensions to reject
const REJECT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.css', '.js', '.pdf'];

// Domains to skip
const SKIP_EMAIL_DOMAINS = [
  'example.com', 'email.com', 'test.com', 'domain.com',
  'google.com', 'bing.com', 'duckduckgo.com',
  'facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com',
  'yelp.com', 'yellowpages.com', 'bbb.org',
  'sentry.io', 'wixpress.com', 'wordpress.com', 'squarespace.com',
  // Government domains
  '.gov', 'ca.gov', 'cpuc.ca.gov', 'state.',
  // Directory/aggregator sites
  'localsearch.com', 'give.org',
];

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const parts = email.split('@');
  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;
  if (!localPart || localPart.length === 0 || localPart.length > 64) return false;
  if (/^\d+$/.test(localPart)) return false; // All numbers
  if (/^\d{3,}/.test(localPart)) return false; // Starts with 3+ digits

  if (!domain || domain.length < 4 || !domain.includes('.')) return false;

  // Check for file extensions
  const lowerEmail = email.toLowerCase();
  if (REJECT_EXTENSIONS.some(ext => lowerEmail.endsWith(ext))) return false;

  // Check TLD
  const tld = domain.split('.').pop() || '';
  if (tld.length < 2 || tld.length > 10 || /\d/.test(tld)) return false;

  return true;
}

/**
 * Filter and validate emails from results
 */
function filterValidEmails(emails: string[], businessName?: string): string[] {
  const seen = new Set<string>();
  const valid: string[] = [];

  for (const email of emails) {
    const lower = email.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);

    if (!isValidEmail(lower)) continue;

    const domain = lower.split('@')[1];
    if (SKIP_EMAIL_DOMAINS.some(d => domain?.includes(d))) continue;

    // Skip placeholder emails
    if (lower.includes('example') || lower.includes('test@') || lower.includes('your@')) continue;

    valid.push(lower);
  }

  return valid;
}

/**
 * Extract emails from search results with business name matching
 */
function extractAndScoreEmails(
  results: SearchResult[],
  businessName: string,
  source: EmailSearchResult['source'],
  baseConfidence: number
): EmailSearchResult[] {
  const emails: EmailSearchResult[] = [];
  const rawEmails = extractEmailsFromResults(results);
  const validEmails = filterValidEmails(rawEmails, businessName);

  // Normalize business name for matching
  const nameParts = businessName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(p => p.length > 2);

  for (const email of validEmails) {
    const emailDomain = email.split('@')[1];
    const domainName = emailDomain?.split('.')[0] || '';

    // Boost confidence if domain matches business name
    let confidence = baseConfidence;
    if (nameParts.some(part => domainName.includes(part))) {
      confidence = Math.min(0.90, confidence + 0.10);
    }

    emails.push({ email, source, confidence });
  }

  return emails;
}

/**
 * Search Google for business email
 */
async function searchGoogleForEmail(
  name: string,
  location: string
): Promise<EmailSearchResult[]> {
  const results: EmailSearchResult[] = [];

  // Query 1: Direct email search
  const emailQuery = `${name} ${location} email`;
  const emailResults = await googleSearch(emailQuery).catch(() => []);
  results.push(...extractAndScoreEmails(emailResults, name, 'google-search', 0.55));

  // Query 2: Contact page search
  const contactQuery = `${name} ${location} contact`;
  const contactResults = await googleSearch(contactQuery).catch(() => []);
  results.push(...extractAndScoreEmails(contactResults, name, 'google-search', 0.50));

  return results;
}

/**
 * Search Bing for business email
 */
async function searchBingForEmail(
  name: string,
  location: string
): Promise<EmailSearchResult[]> {
  const query = `${name} ${location} email contact`;
  const results = await bingSearch(query).catch(() => []);
  return extractAndScoreEmails(results, name, 'bing-search', 0.50);
}

/**
 * Search DuckDuckGo for business email
 */
async function searchDuckDuckGoForEmail(
  name: string,
  location: string
): Promise<EmailSearchResult[]> {
  const query = `${name} ${location} email`;
  const results = await duckDuckGoSearch(query).catch(() => []);
  return extractAndScoreEmails(results, name, 'duckduckgo-search', 0.45);
}

/**
 * Search by phone number
 */
async function searchByPhone(
  phone: string,
  businessName: string
): Promise<EmailSearchResult[]> {
  // Clean phone number
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10) return [];

  // Format for search
  const formattedPhone = cleanPhone.length === 10
    ? `${cleanPhone.slice(0, 3)}-${cleanPhone.slice(3, 6)}-${cleanPhone.slice(6)}`
    : cleanPhone;

  const results: EmailSearchResult[] = [];

  // Google search by phone
  const googleResults = await googleSearch(`"${formattedPhone}" email`).catch(() => []);
  results.push(...extractAndScoreEmails(googleResults, businessName, 'phone-search', 0.50));

  // Bing search by phone
  const bingResults = await bingSearch(`"${formattedPhone}" email contact`).catch(() => []);
  results.push(...extractAndScoreEmails(bingResults, businessName, 'phone-search', 0.45));

  return results;
}

/**
 * Search directories for email
 */
async function searchDirectoriesForEmail(
  name: string,
  location: string
): Promise<EmailSearchResult[]> {
  const directoryResults = await scrapeAllDirectories(name, location);
  const results: EmailSearchResult[] = [];

  for (const result of directoryResults) {
    if (result.email && isValidEmail(result.email)) {
      results.push({
        email: result.email,
        source: 'directory',
        confidence: 0.75,
      });
    }
  }

  return results;
}

/**
 * Search for email directly via search engines
 * Runs all sources in parallel and returns all results
 */
export async function searchForEmailDirectly(
  name: string,
  location: string,
  phone?: string | null
): Promise<EmailSearchResult[]> {
  const searches: Promise<EmailSearchResult[]>[] = [
    searchGoogleForEmail(name, location),
    searchBingForEmail(name, location),
    searchDuckDuckGoForEmail(name, location),
    searchDirectoriesForEmail(name, location),
  ];

  // Add phone search if phone is available
  if (phone) {
    searches.push(searchByPhone(phone, name));
  }

  // Run all searches in parallel
  const allResults = await Promise.all(searches);
  const flatResults = allResults.flat();

  // Deduplicate and boost confidence for emails found in multiple sources
  const emailCounts = new Map<string, { result: EmailSearchResult; count: number }>();

  for (const result of flatResults) {
    const existing = emailCounts.get(result.email);
    if (existing) {
      existing.count++;
      // Keep higher confidence result
      if (result.confidence > existing.result.confidence) {
        existing.result = result;
      }
    } else {
      emailCounts.set(result.email, { result, count: 1 });
    }
  }

  // Apply multi-source bonus and return sorted by confidence
  const finalResults: EmailSearchResult[] = [];
  for (const [email, { result, count }] of emailCounts) {
    let confidence = result.confidence;
    if (count >= 2) {
      confidence = Math.min(0.90, confidence + 0.05);
    }
    if (count >= 3) {
      confidence = Math.min(0.95, confidence + 0.05);
    }
    finalResults.push({ ...result, confidence });
  }

  // Sort by confidence descending
  finalResults.sort((a, b) => b.confidence - a.confidence);

  return finalResults;
}

/**
 * Get the best email from search results
 */
export function getBestSearchEmail(results: EmailSearchResult[]): EmailSearchResult | null {
  if (results.length === 0) return null;
  return results[0]; // Already sorted by confidence
}

/**
 * Search for emails for multiple businesses in parallel
 */
export async function searchForEmailsBatch(
  businesses: Array<{ name: string; location: string; phone?: string | null }>,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<Map<string, EmailSearchResult | null>> {
  const { concurrency = 2, onProgress } = options; // Low concurrency to avoid rate limits
  const results = new Map<string, EmailSearchResult | null>();
  const queue = [...businesses];
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const business = queue.shift();
      if (!business) break;

      try {
        const searchResults = await searchForEmailDirectly(
          business.name,
          business.location,
          business.phone
        );
        const best = getBestSearchEmail(searchResults);
        results.set(business.name, best);
      } catch {
        results.set(business.name, null);
      }

      completed++;
      onProgress?.(completed, businesses.length);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, businesses.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}
