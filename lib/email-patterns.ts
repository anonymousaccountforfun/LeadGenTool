/**
 * Email Pattern Learning and Catch-All Detection
 *
 * Enhanced to support:
 * - Database persistence for learned patterns
 * - Industry-based pattern sharing
 * - Company-type pattern preferences
 * - Confidence boosting for pattern matches
 */

import * as dns from 'dns';
import * as net from 'net';
import { getDomainPattern, learnEmailPattern } from './feedback-aggregator';

// Cache for catch-all detection results
const catchAllCache = new Map<string, { isCatchAll: boolean; timestamp: number }>();
const CATCH_ALL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Cache for learned email patterns (in-memory fallback)
const patternCache = new Map<string, { pattern: string; examples: string[]; timestamp: number; confidence: number }>();
const PATTERN_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

// Industry-based pattern preferences (based on research)
export const INDUSTRY_PATTERN_PREFERENCES: Record<string, EmailPattern[]> = {
  // Professional services prefer formal patterns
  'law': ['first.last', 'firstl', 'f.last'],
  'accounting': ['first.last', 'firstl', 'f.last'],
  'consulting': ['first.last', 'flast', 'firstlast'],
  'finance': ['first.last', 'flast', 'f.last'],

  // Tech companies often use shorter patterns
  'technology': ['first', 'flast', 'first.last'],
  'software': ['first', 'flast', 'firstlast'],
  'startup': ['first', 'firstlast', 'flast'],

  // Healthcare uses formal patterns
  'healthcare': ['first.last', 'flast', 'firstl'],
  'medical': ['first.last', 'flast', 'f.last'],
  'dental': ['first.last', 'first', 'flast'],

  // Trades and services
  'construction': ['first', 'firstlast', 'first.last'],
  'plumbing': ['first', 'firstlast', 'info'],
  'electrical': ['first', 'firstlast', 'info'],

  // Retail and hospitality
  'restaurant': ['info', 'contact', 'first'],
  'retail': ['info', 'first', 'first.last'],
  'hotel': ['first.last', 'flast', 'first'],

  // Default pattern preferences
  'default': ['first.last', 'flast', 'firstlast', 'first'],
};

// Company size pattern tendencies
export const SIZE_PATTERN_PREFERENCES: Record<string, EmailPattern[]> = {
  'enterprise': ['first.last', 'flast', 'f.last'],  // 500+ employees
  'medium': ['first.last', 'flast', 'firstlast'],   // 50-500 employees
  'small': ['first', 'firstlast', 'first.last'],    // 10-50 employees
  'micro': ['first', 'info', 'contact'],             // 1-10 employees
};

/**
 * Email pattern types commonly used by businesses
 */
export type EmailPattern =
  | 'first.last' // john.smith@
  | 'firstlast' // johnsmith@
  | 'first_last' // john_smith@
  | 'flast' // jsmith@
  | 'firstl' // johns@
  | 'f.last' // j.smith@
  | 'first' // john@
  | 'last' // smith@
  | 'lastfirst' // smithjohn@
  | 'last.first' // smith.john@
  | 'lastf' // smithj@
  | 'fl' // js@
  | 'info' // info@
  | 'contact' // contact@
  | 'unknown';

/**
 * Detect the email pattern from a known email and name
 */
export function detectPattern(
  email: string,
  firstName: string,
  lastName: string
): EmailPattern {
  const localPart = email.split('@')[0].toLowerCase();
  const f = firstName.toLowerCase();
  const l = lastName.toLowerCase();

  if (localPart === `${f}.${l}`) return 'first.last';
  if (localPart === `${f}${l}`) return 'firstlast';
  if (localPart === `${f}_${l}`) return 'first_last';
  if (localPart === `${f[0]}${l}`) return 'flast';
  if (localPart === `${f}${l[0]}`) return 'firstl';
  if (localPart === `${f[0]}.${l}`) return 'f.last';
  if (localPart === f) return 'first';
  if (localPart === l) return 'last';
  if (localPart === `${l}${f}`) return 'lastfirst';
  if (localPart === `${l}.${f}`) return 'last.first';
  if (localPart === `${l}${f[0]}`) return 'lastf';
  if (localPart === `${f[0]}${l[0]}`) return 'fl';

  return 'unknown';
}

