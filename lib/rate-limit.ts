/**
 * Rate Limiting & Abuse Prevention Module
 *
 * Provides:
 * - IP-based rate limiting
 * - User account rate limiting (higher limits)
 * - Suspicious activity detection
 * - Bad actor blocking
 * - Request fingerprinting
 */

import { createHash } from 'crypto';

// ============ Types ============

export interface RateLimitConfig {
  // Requests per window
  requestsPerWindow: number;
  // Window size in milliseconds
  windowMs: number;
  // Whether to block after limit exceeded
  blockAfterExceeded: boolean;
  // Block duration in milliseconds
  blockDurationMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  blocked: boolean;
  blockReason?: string;
  retryAfterMs?: number;
}

export interface SuspiciousActivity {
  type: 'rapid_requests' | 'pattern_abuse' | 'invalid_inputs' | 'scraping' | 'enumeration';
  score: number;
  timestamp: Date;
  details: string;
}

export interface RequestFingerprint {
  hash: string;
  ip: string;
  userAgent: string;
  acceptLanguage: string;
  acceptEncoding: string;
  screenResolution?: string;
  timezone?: string;
  plugins?: string[];
}

// ============ Rate Limit Tiers ============

export const RATE_LIMIT_TIERS: Record<string, RateLimitConfig> = {
  // Anonymous users (by IP)
  anonymous: {
    requestsPerWindow: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
    blockAfterExceeded: true,
    blockDurationMs: 60 * 60 * 1000, // 1 hour
  },

  // Free registered users
  free: {
    requestsPerWindow: 50,
    windowMs: 60 * 60 * 1000, // 1 hour
    blockAfterExceeded: false,
    blockDurationMs: 0,
  },

  // Premium users
  premium: {
    requestsPerWindow: 500,
    windowMs: 60 * 60 * 1000, // 1 hour
    blockAfterExceeded: false,
    blockDurationMs: 0,
  },

  // API access
  api: {
    requestsPerWindow: 60,
    windowMs: 60 * 1000, // 1 minute
    blockAfterExceeded: false,
    blockDurationMs: 0,
  },
};

// ============ In-Memory Storage ============

interface RateLimitWindow {
  count: number;
  startTime: Date;
  requests: Date[];
}

interface BlockedEntity {
  reason: string;
  blockedAt: Date;
  expiresAt: Date;
  permanent: boolean;
}

// IP-based tracking
const ipWindows = new Map<string, RateLimitWindow>();
const ipSuspiciousActivity = new Map<string, SuspiciousActivity[]>();
const blockedIps = new Map<string, BlockedEntity>();

// User-based tracking
const userWindows = new Map<string, RateLimitWindow>();
const userSuspiciousActivity = new Map<string, SuspiciousActivity[]>();
const blockedUsers = new Map<string, BlockedEntity>();

// Fingerprint tracking
const fingerprintWindows = new Map<string, RateLimitWindow>();
const knownFingerprints = new Map<string, { firstSeen: Date; requestCount: number; userId?: string }>();

// Bad actor patterns
const badActorPatterns = new Set<string>();

// ============ Core Rate Limiting ============

/**
 * Check rate limit for an IP address
 */
export function checkIpRateLimit(ip: string): RateLimitResult {
  // Check if IP is blocked
  const blocked = blockedIps.get(ip);
  if (blocked && new Date() < blocked.expiresAt) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: blocked.expiresAt,
      blocked: true,
      blockReason: blocked.reason,
      retryAfterMs: blocked.expiresAt.getTime() - Date.now(),
    };
  } else if (blocked) {
    // Block expired, remove it
    blockedIps.delete(ip);
  }

  const config = RATE_LIMIT_TIERS.anonymous;
  return checkRateLimit(ip, ipWindows, config);
}

/**
 * Check rate limit for a user account
 */
export function checkUserRateLimit(
  userId: string,
  tier: 'free' | 'premium' | 'api' = 'free'
): RateLimitResult {
  // Check if user is blocked
  const blocked = blockedUsers.get(userId);
  if (blocked && new Date() < blocked.expiresAt) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: blocked.expiresAt,
      blocked: true,
      blockReason: blocked.reason,
      retryAfterMs: blocked.expiresAt.getTime() - Date.now(),
    };
  } else if (blocked) {
    blockedUsers.delete(userId);
  }

  const config = RATE_LIMIT_TIERS[tier];
  return checkRateLimit(userId, userWindows, config);
}

/**
 * Check rate limit for a fingerprint
 */
export function checkFingerprintRateLimit(fingerprint: string): RateLimitResult {
  const config = RATE_LIMIT_TIERS.anonymous;
  return checkRateLimit(fingerprint, fingerprintWindows, config);
}

/**
 * Core rate limit checking logic
 */
