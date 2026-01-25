/**
 * Edge Middleware for Performance Optimization & Security
 *
 * - Rate limiting per IP address
 * - Abuse prevention and bad actor blocking
 * - Adds cache headers for static API responses
 * - Tracks request latency for monitoring
 * - Security headers
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ============ Rate Limiting Configuration ============

// Rate limit tracking (edge-compatible, in-memory per edge instance)
const rateLimitWindows = new Map<string, { count: number; resetAt: number }>();

// Configuration per endpoint type
const RATE_LIMITS: Record<string, { requests: number; windowMs: number }> = {
  // API v1 endpoints (authenticated)
  '/api/v1': { requests: 60, windowMs: 60 * 1000 },
  // Search/scrape endpoints (most restrictive)
  '/api/search': { requests: 20, windowMs: 60 * 1000 },
  '/api/scrape': { requests: 10, windowMs: 60 * 1000 },
  '/api/jobs': { requests: 30, windowMs: 60 * 1000 },
  // General API
  '/api': { requests: 100, windowMs: 60 * 1000 },
  // Default for pages
  default: { requests: 200, windowMs: 60 * 1000 },
};

// ============ Blocked Patterns ============

// Suspicious user agents (security scanners, known bad bots)
const BLOCKED_USER_AGENTS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /zmap/i,
  /wpscan/i,
  /dirbuster/i,
  /gobuster/i,
  /acunetix/i,
  /nessus/i,
  /burpsuite/i,
  /owasp/i,
  /havij/i,
];

// Suspicious request patterns (injection attempts)
const BLOCKED_PATH_PATTERNS = [
  /\.\.\//, // Path traversal
  /%00/, // Null byte injection
  /\$\{.*\}/, // Template injection
  /<script/i, // XSS
  /javascript:/i, // XSS
  /union\s+select/i, // SQL injection
  /;\s*drop\s+/i, // SQL injection
  /\/etc\/passwd/i, // LFI
  /\/proc\/self/i, // LFI
  /\.env/i, // Sensitive file access
  /\.git/i, // Git exposure
  /wp-admin/i, // WordPress probing
  /wp-login/i, // WordPress probing
  /phpmyadmin/i, // phpMyAdmin probing
];

// ============ Cache Configuration ============

// Paths that should have caching enabled
const CACHEABLE_PATHS = [
  '/api/api-status',
  '/api/health',
];

// Paths that should never be cached
const NO_CACHE_PATHS = [
  '/api/jobs',
  '/api/inngest',
  '/api/v1',
  '/api/search',
  '/api/scrape',
];

// Cache durations in seconds
const CACHE_DURATIONS: Record<string, number> = {
  '/api/api-status': 10,
  '/api/health': 5,
};

// ============ Main Middleware Function ============

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const startTime = Date.now();

  // Skip middleware for static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Get client identifier
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || '';

  // ============ Security Checks ============

  // Block suspicious user agents
  if (BLOCKED_USER_AGENTS.some(pattern => pattern.test(userAgent))) {
    return createBlockedResponse('Access denied: Suspicious client detected');
  }

  // Block suspicious URL patterns
  const fullUrl = request.nextUrl.toString();
  if (BLOCKED_PATH_PATTERNS.some(pattern => pattern.test(fullUrl))) {
    return createBlockedResponse('Access denied: Suspicious request detected');
  }

  // ============ Rate Limiting ============

  const rateLimit = getRateLimitForPath(pathname);
  const rateLimitKey = `${ip}:${getRateLimitBucket(pathname)}`;
  const now = Date.now();

  let window = rateLimitWindows.get(rateLimitKey);
  if (!window || now > window.resetAt) {
    window = { count: 0, resetAt: now + rateLimit.windowMs };
    rateLimitWindows.set(rateLimitKey, window);
  }

  window.count++;

  const remaining = Math.max(0, rateLimit.requests - window.count);
  const resetAt = new Date(window.resetAt);

  // Check if over limit
  if (window.count > rateLimit.requests) {
    const retryAfter = Math.ceil((window.resetAt - now) / 1000);

    return new NextResponse(
      JSON.stringify({
        error: 'Too many requests. Please slow down.',
        retryAfter,
        resetAt: resetAt.toISOString(),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(rateLimit.requests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetAt.toISOString(),
          'Retry-After': String(retryAfter),
        },
      }
    );
  }

  // ============ Create Response ============

  const response = NextResponse.next();

  // Add request timing header
  response.headers.set('X-Request-Start', startTime.toString());

  // Add rate limit headers
  response.headers.set('X-RateLimit-Limit', String(rateLimit.requests));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  response.headers.set('X-RateLimit-Reset', resetAt.toISOString());

  // ============ Caching Headers ============

  const isApiRoute = pathname.startsWith('/api/');

  if (isApiRoute) {
    const isCacheable = CACHEABLE_PATHS.some(path => pathname.startsWith(path));
    const isNoCache = NO_CACHE_PATHS.some(path => pathname.startsWith(path));

    if (isCacheable && !isNoCache) {
      const duration = Object.entries(CACHE_DURATIONS).find(([path]) =>
        pathname.startsWith(path)
      )?.[1] || 10;

      response.headers.set('Cache-Control', `public, s-maxage=${duration}, stale-while-revalidate=${duration * 2}`);
      response.headers.set('CDN-Cache-Control', `max-age=${duration}`);
      response.headers.set('Vercel-CDN-Cache-Control', `max-age=${duration}`);
    } else if (isNoCache) {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    }

    // CORS headers for API routes
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  }

  // ============ Security Headers ============

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // ============ Cleanup ============

  // Clean up old entries periodically (1% chance per request)
  if (Math.random() < 0.01) {
    cleanupOldWindows();
  }

  return response;
}

// ============ Helper Functions ============

/**
 * Get client IP from request headers
 */
function getClientIp(request: NextRequest): string {
  // Check various headers that may contain the real IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Vercel-specific header
  const vercelIp = request.headers.get('x-vercel-forwarded-for');
  if (vercelIp) {
    return vercelIp;
  }

  return 'unknown';
}

/**
 * Get rate limit configuration for a path
 */
function getRateLimitForPath(pathname: string): { requests: number; windowMs: number } {
  // Check specific paths first
  for (const [prefix, limit] of Object.entries(RATE_LIMITS)) {
    if (prefix !== 'default' && pathname.startsWith(prefix)) {
      return limit;
    }
  }
  return RATE_LIMITS.default;
}

/**
 * Get rate limit bucket for grouping similar endpoints
 */
function getRateLimitBucket(pathname: string): string {
  // Group API v1 endpoints
  if (pathname.startsWith('/api/v1')) {
    return 'api-v1';
  }

  // Group search/scrape endpoints
  if (pathname.startsWith('/api/search') || pathname.startsWith('/api/scrape')) {
    return 'search';
  }

  // Group job endpoints
  if (pathname.startsWith('/api/jobs')) {
    return 'jobs';
  }

  // Group all other API endpoints
  if (pathname.startsWith('/api')) {
    return 'api';
  }

  // Default bucket for pages
  return 'pages';
}

/**
 * Create a blocked response
 */
function createBlockedResponse(message: string): NextResponse {
  return new NextResponse(
    JSON.stringify({ error: message }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}

/**
 * Clean up old rate limit windows to prevent memory leaks
 */
function cleanupOldWindows(): void {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes

  for (const [key, window] of rateLimitWindows) {
    if (now > window.resetAt + maxAge) {
      rateLimitWindows.delete(key);
    }
  }
}

// ============ Matcher Configuration ============

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