/**
 * Learn email pattern for a domain from discovered emails
 */
export function learnPattern(
  domain: string,
  emails: Array<{ email: string; firstName?: string; lastName?: string }>
): EmailPattern {
  const cacheKey = domain.toLowerCase();
  const cached = patternCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < PATTERN_CACHE_TTL) {
    return cached.pattern as EmailPattern;
  }

  const patternCounts: Record<EmailPattern, number> = {
    'first.last': 0,
    firstlast: 0,
    first_last: 0,
    flast: 0,
    firstl: 0,
    'f.last': 0,
    first: 0,
    last: 0,
    lastfirst: 0,
    'last.first': 0,
    lastf: 0,
    fl: 0,
    info: 0,
    contact: 0,
    unknown: 0,
  };

  for (const { email, firstName, lastName } of emails) {
    if (firstName && lastName) {
      const pattern = detectPattern(email, firstName, lastName);
      patternCounts[pattern]++;
    }
  }

  // Find most common pattern (excluding unknown)
  let bestPattern: EmailPattern = 'first.last'; // Default
  let bestCount = 0;

  for (const [pattern, count] of Object.entries(patternCounts)) {
    if (pattern !== 'unknown' && count > bestCount) {
      bestPattern = pattern as EmailPattern;
      bestCount = count;
    }
  }

  // Cache the result
  patternCache.set(cacheKey, {
    pattern: bestPattern,
    examples: emails.map((e) => e.email),
    timestamp: Date.now(),
    confidence: bestCount > 0 ? bestCount / emails.length : 0,
  });

  return bestPattern;
}

/**
 * Generate email based on learned pattern
 */
export function generateFromPattern(
  pattern: EmailPattern,
  firstName: string,
  lastName: string,
  domain: string
): string {
  const f = firstName.toLowerCase().trim();
  const l = lastName.toLowerCase().trim();

  switch (pattern) {
    case 'first.last':
      return `${f}.${l}@${domain}`;
    case 'firstlast':
      return `${f}${l}@${domain}`;
    case 'first_last':
      return `${f}_${l}@${domain}`;
    case 'flast':
      return `${f[0]}${l}@${domain}`;
    case 'firstl':
      return `${f}${l[0]}@${domain}`;
    case 'f.last':
      return `${f[0]}.${l}@${domain}`;
    case 'first':
      return `${f}@${domain}`;
    case 'last':
      return `${l}@${domain}`;
    case 'lastfirst':
      return `${l}${f}@${domain}`;
    case 'last.first':
      return `${l}.${f}@${domain}`;
    case 'lastf':
      return `${l}${f[0]}@${domain}`;
    case 'fl':
      return `${f[0]}${l[0]}@${domain}`;
    default:
      return `${f}.${l}@${domain}`;
  }
}

/**
 * Get all likely email variations for a name at a domain
 * Uses learned pattern if available, otherwise returns all common patterns
 */
export function getEmailVariations(
  firstName: string,
  lastName: string,
  domain: string
): string[] {
  const cacheKey = domain.toLowerCase();
  const cached = patternCache.get(cacheKey);

  // If we have a learned pattern, prioritize it
  if (cached && Date.now() - cached.timestamp < PATTERN_CACHE_TTL) {
    const primaryEmail = generateFromPattern(cached.pattern as EmailPattern, firstName, lastName, domain);
    const allPatterns: EmailPattern[] = [
      'first.last',
      'firstlast',
      'flast',
      'f.last',
      'first',
      'firstl',
    ];

    // Put primary pattern first, then others
    const emails = [primaryEmail];
    for (const pattern of allPatterns) {
      if (pattern !== cached.pattern) {
        emails.push(generateFromPattern(pattern, firstName, lastName, domain));
      }
    }
    return [...new Set(emails)]; // Remove duplicates
  }

  // Default: return common patterns in order of likelihood
  const f = firstName.toLowerCase().trim();
  const l = lastName.toLowerCase().trim();

  return [
    `${f}.${l}@${domain}`,
    `${f}${l}@${domain}`,
    `${f[0]}${l}@${domain}`,
    `${f}@${domain}`,
    `${f[0]}.${l}@${domain}`,
    `${f}${l[0]}@${domain}`,
    `${l}.${f}@${domain}`,
    `${l}${f}@${domain}`,
  ];
}

