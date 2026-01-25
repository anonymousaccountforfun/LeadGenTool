/**
 * Data Quality & Deduplication Module
 * Ensures 500 UNIQUE, accurate leads through:
 * - Fuzzy name matching (Jaro-Winkler)
 * - Phone/address/website normalization
 * - Cross-source entity resolution
 * - Data quality validation and scoring
 */

import type { ScrapedBusiness } from './scraper';

// ============ Types ============

export interface QualityMetrics {
  nameQuality: number;
  phoneQuality: number;
  addressQuality: number;
  websiteQuality: number;
  emailQuality: number;
  overallScore: number;
  flags: string[];
  // Multi-source cross-reference scoring
  sourceCount: number;
  sources: string[];
  crossRefScore: number;
}

export interface EnrichedBusiness extends ScrapedBusiness {
  quality: QualityMetrics;
  normalizedName: string;
  normalizedPhone: string | null;
  normalizedAddress: string | null;
  normalizedWebsite: string | null;
  duplicateOf?: string; // ID of business this is a duplicate of
}

// ============ String Similarity (Jaro-Winkler) ============

/**
 * Calculate Jaro similarity between two strings
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

/**
 * Calculate Jaro-Winkler similarity (gives bonus for common prefixes)
 */
export function jaroWinkler(s1: string, s2: string): number {
  const jaro = jaroSimilarity(s1, s2);

  // Find common prefix (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  // Winkler modification: boost for common prefix
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Calculate Levenshtein distance
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Calculate normalized Levenshtein similarity (0-1)
 */
export function levenshteinSimilarity(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(s1, s2) / maxLen;
}

// ============ Name Normalization ============

// Common business suffixes to remove for matching
const BUSINESS_SUFFIXES = [
  'inc', 'incorporated', 'corp', 'corporation', 'llc', 'llp', 'lp', 'ltd',
  'limited', 'co', 'company', 'pllc', 'pc', 'pa', 'dba', 'group', 'holdings',
  'enterprises', 'services', 'solutions', 'associates', 'partners'
];

// Common prefixes to remove
const BUSINESS_PREFIXES = [
  'the', 'a', 'an', 'sponsored', 'ad', 'advertisement', 'featured'
];

// Words that don't help with matching
const STOP_WORDS = [
  'and', '&', 'of', 'at', 'in', 'on', 'for', 'by', 'to', 'from', 'with'
];

/**
 * Normalize a business name for comparison
 */
export function normalizeName(name: string): string {
  if (!name) return '';

  let normalized = name
    .toLowerCase()
    .trim()
    // Remove special characters but keep spaces
    .replace(/[''`]/g, '') // Remove apostrophes
    .replace(/[^\w\s-]/g, ' ') // Replace other special chars with space
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();

  // Remove prefixes
  for (const prefix of BUSINESS_PREFIXES) {
    const regex = new RegExp(`^${prefix}\\s+`, 'i');
    normalized = normalized.replace(regex, '');
  }

  // Remove suffixes
  for (const suffix of BUSINESS_SUFFIXES) {
    const regex = new RegExp(`\\s+${suffix}$`, 'i');
    normalized = normalized.replace(regex, '');
  }

  // Remove trailing punctuation
  normalized = normalized.replace(/[.,;:!?]+$/, '').trim();

  return normalized;
}

/**
 * Extract name tokens for comparison (removes stop words)
 */
export function extractNameTokens(name: string): string[] {
  const normalized = normalizeName(name);
  return normalized
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.includes(word));
}

/**
 * Compare two business names with fuzzy matching
 * Returns similarity score 0-1
 */
export function compareNames(name1: string, name2: string): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return 1;
  if (!n1 || !n2) return 0;

  // Use Jaro-Winkler as primary metric
  const jwScore = jaroWinkler(n1, n2);

  // Also check token-based similarity for names with different word orders
  const tokens1 = extractNameTokens(name1);
  const tokens2 = extractNameTokens(name2);

  if (tokens1.length === 0 || tokens2.length === 0) return jwScore;

  // Count matching tokens (fuzzy)
  let matchingTokens = 0;
  const used = new Set<number>();

  for (const t1 of tokens1) {
    let bestMatch = 0;
    let bestIdx = -1;

    for (let i = 0; i < tokens2.length; i++) {
      if (used.has(i)) continue;
      const sim = jaroWinkler(t1, tokens2[i]);
      if (sim > bestMatch) {
        bestMatch = sim;
        bestIdx = i;
      }
    }

    if (bestMatch >= 0.85 && bestIdx !== -1) {
      matchingTokens++;
      used.add(bestIdx);
    }
  }

  const tokenScore = (2 * matchingTokens) / (tokens1.length + tokens2.length);

  // Return the higher of the two scores
  return Math.max(jwScore, tokenScore);
}

// ============ Phone Normalization ============

/**
 * Normalize a phone number to digits only
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // Extract digits only
  let digits = phone.replace(/\D/g, '');

  // Handle US phone numbers
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.substring(1);
  }

  // Should be 10 digits for US
  if (digits.length !== 10) return null;

  return digits;
}

/**
 * Format a normalized phone for display
 */
export function formatPhone(normalized: string | null): string | null {
  if (!normalized || normalized.length !== 10) return normalized;
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

/**
 * Validate phone number quality
 */
export function validatePhone(phone: string | null | undefined): { valid: boolean; score: number; flags: string[] } {
  const flags: string[] = [];

  if (!phone) {
    return { valid: false, score: 0, flags: ['missing_phone'] };
  }

  const normalized = normalizePhone(phone);
  if (!normalized) {
    flags.push('invalid_format');
    return { valid: false, score: 0.1, flags };
  }

  // Check for fake numbers
  if (normalized.startsWith('555')) {
    flags.push('fake_555_prefix');
    return { valid: false, score: 0.2, flags };
  }

  // Check for obvious test numbers
  const testPatterns = ['0000000000', '1111111111', '1234567890', '9876543210'];
  if (testPatterns.includes(normalized)) {
    flags.push('test_number');
    return { valid: false, score: 0.1, flags };
  }

  // Check for repeated digits
  if (/^(\d)\1{9}$/.test(normalized)) {
    flags.push('repeated_digits');
    return { valid: false, score: 0.1, flags };
  }

  // Valid area code check (basic)
  const areaCode = normalized.substring(0, 3);
  if (areaCode.startsWith('0') || areaCode.startsWith('1')) {
    flags.push('invalid_area_code');
    return { valid: false, score: 0.3, flags };
  }

  return { valid: true, score: 1, flags: [] };
}

// ============ Address Normalization ============

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  'street': 'st', 'st.': 'st',
  'avenue': 'ave', 'ave.': 'ave',
  'boulevard': 'blvd', 'blvd.': 'blvd',
  'drive': 'dr', 'dr.': 'dr',
  'road': 'rd', 'rd.': 'rd',
  'lane': 'ln', 'ln.': 'ln',
  'court': 'ct', 'ct.': 'ct',
  'circle': 'cir', 'cir.': 'cir',
  'place': 'pl', 'pl.': 'pl',
  'highway': 'hwy', 'hwy.': 'hwy',
  'parkway': 'pkwy', 'pkwy.': 'pkwy',
  'terrace': 'ter', 'ter.': 'ter',
  'north': 'n', 'n.': 'n',
  'south': 's', 's.': 's',
  'east': 'e', 'e.': 'e',
  'west': 'w', 'w.': 'w',
  'northeast': 'ne', 'ne.': 'ne',
  'northwest': 'nw', 'nw.': 'nw',
  'southeast': 'se', 'se.': 'se',
  'southwest': 'sw', 'sw.': 'sw',
  'suite': 'ste', 'ste.': 'ste',
  'apartment': 'apt', 'apt.': 'apt',
  'unit': 'unit', '#': 'unit',
  'floor': 'fl', 'fl.': 'fl',
  'building': 'bldg', 'bldg.': 'bldg',
};

const STATE_NAMES: Record<string, string> = {
  'alabama': 'al', 'alaska': 'ak', 'arizona': 'az', 'arkansas': 'ar', 'california': 'ca',
  'colorado': 'co', 'connecticut': 'ct', 'delaware': 'de', 'florida': 'fl', 'georgia': 'ga',
  'hawaii': 'hi', 'idaho': 'id', 'illinois': 'il', 'indiana': 'in', 'iowa': 'ia',
  'kansas': 'ks', 'kentucky': 'ky', 'louisiana': 'la', 'maine': 'me', 'maryland': 'md',
  'massachusetts': 'ma', 'michigan': 'mi', 'minnesota': 'mn', 'mississippi': 'ms', 'missouri': 'mo',
  'montana': 'mt', 'nebraska': 'ne', 'nevada': 'nv', 'new hampshire': 'nh', 'new jersey': 'nj',
  'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd', 'ohio': 'oh',
  'oklahoma': 'ok', 'oregon': 'or', 'pennsylvania': 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
  'south dakota': 'sd', 'tennessee': 'tn', 'texas': 'tx', 'utah': 'ut', 'vermont': 'vt',
  'virginia': 'va', 'washington': 'wa', 'west virginia': 'wv', 'wisconsin': 'wi', 'wyoming': 'wy',
  'district of columbia': 'dc', 'dc': 'dc',
};

/**
 * Normalize an address for comparison
 */
export function normalizeAddress(address: string | null | undefined): string | null {
  if (!address) return null;

  let normalized = address
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

  // Replace abbreviations
  for (const [full, abbr] of Object.entries(ADDRESS_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    normalized = normalized.replace(regex, abbr);
  }

  // Replace state names with abbreviations
  for (const [name, abbr] of Object.entries(STATE_NAMES)) {
    const regex = new RegExp(`\\b${name}\\b`, 'gi');
    normalized = normalized.replace(regex, abbr);
  }

  // Remove extra punctuation
  normalized = normalized
    .replace(/[.,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Extract address components
 */
export function parseAddress(address: string | null | undefined): {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  if (!address) {
    return { street: null, city: null, state: null, zip: null };
  }

  // Try to match common US address patterns
  const zipMatch = address.match(/\b(\d{5})(-\d{4})?\b/);
  const zip = zipMatch ? zipMatch[1] : null;

  // Try to find state (2 letter code)
  const stateMatch = address.match(/\b([A-Z]{2})\b(?=\s*\d{5}|\s*$)/i);
  const state = stateMatch ? stateMatch[1].toLowerCase() : null;

  // Everything before the city/state/zip is likely the street
  const parts = address.split(',').map((p) => p.trim());
  const street = parts[0] || null;
  const city = parts.length > 1 ? parts[1].replace(/\s*[A-Z]{2}\s*\d{5}.*$/i, '').trim() : null;

  return { street, city, state, zip };
}

/**
 * Compare two addresses
 */
export function compareAddresses(addr1: string | null, addr2: string | null): number {
  if (!addr1 || !addr2) return 0;

  const n1 = normalizeAddress(addr1);
  const n2 = normalizeAddress(addr2);

  if (!n1 || !n2) return 0;
  if (n1 === n2) return 1;

  // Parse and compare components
  const p1 = parseAddress(addr1);
  const p2 = parseAddress(addr2);

  let score = 0;
  let components = 0;

  // Zip code is most important
  if (p1.zip && p2.zip) {
    score += p1.zip === p2.zip ? 0.3 : 0;
    components++;
  }

  // State
  if (p1.state && p2.state) {
    score += p1.state === p2.state ? 0.2 : 0;
    components++;
  }

  // City (fuzzy)
  if (p1.city && p2.city) {
    const citySim = jaroWinkler(p1.city.toLowerCase(), p2.city.toLowerCase());
    score += citySim >= 0.85 ? 0.2 : 0;
    components++;
  }

  // Street (fuzzy)
  if (p1.street && p2.street) {
    const streetSim = jaroWinkler(
      normalizeAddress(p1.street) || '',
      normalizeAddress(p2.street) || ''
    );
    score += streetSim >= 0.8 ? 0.3 : streetSim >= 0.6 ? 0.15 : 0;
    components++;
  }

  // Fallback to overall string similarity if no components matched
  if (components === 0) {
    return jaroWinkler(n1, n2);
  }

  return score;
}

// ============ Website Normalization ============

/**
 * Normalize a website URL for comparison
 */
export function normalizeWebsite(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    let normalized = url.toLowerCase().trim();

    // Add protocol if missing
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }

    const parsed = new URL(normalized);

    // Get hostname without www
    let hostname = parsed.hostname.replace(/^www\./, '');

    // Remove trailing slashes from path
    let path = parsed.pathname.replace(/\/+$/, '');
    if (path === '/') path = '';

    return hostname + path;
  } catch {
    // Try basic normalization if URL parsing fails
    return url
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '')
      .trim();
  }
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    let normalized = url.toLowerCase().trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    return new URL(normalized).hostname.replace(/^www\./, '');
  } catch {
    // Fallback regex extraction
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/i);
    return match ? match[1].toLowerCase() : null;
  }
}

/**
 * Validate website quality
 */
export function validateWebsite(url: string | null | undefined): { valid: boolean; score: number; flags: string[] } {
  const flags: string[] = [];

  if (!url) {
    return { valid: false, score: 0, flags: ['missing_website'] };
  }

  const domain = extractDomain(url);
  if (!domain) {
    flags.push('invalid_url');
    return { valid: false, score: 0.1, flags };
  }

  // Check for parked domain indicators
  const parkedIndicators = ['parked', 'forsale', 'godaddy.com/domainfind', 'sedoparking', 'hugedomains'];
  if (parkedIndicators.some((ind) => url.toLowerCase().includes(ind))) {
    flags.push('parked_domain');
    return { valid: false, score: 0.3, flags };
  }

  // Check for generic/placeholder domains
  if (domain.includes('example.com') || domain.includes('test.com') || domain.includes('localhost')) {
    flags.push('placeholder_domain');
    return { valid: false, score: 0.1, flags };
  }

  // Social media profiles are valid but less valuable than owned domains
  const socialDomains = ['facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com', 'tiktok.com'];
  if (socialDomains.some((social) => domain.includes(social))) {
    flags.push('social_media_profile');
    return { valid: true, score: 0.7, flags };
  }

  return { valid: true, score: 1, flags: [] };
}

// ============ Email Validation ============

/**
 * Validate email quality
 */
export function validateEmail(email: string | null | undefined): { valid: boolean; score: number; flags: string[] } {
  const flags: string[] = [];

  if (!email) {
    return { valid: false, score: 0, flags: ['missing_email'] };
  }

  // Basic format check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    flags.push('invalid_format');
    return { valid: false, score: 0.1, flags };
  }

  const [localPart, domain] = email.toLowerCase().split('@');

  // Check for generic/role-based emails (less valuable for leads)
  const genericPrefixes = ['info', 'contact', 'hello', 'support', 'sales', 'admin', 'office', 'team', 'help'];
  if (genericPrefixes.includes(localPart)) {
    flags.push('generic_email');
    return { valid: true, score: 0.7, flags };
  }

  // Check for personal email domains (less valuable for B2B)
  const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];
  if (personalDomains.includes(domain)) {
    flags.push('personal_email_domain');
    return { valid: true, score: 0.8, flags };
  }

  // Check for no-reply emails
  if (localPart.includes('noreply') || localPart.includes('no-reply') || localPart.includes('donotreply')) {
    flags.push('noreply_email');
    return { valid: false, score: 0.2, flags };
  }

  return { valid: true, score: 1, flags: [] };
}

// ============ Business Deduplication ============

export interface DeduplicationResult {
  unique: EnrichedBusiness[];
  duplicates: { business: EnrichedBusiness; duplicateOf: EnrichedBusiness; similarity: number }[];
  stats: {
    total: number;
    unique: number;
    duplicates: number;
    bySource: Record<string, number>;
  };
}

/**
 * Calculate similarity between two businesses
 */
export function calculateBusinessSimilarity(
  b1: ScrapedBusiness,
  b2: ScrapedBusiness
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let totalWeight = 0;
  let weightedScore = 0;

  // Name similarity (weight: 40)
  const nameSim = compareNames(b1.name, b2.name);
  if (nameSim >= 0.9) {
    reasons.push(`name_exact: ${nameSim.toFixed(2)}`);
    weightedScore += 40 * nameSim;
  } else if (nameSim >= 0.8) {
    reasons.push(`name_similar: ${nameSim.toFixed(2)}`);
    weightedScore += 40 * nameSim;
  }
  totalWeight += 40;

  // Phone match (weight: 25)
  const phone1 = normalizePhone(b1.phone);
  const phone2 = normalizePhone(b2.phone);
  if (phone1 && phone2) {
    if (phone1 === phone2) {
      reasons.push('phone_match');
      weightedScore += 25;
    }
    totalWeight += 25;
  }

  // Website/domain match (weight: 25)
  const domain1 = extractDomain(b1.website);
  const domain2 = extractDomain(b2.website);
  if (domain1 && domain2) {
    if (domain1 === domain2) {
      reasons.push('domain_match');
      weightedScore += 25;
    }
    totalWeight += 25;
  }

  // Address match (weight: 10)
  if (b1.address && b2.address) {
    const addrSim = compareAddresses(b1.address, b2.address);
    if (addrSim >= 0.8) {
      reasons.push(`address_match: ${addrSim.toFixed(2)}`);
      weightedScore += 10 * addrSim;
    }
    totalWeight += 10;
  }

  // Normalize score
  const score = totalWeight > 0 ? weightedScore / totalWeight : 0;

  return { score, reasons };
}

/**
 * Enrich a business with quality metrics and normalization
 */
export function enrichBusiness(business: ScrapedBusiness): EnrichedBusiness {
  const flags: string[] = [];

  // Normalize fields
  const normalizedName = normalizeName(business.name);
  const normalizedPhone = normalizePhone(business.phone);
  const normalizedAddress = normalizeAddress(business.address);
  const normalizedWebsite = normalizeWebsite(business.website);

  // Validate each field
  const phoneValidation = validatePhone(business.phone);
  const websiteValidation = validateWebsite(business.website);
  const emailValidation = validateEmail(business.email);

  flags.push(...phoneValidation.flags);
  flags.push(...websiteValidation.flags);
  flags.push(...emailValidation.flags);

  // Calculate name quality
  let nameQuality = 1;
  if (!business.name || business.name.length < 3) {
    nameQuality = 0;
    flags.push('invalid_name');
  } else if (business.name.length < 5) {
    nameQuality = 0.7;
    flags.push('short_name');
  }

  // Calculate address quality
  let addressQuality = 0;
  if (business.address) {
    const parsed = parseAddress(business.address);
    if (parsed.zip) addressQuality += 0.4;
    if (parsed.state) addressQuality += 0.2;
    if (parsed.city) addressQuality += 0.2;
    if (parsed.street) addressQuality += 0.2;
  } else {
    flags.push('missing_address');
  }

  // Calculate overall score (weighted average)
  const weights = { name: 0.15, phone: 0.25, address: 0.15, website: 0.25, email: 0.2 };
  const overallScore =
    nameQuality * weights.name +
    phoneValidation.score * weights.phone +
    addressQuality * weights.address +
    websiteValidation.score * weights.website +
    emailValidation.score * weights.email;

  return {
    ...business,
    quality: {
      nameQuality,
      phoneQuality: phoneValidation.score,
      addressQuality,
      websiteQuality: websiteValidation.score,
      emailQuality: emailValidation.score,
      overallScore,
      flags,
      // Initialize cross-reference tracking
      sourceCount: 1,
      sources: [business.source],
      crossRefScore: 0, // Will be calculated after merging duplicates
    },
    normalizedName,
    normalizedPhone,
    normalizedAddress,
    normalizedWebsite,
  };
}

/**
 * Deduplicate businesses using fuzzy matching
 * Returns unique businesses sorted by quality
 */
export function deduplicateBusinesses(
  businesses: ScrapedBusiness[],
  similarityThreshold: number = 0.75
): DeduplicationResult {
  const enriched = businesses.map(enrichBusiness);
  const unique: EnrichedBusiness[] = [];
  const duplicates: { business: EnrichedBusiness; duplicateOf: EnrichedBusiness; similarity: number }[] = [];
  const bySource: Record<string, number> = {};

  // Group by normalized phone or domain for faster matching
  const phoneIndex = new Map<string, EnrichedBusiness>();
  const domainIndex = new Map<string, EnrichedBusiness>();

  for (const business of enriched) {
    bySource[business.source] = (bySource[business.source] || 0) + 1;

    let isDuplicate = false;
    let duplicateOf: EnrichedBusiness | null = null;
    let highestSimilarity = 0;

    // Quick check: exact phone match
    if (business.normalizedPhone) {
      const existing = phoneIndex.get(business.normalizedPhone);
      if (existing) {
        isDuplicate = true;
        duplicateOf = existing;
        highestSimilarity = 0.95;
      }
    }

    // Quick check: exact domain match
    if (!isDuplicate && business.normalizedWebsite) {
      const domain = extractDomain(business.website);
      if (domain) {
        const existing = domainIndex.get(domain);
        if (existing) {
          isDuplicate = true;
          duplicateOf = existing;
          highestSimilarity = 0.9;
        }
      }
    }

    // Full similarity check against existing unique businesses
    if (!isDuplicate) {
      for (const existing of unique) {
        const { score } = calculateBusinessSimilarity(business, existing);
        if (score >= similarityThreshold && score > highestSimilarity) {
          isDuplicate = true;
          duplicateOf = existing;
          highestSimilarity = score;
        }
      }
    }

    if (isDuplicate && duplicateOf) {
      // Merge the businesses to combine data from both sources
      const idx = unique.indexOf(duplicateOf);
      if (idx !== -1) {
        // Determine which is primary based on quality
        const primary = business.quality.overallScore > duplicateOf.quality.overallScore
          ? business
          : duplicateOf;
        const secondary = primary === business ? duplicateOf : business;

        // Merge data from both, keeping best of each field
        const merged = mergeDuplicates(primary, secondary);

        // Recalculate overall score with cross-reference boost
        merged.quality.overallScore = recalculateOverallScore(merged.quality);

        // Replace in unique list
        unique[idx] = merged;
        duplicates.push({ business: secondary, duplicateOf: merged, similarity: highestSimilarity });

        // Update indices to point to merged record
        if (merged.normalizedPhone) {
          phoneIndex.set(merged.normalizedPhone, merged);
        }
        const domain = extractDomain(merged.website);
        if (domain) {
          domainIndex.set(domain, merged);
        }
      }
    } else {
      unique.push(business);

      // Add to indices
      if (business.normalizedPhone) {
        phoneIndex.set(business.normalizedPhone, business);
      }
      const domain = extractDomain(business.website);
      if (domain) {
        domainIndex.set(domain, business);
      }
    }
  }

  // Sort by quality score (best first)
  unique.sort((a, b) => b.quality.overallScore - a.quality.overallScore);

  return {
    unique,
    duplicates,
    stats: {
      total: businesses.length,
      unique: unique.length,
      duplicates: duplicates.length,
      bySource,
    },
  };
}

/**
 * Merge data from duplicate businesses to create the best record
 * Tracks sources for cross-reference scoring
 */
export function mergeDuplicates(primary: EnrichedBusiness, duplicate: EnrichedBusiness): EnrichedBusiness {
  // Merge source lists (deduplicated)
  const mergedSources = [...new Set([...primary.quality.sources, ...duplicate.quality.sources])];
  const sourceCount = mergedSources.length;

  // Calculate cross-reference score based on number of confirming sources
  // More sources = higher confidence boost
  const crossRefScore = calculateCrossRefScore(sourceCount, mergedSources);

  return {
    ...primary,
    // Use the better value for each field
    phone: primary.phone || duplicate.phone,
    address: primary.address || duplicate.address,
    website: primary.website || duplicate.website,
    email: primary.email || duplicate.email,
    rating: primary.rating ?? duplicate.rating,
    review_count: primary.review_count ?? duplicate.review_count,
    years_in_business: primary.years_in_business ?? duplicate.years_in_business,
    // Keep primary's quality metrics but update cross-reference tracking
    quality: {
      ...primary.quality,
      flags: [...primary.quality.flags, `merged_from_${duplicate.source}`],
      sourceCount,
      sources: mergedSources,
      crossRefScore,
    },
  };
}

/**
 * Recalculate overall quality score including cross-reference boost
 */
export function recalculateOverallScore(quality: QualityMetrics): number {
  // Base score from individual field qualities
  const weights = { name: 0.15, phone: 0.25, address: 0.15, website: 0.25, email: 0.2 };
  const baseScore =
    quality.nameQuality * weights.name +
    quality.phoneQuality * weights.phone +
    quality.addressQuality * weights.address +
    quality.websiteQuality * weights.website +
    quality.emailQuality * weights.email;

  // Apply cross-reference boost (additive, capped at 1.0)
  const boostedScore = Math.min(baseScore + quality.crossRefScore, 1.0);

  return boostedScore;
}

/**
 * Calculate cross-reference score based on source diversity
 * Returns a 0-1 score that can boost overall confidence
 */
export function calculateCrossRefScore(sourceCount: number, sources: string[]): number {
  // Base score from number of sources
  // 1 source = 0, 2 sources = 0.15, 3+ sources = 0.25, 4+ sources = 0.35
  let score = 0;
  if (sourceCount >= 4) score = 0.35;
  else if (sourceCount >= 3) score = 0.25;
  else if (sourceCount >= 2) score = 0.15;

  // Bonus for high-quality source combinations
  const hasGoogleMaps = sources.some(s => s.toLowerCase().includes('google') || s.toLowerCase().includes('maps'));
  const hasYelp = sources.some(s => s.toLowerCase().includes('yelp'));
  const hasBBB = sources.some(s => s.toLowerCase().includes('bbb') || s.toLowerCase().includes('better_business'));
  const hasYellowPages = sources.some(s => s.toLowerCase().includes('yellow') || s.toLowerCase().includes('yp'));

  // Premium sources combo bonus
  const premiumSourceCount = [hasGoogleMaps, hasYelp, hasBBB, hasYellowPages].filter(Boolean).length;
  if (premiumSourceCount >= 3) score += 0.1;
  else if (premiumSourceCount >= 2) score += 0.05;

  // Cap at 0.5 (50% boost max)
  return Math.min(score, 0.5);
}

/**
 * Sort businesses by quality and completeness
 */
export function sortByQuality(businesses: EnrichedBusiness[]): EnrichedBusiness[] {
  return [...businesses].sort((a, b) => {
    // Primary: overall quality score
    if (b.quality.overallScore !== a.quality.overallScore) {
      return b.quality.overallScore - a.quality.overallScore;
    }

    // Secondary: number of non-null fields
    const fieldsA = [a.phone, a.address, a.website, a.email, a.rating].filter(Boolean).length;
    const fieldsB = [b.phone, b.address, b.website, b.email, b.rating].filter(Boolean).length;
    if (fieldsB !== fieldsA) {
      return fieldsB - fieldsA;
    }

    // Tertiary: fewer quality flags is better
    return a.quality.flags.length - b.quality.flags.length;
  });
}

// ============ Batch Processing ============

/**
 * Process a batch of businesses with deduplication and quality scoring
 */
export function processBusinessBatch(
  businesses: ScrapedBusiness[],
  options: {
    similarityThreshold?: number;
    minQualityScore?: number;
    maxResults?: number;
  } = {}
): {
  results: EnrichedBusiness[];
  stats: DeduplicationResult['stats'];
  filtered: number;
} {
  const {
    similarityThreshold = 0.75,
    minQualityScore = 0.2,
    maxResults = 500,
  } = options;

  // Deduplicate
  const deduped = deduplicateBusinesses(businesses, similarityThreshold);

  // Filter by quality
  const qualityFiltered = deduped.unique.filter(
    (b) => b.quality.overallScore >= minQualityScore
  );

  // Sort by quality and limit
  const sorted = sortByQuality(qualityFiltered);
  const limited = sorted.slice(0, maxResults);

  return {
    results: limited,
    stats: deduped.stats,
    filtered: deduped.unique.length - qualityFiltered.length,
  };
}
