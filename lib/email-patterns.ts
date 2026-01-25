/**
 * Email Pattern Learning and Catch-All Detection
 * Learns email patterns from discovered emails and detects catch-all domains
 */

import * as dns from 'dns';
import * as net from 'net';

// Cache for catch-all detection results
const catchAllCache = new Map<string, { isCatchAll: boolean; timestamp: number }>();
const CATCH_ALL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Cache for learned email patterns
const patternCache = new Map<string, { pattern: string; examples: string[]; timestamp: number }>();
const PATTERN_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

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