/**
 * Detect if a domain is a catch-all (accepts any email)
 * This is important for reducing false positives in email guessing
 */
export async function detectCatchAll(domain: string): Promise<boolean> {
  const cacheKey = domain.toLowerCase();
  const cached = catchAllCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CATCH_ALL_CACHE_TTL) {
    return cached.isCatchAll;
  }

  try {
    // First, get MX records
    const mxRecords = await new Promise<string[]>((resolve) => {
      dns.resolveMx(domain, (err, addresses) => {
        if (err || !addresses || addresses.length === 0) {
          resolve([]);
        } else {
          const sorted = addresses.sort((a, b) => a.priority - b.priority);
          resolve(sorted.map((mx) => mx.exchange));
        }
      });
    });

    if (mxRecords.length === 0) {
      catchAllCache.set(cacheKey, { isCatchAll: false, timestamp: Date.now() });
      return false;
    }

    // Generate a random email that definitely doesn't exist
    const randomLocal = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const testEmail = `${randomLocal}@${domain}`;

    // Try SMTP verification on the random email
    const result = await smtpCheck(testEmail, mxRecords[0]);

    // If the random email is accepted, it's a catch-all domain
    const isCatchAll = result === 'accepted';

    catchAllCache.set(cacheKey, { isCatchAll, timestamp: Date.now() });
    return isCatchAll;
  } catch {
    // On error, assume not catch-all
    return false;
  }
}

/**
 * Basic SMTP check for catch-all detection
 */
async function smtpCheck(
  email: string,
  mxHost: string
): Promise<'accepted' | 'rejected' | 'timeout'> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve('timeout');
    }, 5000);

    const socket = net.createConnection(25, mxHost);
    let step = 0;
    let response = '';

    socket.on('data', (data) => {
      response += data.toString();

      if (!response.includes('\r\n')) return;

      const code = parseInt(response.substring(0, 3));

      if (step === 0 && code === 220) {
        step = 1;
        response = '';
        socket.write('HELO verify.local\r\n');
      } else if (step === 1 && code === 250) {
        step = 2;
        response = '';
        socket.write('MAIL FROM:<verify@verify.local>\r\n');
      } else if (step === 2 && code === 250) {
        step = 3;
        response = '';
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (step === 3) {
        clearTimeout(timeout);
        socket.write('QUIT\r\n');
        socket.end();

        if (code === 250 || code === 251) {
          resolve('accepted');
        } else {
          resolve('rejected');
        }
      } else {
        clearTimeout(timeout);
        socket.destroy();
        resolve('timeout');
      }
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve('timeout');
    });

    socket.on('timeout', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve('timeout');
    });

    socket.setTimeout(5000);
  });
}

/**
 * Adjust confidence based on catch-all status
 */
export function adjustConfidenceForCatchAll(
  confidence: number,
  isCatchAll: boolean,
  isGuessed: boolean
): number {
  if (isCatchAll && isGuessed) {
    // Catch-all domains accept any email, so guessed emails have lower confidence
    return Math.min(confidence, 0.65);
  }
  return confidence;
}

/**
 * Get confidence boost for pattern-matched emails
 */