function checkRateLimit(
  key: string,
  windows: Map<string, RateLimitWindow>,
  config: RateLimitConfig
): RateLimitResult {
  const now = new Date();
  let window = windows.get(key);

  // Create or reset window if needed
  if (!window || now.getTime() - window.startTime.getTime() >= config.windowMs) {
    window = {
      count: 0,
      startTime: now,
      requests: [],
    };
    windows.set(key, window);
  }

  // Calculate reset time
  const resetAt = new Date(window.startTime.getTime() + config.windowMs);

  // Check if within limit
  if (window.count >= config.requestsPerWindow) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      blocked: false,
      retryAfterMs: resetAt.getTime() - now.getTime(),
    };
  }

  // Increment count
  window.count++;
  window.requests.push(now);

  // Keep only recent requests for analysis
  const cutoff = new Date(now.getTime() - config.windowMs);
  window.requests = window.requests.filter(r => r > cutoff);

  return {
    allowed: true,
    remaining: config.requestsPerWindow - window.count,
    resetAt,
    blocked: false,
  };
}

// ============ Suspicious Activity Detection ============

/**
 * Record and analyze request patterns for suspicious activity
 */
export function analyzeRequest(
  ip: string,
  userId: string | null,
  request: {
    path: string;
    method: string;
    query?: Record<string, string>;
    body?: unknown;
    userAgent?: string;
  }
): { suspicious: boolean; activities: SuspiciousActivity[]; shouldBlock: boolean } {
  const activities: SuspiciousActivity[] = [];
  const now = new Date();

  // Get request history
  const ipWindow = ipWindows.get(ip);
  const recentRequests = ipWindow?.requests || [];

  // Check for rapid-fire requests (10 or more in 5 seconds)
  const fiveSecondsAgo = new Date(now.getTime() - 5000);
  const rapidRequests = recentRequests.filter(r => r > fiveSecondsAgo).length;
  if (rapidRequests >= 10) {
    activities.push({
      type: 'rapid_requests',
      score: Math.min(1, rapidRequests / 20),
      timestamp: now,
      details: `${rapidRequests} requests in 5 seconds`,
    });
  }

  // Check for scraping patterns (sequential enumeration)
  if (request.query && detectEnumeration(ip, request.query)) {
    activities.push({
      type: 'enumeration',
      score: 0.7,
      timestamp: now,
      details: 'Sequential parameter enumeration detected',
    });
  }

  // Check for suspicious user agent
  const suspiciousAgents = [
    'curl', 'wget', 'python-requests', 'scrapy', 'bot', 'crawler', 'spider',
  ];
  const ua = request.userAgent?.toLowerCase() || '';
  if (suspiciousAgents.some(s => ua.includes(s))) {
    activities.push({
      type: 'scraping',
      score: 0.5,
      timestamp: now,
      details: `Suspicious user agent: ${request.userAgent}`,
    });
  }

  // Check for invalid inputs (potential probing)
  if (hasInvalidInputPatterns(request)) {
    activities.push({
      type: 'invalid_inputs',
      score: 0.6,
      timestamp: now,
      details: 'Potentially malicious input patterns detected',
    });
  }

  // Store activities
  if (activities.length > 0) {
    const existing = ipSuspiciousActivity.get(ip) || [];
    ipSuspiciousActivity.set(ip, [...existing, ...activities].slice(-100));

    if (userId) {
      const userExisting = userSuspiciousActivity.get(userId) || [];
      userSuspiciousActivity.set(userId, [...userExisting, ...activities].slice(-100));
    }
  }

  // Calculate if should block
  const totalScore = activities.reduce((sum, a) => sum + a.score, 0);
  const recentActivityScore = getRecentActivityScore(ip);

  return {
    suspicious: activities.length > 0,
    activities,
    shouldBlock: totalScore > 1.5 || recentActivityScore > 3,
  };
}

/**
 * Get recent suspicious activity score
 */
function getRecentActivityScore(ip: string): number {
  const activities = ipSuspiciousActivity.get(ip) || [];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  return activities
    .filter(a => a.timestamp > oneHourAgo)
    .reduce((sum, a) => sum + a.score, 0);
}

// Track recent query parameters for enumeration detection
const recentQueries = new Map<string, string[]>();

/**
 * Detect sequential enumeration patterns
 */
function detectEnumeration(ip: string, query: Record<string, string>): boolean {
  const queries = recentQueries.get(ip) || [];
  const queryStr = JSON.stringify(query);

  queries.push(queryStr);
  if (queries.length > 10) queries.shift();
  recentQueries.set(ip, queries);

  if (queries.length < 5) return false;

  // Check for sequential numeric patterns
  const numericParams = Object.values(query).filter(v => /^\d+$/.test(v));
  if (numericParams.length === 0) return false;

  // Look for incrementing patterns in recent queries
  const recentNumbers = queries.slice(-5).map(q => {
    try {
      const parsed = JSON.parse(q);
      return Object.values(parsed).find((v): v is string => /^\d+$/.test(String(v)));
    } catch {
      return null;
    }
  }).filter(Boolean).map(Number);

  // Check if numbers are sequential
  if (recentNumbers.length >= 4) {
    let sequential = true;
    for (let i = 1; i < recentNumbers.length; i++) {
      if (recentNumbers[i] !== recentNumbers[i - 1] + 1) {
        sequential = false;
        break;
      }
    }
    if (sequential) return true;
  }

  return false;
}