export function getPatternMatchBoost(domain: string): number {
  const cacheKey = domain.toLowerCase();
  const cached = patternCache.get(cacheKey);

  if (cached && cached.examples.length >= 2) {
    // If we've seen multiple emails with the same pattern, boost confidence
    return 0.10; // 10% boost
  }
  return 0;
}

// ============ Database-Backed Pattern Storage ============

export interface StoredPattern {
  domain: string;
  pattern: EmailPattern;
  confirmedEmails: string[];
  confirmedCount: number;
  lastConfirmed: Date;
  confidence: number;
  industry?: string;
  companySize?: 'micro' | 'small' | 'medium' | 'enterprise';
}

/**
 * Record a confirmed email pattern to the database
 * Updates both in-memory cache and persistent storage
 */
export async function recordConfirmedPattern(
  email: string,
  firstName: string,
  lastName: string,
  domain?: string,
  industry?: string,
  companySize?: 'micro' | 'small' | 'medium' | 'enterprise'
): Promise<{ pattern: EmailPattern; confidence: number }> {
  const emailDomain = domain || email.split('@')[1]?.toLowerCase();
  if (!emailDomain) {
    return { pattern: 'unknown', confidence: 0 };
  }

  const pattern = detectPattern(email, firstName, lastName);

  // Update in-memory cache
  const cacheKey = emailDomain.toLowerCase();
  const cached = patternCache.get(cacheKey);

  if (cached) {
    if (!cached.examples.includes(email)) {
      cached.examples.push(email);
    }
    // Increase confidence based on confirmations
    cached.confidence = Math.min(1, cached.confidence + 0.1);
    patternCache.set(cacheKey, cached);
  } else {
    patternCache.set(cacheKey, {
      pattern,
      examples: [email],
      timestamp: Date.now(),
      confidence: 0.7,
    });
  }

  // Persist to database via feedback-aggregator
  try {
    await learnEmailPattern(emailDomain, email);
  } catch {
    // Silently fail database storage - cache is still updated
  }

  return {
    pattern,
    confidence: cached?.confidence || 0.7,
  };
}

/**
 * Get the learned pattern for a domain, checking database first
 */
export async function getLearnedPattern(domain: string): Promise<{
  pattern: EmailPattern | null;
  confidence: number;
  examples: string[];
}> {
  const cacheKey = domain.toLowerCase();

  // Check in-memory cache first
  const cached = patternCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PATTERN_CACHE_TTL) {
    return {
      pattern: cached.pattern as EmailPattern,
      confidence: cached.confidence,
      examples: cached.examples,
    };
  }

  // Check database
  try {
    const dbPattern = await getDomainPattern(cacheKey);
    if (dbPattern) {
      // Update cache with database result
      patternCache.set(cacheKey, {
        pattern: dbPattern.email_pattern,
        examples: [],
        timestamp: Date.now(),
        confidence: dbPattern.pattern_confidence,
      });

      return {
        pattern: mapDbPatternToType(dbPattern.email_pattern),
        confidence: dbPattern.pattern_confidence,
        examples: [],
      };
    }
  } catch {
    // Database unavailable, use cache only
  }

  return {
    pattern: null,
    confidence: 0,
    examples: [],
  };
}

/**
 * Map database pattern string to EmailPattern type
 */
function mapDbPatternToType(dbPattern: string): EmailPattern {
  const mapping: Record<string, EmailPattern> = {
    '{first}.{last}': 'first.last',
    '{first}{last}': 'firstlast',
    '{first}_{last}': 'first_last',
    '{f}{last}': 'flast',
    '{first}{l}': 'firstl',
    '{f}.{last}': 'f.last',
    '{first}': 'first',
    '{last}': 'last',
    '{last}{first}': 'lastfirst',
    '{last}.{first}': 'last.first',
    '{last}{f}': 'lastf',
    '{f}{l}': 'fl',
    'info': 'unknown',
    'contact': 'unknown',
  };

  return mapping[dbPattern] || 'unknown';
}

// ============ Industry-Based Pattern Suggestions ============

/**
 * Get suggested email patterns based on industry
 */
export function getIndustryPatterns(industry: string): EmailPattern[] {
  const normalizedIndustry = industry.toLowerCase();

  // Direct match
  if (INDUSTRY_PATTERN_PREFERENCES[normalizedIndustry]) {
    return INDUSTRY_PATTERN_PREFERENCES[normalizedIndustry];
  }

  // Partial match
  for (const [key, patterns] of Object.entries(INDUSTRY_PATTERN_PREFERENCES)) {
    if (normalizedIndustry.includes(key) || key.includes(normalizedIndustry)) {
      return patterns;
    }
  }

  return INDUSTRY_PATTERN_PREFERENCES['default'];
}

/**
 * Get suggested email patterns based on company size
 */
export function getSizePatterns(employeeCount: number): EmailPattern[] {
  if (employeeCount >= 500) {
    return SIZE_PATTERN_PREFERENCES['enterprise'];
  } else if (employeeCount >= 50) {
    return SIZE_PATTERN_PREFERENCES['medium'];
  } else if (employeeCount >= 10) {
    return SIZE_PATTERN_PREFERENCES['small'];
  } else {
    return SIZE_PATTERN_PREFERENCES['micro'];
  }
}

/**
 * Get prioritized email variations considering industry and size
 */
export async function getSmartEmailVariations(
  firstName: string,
  lastName: string,
  domain: string,
  options?: {
    industry?: string;
    employeeCount?: number;
  }
): Promise<Array<{ email: string; pattern: EmailPattern; confidence: number }>> {
  const results: Array<{ email: string; pattern: EmailPattern; confidence: number }> = [];

  // First, check for learned pattern from this specific domain
  const learned = await getLearnedPattern(domain);
  if (learned.pattern) {
    results.push({
      email: generateFromPattern(learned.pattern, firstName, lastName, domain),
      pattern: learned.pattern,
      confidence: learned.confidence,
    });
  }

  // Get industry-based patterns
  const industryPatterns = options?.industry
    ? getIndustryPatterns(options.industry)
    : INDUSTRY_PATTERN_PREFERENCES['default'];

  // Get size-based patterns
  const sizePatterns = options?.employeeCount
    ? getSizePatterns(options.employeeCount)
    : SIZE_PATTERN_PREFERENCES['small'];

  // Combine and prioritize patterns
  const patternScores = new Map<EmailPattern, number>();

  // Weight learned pattern highest
  if (learned.pattern) {
    patternScores.set(learned.pattern, 10);
  }

  // Industry patterns get high weight
  industryPatterns.forEach((pattern, index) => {
    const current = patternScores.get(pattern) || 0;
    patternScores.set(pattern, current + (5 - index));
  });

  // Size patterns get medium weight
  sizePatterns.forEach((pattern, index) => {
    const current = patternScores.get(pattern) || 0;
    patternScores.set(pattern, current + (3 - index * 0.5));
  });

  // Sort by score and generate emails
  const sortedPatterns = Array.from(patternScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([pattern]) => pattern);

  // Add remaining common patterns
  const allPatterns: EmailPattern[] = [
    'first.last', 'firstlast', 'flast', 'first', 'f.last', 'firstl',
    'last.first', 'lastfirst', 'lastf', 'first_last', 'fl', 'last'
  ];

  for (const pattern of allPatterns) {
    if (!sortedPatterns.includes(pattern)) {
      sortedPatterns.push(pattern);
    }
  }

  // Generate emails with confidence scores
  const seenEmails = new Set<string>();

  for (let i = 0; i < sortedPatterns.length; i++) {
    const pattern = sortedPatterns[i];
    const email = generateFromPattern(pattern, firstName, lastName, domain);

    if (!seenEmails.has(email)) {
      seenEmails.add(email);

      // Calculate confidence based on position and learned data
      let confidence = Math.max(0.1, 0.8 - (i * 0.1));

      // Boost if it matches learned pattern
      if (learned.pattern === pattern) {
        confidence = Math.min(1, confidence + learned.confidence * 0.3);
      }

      results.push({ email, pattern, confidence });
    }
  }

  return results.slice(0, 10); // Return top 10 variations
}