/**
 * Check for potentially malicious input patterns
 */
function hasInvalidInputPatterns(request: { query?: Record<string, string>; body?: unknown }): boolean {
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /union\s+select/i,
    /;\s*drop\s+/i,
    /\.\.\/\.\.\//,
    /%00/,
    /\$\{/,
  ];

  const checkValue = (value: unknown): boolean => {
    if (typeof value === 'string') {
      return suspiciousPatterns.some(p => p.test(value));
    }
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(checkValue);
    }
    return false;
  };

  if (request.query && checkValue(request.query)) return true;
  if (request.body && checkValue(request.body)) return true;

  return false;
}

// ============ Blocking ============

/**
 * Block an IP address
 */
export function blockIp(
  ip: string,
  reason: string,
  durationMs: number = 60 * 60 * 1000,
  permanent: boolean = false
): void {
  blockedIps.set(ip, {
    reason,
    blockedAt: new Date(),
    expiresAt: permanent ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : new Date(Date.now() + durationMs),
    permanent,
  });
}

/**
 * Block a user account
 */
export function blockUser(
  userId: string,
  reason: string,
  durationMs: number = 60 * 60 * 1000,
  permanent: boolean = false
): void {
  blockedUsers.set(userId, {
    reason,
    blockedAt: new Date(),
    expiresAt: permanent ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : new Date(Date.now() + durationMs),
    permanent,
  });
}

/**
 * Unblock an IP address
 */
export function unblockIp(ip: string): boolean {
  return blockedIps.delete(ip);
}

/**
 * Unblock a user
 */
export function unblockUser(userId: string): boolean {
  return blockedUsers.delete(userId);
}

/**
 * Check if IP is blocked
 */
export function isIpBlocked(ip: string): { blocked: boolean; reason?: string; expiresAt?: Date } {
  const blocked = blockedIps.get(ip);
  if (!blocked) return { blocked: false };

  if (new Date() >= blocked.expiresAt) {
    blockedIps.delete(ip);
    return { blocked: false };
  }

  return { blocked: true, reason: blocked.reason, expiresAt: blocked.expiresAt };
}

/**
 * Check if user is blocked
 */
export function isUserBlocked(userId: string): { blocked: boolean; reason?: string; expiresAt?: Date } {
  const blocked = blockedUsers.get(userId);
  if (!blocked) return { blocked: false };

  if (new Date() >= blocked.expiresAt) {
    blockedUsers.delete(userId);
    return { blocked: false };
  }

  return { blocked: true, reason: blocked.reason, expiresAt: blocked.expiresAt };
}

/**
 * Add a bad actor pattern (fingerprint or identifier)
 */
export function addBadActorPattern(pattern: string): void {
  badActorPatterns.add(pattern);
}

/**
 * Check if matches bad actor pattern
 */
export function matchesBadActorPattern(identifier: string): boolean {
  return badActorPatterns.has(identifier);
}

// ============ Request Fingerprinting ============

/**
 * Generate a fingerprint from request headers
 */
export function generateFingerprint(headers: {
  ip: string;
  userAgent?: string;
  acceptLanguage?: string;
  acceptEncoding?: string;
  screenResolution?: string;
  timezone?: string;
}): RequestFingerprint {
  const components = [
    headers.ip,
    headers.userAgent || '',
    headers.acceptLanguage || '',
    headers.acceptEncoding || '',
    headers.screenResolution || '',
    headers.timezone || '',
  ];

  const hash = createHash('sha256')
    .update(components.join('|'))
    .digest('hex')
    .substring(0, 16);

  return {
    hash,
    ip: headers.ip,
    userAgent: headers.userAgent || '',
    acceptLanguage: headers.acceptLanguage || '',
    acceptEncoding: headers.acceptEncoding || '',
    screenResolution: headers.screenResolution,
    timezone: headers.timezone,
  };
}

/**
 * Track a fingerprint and associate with user if provided
 */
export function trackFingerprint(fingerprint: RequestFingerprint, userId?: string): void {
  const existing = knownFingerprints.get(fingerprint.hash);

  if (existing) {
    existing.requestCount++;
    if (userId && !existing.userId) {
      existing.userId = userId;
    }
  } else {
    knownFingerprints.set(fingerprint.hash, {
      firstSeen: new Date(),
      requestCount: 1,
      userId,
    });
  }
}