// ============ Company Similarity Matching ============

/**
 * Find similar companies that might share email patterns
 * Based on domain structure and industry
 */
export function findSimilarDomains(
  domain: string,
  allDomains: string[]
): string[] {
  const domainParts = domain.toLowerCase().split('.');
  const tld = domainParts[domainParts.length - 1];
  const mainName = domainParts[0];

  const similar: Array<{ domain: string; score: number }> = [];

  for (const otherDomain of allDomains) {
    if (otherDomain.toLowerCase() === domain.toLowerCase()) continue;

    const otherParts = otherDomain.toLowerCase().split('.');
    const otherTld = otherParts[otherParts.length - 1];
    const otherName = otherParts[0];

    let score = 0;

    // Same TLD bonus
    if (tld === otherTld) score += 1;

    // Similar name length
    if (Math.abs(mainName.length - otherName.length) <= 3) score += 1;

    // Shared prefix
    const minLen = Math.min(mainName.length, otherName.length);
    for (let i = 0; i < minLen; i++) {
      if (mainName[i] === otherName[i]) {
        score += 0.1;
      } else {
        break;
      }
    }

    if (score > 1) {
      similar.push({ domain: otherDomain, score });
    }
  }

  return similar
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.domain);
}

/**
 * Get patterns from similar companies in the same industry
 */
export async function getPatternFromSimilarCompanies(
  domain: string,
  industry: string,
  knownDomains: string[]
): Promise<{ pattern: EmailPattern; confidence: number; source: string } | null> {
  const similar = findSimilarDomains(domain, knownDomains);

  for (const similarDomain of similar) {
    const learned = await getLearnedPattern(similarDomain);
    if (learned.pattern && learned.confidence >= 0.7) {
      return {
        pattern: learned.pattern,
        confidence: learned.confidence * 0.8, // Reduce confidence for indirect match
        source: similarDomain,
      };
    }
  }

  // Fall back to industry patterns
  const industryPatterns = getIndustryPatterns(industry);
  if (industryPatterns.length > 0) {
    return {
      pattern: industryPatterns[0],
      confidence: 0.5,
      source: `industry:${industry}`,
    };
  }

  return null;
}

// ============ Enhanced Confidence Calculation ============

/**
 * Calculate comprehensive confidence for a generated email
 */
export async function calculateEmailConfidence(
  email: string,
  firstName: string,
  lastName: string,
  options?: {
    industry?: string;
    employeeCount?: number;
    hasWebsite?: boolean;
    sourceReliability?: number;
    isCatchAll?: boolean;
  }
): Promise<{
  confidence: number;
  breakdown: {
    patternMatch: number;
    industryAlignment: number;
    sizeAlignment: number;
    sourceBonus: number;
    penalties: number;
  };
  recommendations: string[];
}> {
  const domain = email.split('@')[1]?.toLowerCase();
  const pattern = detectPattern(email, firstName, lastName);
  const learned = await getLearnedPattern(domain);

  let patternMatch = 0.3; // Base confidence
  let industryAlignment = 0;
  let sizeAlignment = 0;
  let sourceBonus = 0;
  let penalties = 0;
  const recommendations: string[] = [];

  // Pattern match scoring
  if (learned.pattern === pattern) {
    patternMatch = learned.confidence;
    recommendations.push('Pattern matches confirmed emails at this company');
  } else if (learned.pattern && learned.confidence > 0.7) {
    patternMatch = 0.2;
    recommendations.push(`Different pattern detected - company typically uses ${learned.pattern}`);
  }

  // Industry alignment
  if (options?.industry) {
    const industryPatterns = getIndustryPatterns(options.industry);
    const patternIndex = industryPatterns.indexOf(pattern);
    if (patternIndex >= 0) {
      industryAlignment = Math.max(0.1, 0.3 - patternIndex * 0.1);
      if (patternIndex === 0) {
        recommendations.push('Pattern matches industry preference');
      }
    }
  }

  // Size alignment
  if (options?.employeeCount) {
    const sizePatterns = getSizePatterns(options.employeeCount);
    const patternIndex = sizePatterns.indexOf(pattern);
    if (patternIndex >= 0) {
      sizeAlignment = Math.max(0.05, 0.15 - patternIndex * 0.05);
    }
  }

  // Source reliability bonus
  if (options?.sourceReliability) {
    sourceBonus = options.sourceReliability * 0.2;
  }

  // Penalties
  if (options?.isCatchAll) {
    penalties -= 0.15;
    recommendations.push('Catch-all domain detected - email may appear valid but be incorrect');
  }

  if (!options?.hasWebsite) {
    penalties -= 0.05;
  }

  const confidence = Math.max(0, Math.min(1,
    patternMatch + industryAlignment + sizeAlignment + sourceBonus + penalties
  ));

  return {
    confidence,
    breakdown: {
      patternMatch,
      industryAlignment,
      sizeAlignment,
      sourceBonus,
      penalties,
    },
    recommendations,
  };
}

// ============ Pattern Statistics ============

/**
 * Get statistics about learned patterns
 */
export function getPatternStats(): {
  totalDomains: number;
  patternDistribution: Record<EmailPattern, number>;
  topPatterns: Array<{ pattern: EmailPattern; count: number; percentage: number }>;
} {
  const distribution: Record<EmailPattern, number> = {
    'first.last': 0, firstlast: 0, first_last: 0, flast: 0,
    firstl: 0, 'f.last': 0, first: 0, last: 0,
    lastfirst: 0, 'last.first': 0, lastf: 0, fl: 0,
    info: 0, contact: 0, unknown: 0,
  };

  let totalDomains = 0;

  for (const [, cached] of patternCache) {
    if (Date.now() - cached.timestamp < PATTERN_CACHE_TTL) {
      totalDomains++;
      const pattern = cached.pattern as EmailPattern;
      distribution[pattern] = (distribution[pattern] || 0) + 1;
    }
  }

  const topPatterns = Object.entries(distribution)
    .filter(([, count]) => count > 0)
    .map(([pattern, count]) => ({
      pattern: pattern as EmailPattern,
      count,
      percentage: totalDomains > 0 ? (count / totalDomains) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalDomains,
    patternDistribution: distribution,
    topPatterns,
  };
}

/**
 * Clear pattern cache (for testing)
 */
export function clearPatternCache(): void {
  patternCache.clear();
  catchAllCache.clear();
}

// ============ Generic Business Email Patterns ============

// Common generic email prefixes for businesses (ordered by likelihood)
const GENERIC_EMAIL_PATTERNS = [
  'info',
  'contact',
  'hello',
  'sales',
  'support',
  'admin',
  'mail',
  'office',
  'enquiries',
  'team',
];

// MX record cache
const mxRecordCache = new Map<string, { records: string[]; timestamp: number }>();
const MX_RECORD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Rate limiting for SMTP connections
let lastSmtpTime = 0;
const SMTP_RATE_LIMIT_MS = 100; // 10 connections/second max

export interface GenericPatternResult {
  email: string;
  source: 'pattern-smtp-verified' | 'pattern-mx-only';
  confidence: number;
  pattern: string;
}

/**
 * Get MX records for a domain (cached)
 */
async function getMxRecordsForDomain(domain: string): Promise<string[]> {
  const cached = mxRecordCache.get(domain);
  if (cached && Date.now() - cached.timestamp < MX_RECORD_CACHE_TTL) {
    return cached.records;
  }

  return new Promise((resolve) => {
    dns.resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        mxRecordCache.set(domain, { records: [], timestamp: Date.now() });
        resolve([]);
        return;
      }

      const records = addresses
        .sort((a, b) => a.priority - b.priority)
        .map((mx) => mx.exchange);

      mxRecordCache.set(domain, { records, timestamp: Date.now() });
      resolve(records);
    });
  });
}