/**
 * Check if fingerprint is associated with suspicious activity
 */
export function isFingerprintSuspicious(fingerprint: RequestFingerprint): boolean {
  // Check if fingerprint is in bad actor list
  if (badActorPatterns.has(fingerprint.hash)) {
    return true;
  }

  // Check for multiple accounts from same fingerprint
  const known = knownFingerprints.get(fingerprint.hash);
  if (known && known.requestCount > 1000) {
    return true;
  }

  return false;
}

// ============ CAPTCHA Requirement ============

/**
 * Determine if CAPTCHA should be required
 */
export function shouldRequireCaptcha(
  ip: string,
  userId: string | null
): { required: boolean; reason?: string } {
  // Check suspicious activity score
  const activityScore = getRecentActivityScore(ip);
  if (activityScore > 1) {
    return { required: true, reason: 'Suspicious activity detected' };
  }

  // Check rate limit proximity
  const ipLimit = checkIpRateLimit(ip);
  if (ipLimit.remaining < 3 && !ipLimit.blocked) {
    return { required: true, reason: 'Approaching rate limit' };
  }

  // Check for previous blocks
  const ipActivities = ipSuspiciousActivity.get(ip) || [];
  const recentBlocks = ipActivities.filter(
    a => a.type === 'rapid_requests' && a.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)
  );
  if (recentBlocks.length > 2) {
    return { required: true, reason: 'Multiple rate limit violations' };
  }

  return { required: false };
}

// ============ Statistics ============

/**
 * Get rate limiting statistics
 */
export function getRateLimitStats(): {
  blockedIps: number;
  blockedUsers: number;
  activeWindows: number;
  suspiciousIps: number;
  badActorPatterns: number;
} {
  // Clean up expired blocks
  const now = new Date();
  for (const [ip, block] of blockedIps) {
    if (now >= block.expiresAt) blockedIps.delete(ip);
  }
  for (const [user, block] of blockedUsers) {
    if (now >= block.expiresAt) blockedUsers.delete(user);
  }

  return {
    blockedIps: blockedIps.size,
    blockedUsers: blockedUsers.size,
    activeWindows: ipWindows.size + userWindows.size,
    suspiciousIps: ipSuspiciousActivity.size,
    badActorPatterns: badActorPatterns.size,
  };
}

/**
 * Get blocked entities list
 */
export function getBlockedEntities(): {
  ips: Array<{ ip: string; reason: string; expiresAt: Date; permanent: boolean }>;
  users: Array<{ userId: string; reason: string; expiresAt: Date; permanent: boolean }>;
} {
  return {
    ips: Array.from(blockedIps.entries()).map(([ip, block]) => ({
      ip,
      reason: block.reason,
      expiresAt: block.expiresAt,
      permanent: block.permanent,
    })),
    users: Array.from(blockedUsers.entries()).map(([userId, block]) => ({
      userId,
      reason: block.reason,
      expiresAt: block.expiresAt,
      permanent: block.permanent,
    })),
  };
}

// ============ Cleanup ============

/**
 * Clear all rate limit data (for testing)
 */
export function clearAllRateLimitData(): void {
  ipWindows.clear();
  ipSuspiciousActivity.clear();
  blockedIps.clear();
  userWindows.clear();
  userSuspiciousActivity.clear();
  blockedUsers.clear();
  fingerprintWindows.clear();
  knownFingerprints.clear();
  badActorPatterns.clear();
  recentQueries.clear();
}

/**
 * Clean up old data to prevent memory leaks
 */
export function cleanupOldData(): void {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Clean old windows
  for (const [key, window] of ipWindows) {
    if (window.startTime < oneHourAgo) {
      ipWindows.delete(key);
    }
  }
  for (const [key, window] of userWindows) {
    if (window.startTime < oneHourAgo) {
      userWindows.delete(key);
    }
  }

  // Clean old suspicious activity
  for (const [ip, activities] of ipSuspiciousActivity) {
    const recent = activities.filter(a => a.timestamp > oneDayAgo);
    if (recent.length === 0) {
      ipSuspiciousActivity.delete(ip);
    } else {
      ipSuspiciousActivity.set(ip, recent);
    }
  }

  // Clean expired blocks
  const now = new Date();
  for (const [ip, block] of blockedIps) {
    if (!block.permanent && now >= block.expiresAt) {
      blockedIps.delete(ip);
    }
  }
  for (const [user, block] of blockedUsers) {
    if (!block.permanent && now >= block.expiresAt) {
      blockedUsers.delete(user);
    }
  }

  // Clean old query history
  for (const [ip, queries] of recentQueries) {
    if (queries.length === 0 || !ipWindows.has(ip)) {
      recentQueries.delete(ip);
    }
  }
}