/**
 * Rate-limited SMTP connection delay
 */
async function waitForSmtpRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastSmtpTime;
  if (elapsed < SMTP_RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, SMTP_RATE_LIMIT_MS - elapsed));
  }
  lastSmtpTime = Date.now();
}

/**
 * Verify SMTP server responds with handshake (EHLO only, no RCPT TO)
 */
async function verifySmtpResponds(mxHost: string, timeoutMs: number = 5000): Promise<boolean> {
  await waitForSmtpRateLimit();

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    socket.on('connect', () => {
      // Wait for greeting
    });

    socket.on('data', (data) => {
      const response = data.toString();

      if (response.startsWith('220')) {
        // Send EHLO
        socket.write('EHLO leadgen.local\r\n');
      } else if (response.startsWith('250')) {
        // EHLO accepted
        clearTimeout(timeout);
        socket.write('QUIT\r\n');
        cleanup();
        resolve(true);
      } else if (response.startsWith('421') || response.startsWith('450') || response.startsWith('451')) {
        // Temporary failure but server exists
        clearTimeout(timeout);
        cleanup();
        resolve(true);
      }
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      cleanup();
      resolve(false);
    });

    socket.on('close', () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });

    socket.connect(25, mxHost);
  });
}

/**
 * Extract domain from URL
 */
function extractDomainFromUrl(url: string): string {
  try {
    if (url.includes('@')) {
      return url.split('@')[1].toLowerCase();
    }
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase();
  }
}

/**
 * Generate generic business email patterns for a domain
 */
export function generateGenericPatterns(domain: string): string[] {
  return GENERIC_EMAIL_PATTERNS.map((prefix) => `${prefix}@${domain}`);
}

/**
 * Find email by generic pattern with MX/SMTP validation
 * Returns the most likely email (info@) if the domain has valid MX records and SMTP responds
 */
export async function findEmailByGenericPattern(
  websiteOrDomain: string
): Promise<GenericPatternResult | null> {
  const domain = extractDomainFromUrl(websiteOrDomain);

  if (!domain || domain.length < 4 || !domain.includes('.')) {
    return null;
  }

  // Step 1: Check MX records
  const mxRecords = await getMxRecordsForDomain(domain);

  if (mxRecords.length === 0) {
    // No mail servers - can't receive email
    return null;
  }

  // Step 2: Try SMTP handshake with primary MX
  let smtpVerified = false;
  try {
    smtpVerified = await verifySmtpResponds(mxRecords[0]);
  } catch {
    // SMTP verification failed, but MX exists
  }

  // Step 3: Return the most common generic pattern
  const bestPattern = 'info'; // Most common for small businesses
  const email = `${bestPattern}@${domain}`;

  return {
    email,
    source: smtpVerified ? 'pattern-smtp-verified' : 'pattern-mx-only',
    confidence: smtpVerified ? 0.75 : 0.50,
    pattern: bestPattern,
  };
}

/**
 * Find emails by generic pattern for multiple websites
 */
export async function findEmailsByGenericPatternBatch(
  websites: string[],
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<Map<string, GenericPatternResult | null>> {
  const { concurrency = 5, onProgress } = options;
  const results = new Map<string, GenericPatternResult | null>();
  const queue = [...websites];
  let completed = 0;

  async function worker() {
    while (queue.length > 0) {
      const website = queue.shift();
      if (!website) break;

      try {
        const result = await findEmailByGenericPattern(website);
        results.set(website, result);
      } catch {
        results.set(website, null);
      }

      completed++;
      onProgress?.(completed, websites.length);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, websites.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}

/**
 * Quick check if domain can receive email (has MX records)
 */
export async function canReceiveEmail(domain: string): Promise<boolean> {
  const records = await getMxRecordsForDomain(extractDomainFromUrl(domain));
  return records.length > 0;
}
