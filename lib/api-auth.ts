/**
 * API Authentication and Rate Limiting Module
 *
 * Provides:
 * - API key generation and validation
 * - Per-key rate limiting
 * - Usage tracking
 * - Webhook management
 */

import { randomBytes, createHash } from 'crypto';

// ============ Types ============

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string; // First 8 chars of the key for display
  permissions: ApiPermission[];
  rateLimit: number; // Requests per minute
  monthlyLimit: number; // Requests per month
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface ApiKeyUsage {
  keyId: string;
  date: string; // YYYY-MM-DD
  requestCount: number;
  searchCount: number;
  exportCount: number;
  bytesTransferred: number;
}

export interface ApiRateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
  monthlyRemaining: number;
  monthlyLimit: number;
}

export type ApiPermission =
  | 'search:read'
  | 'search:write'
  | 'results:read'
  | 'export:read'
  | 'webhooks:write'
  | 'usage:read';

export interface Webhook {
  id: string;
  userId: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  isActive: boolean;
  createdAt: Date;
  lastTriggeredAt: Date | null;
  failureCount: number;
}

export type WebhookEvent =
  | 'search.started'
  | 'search.completed'
  | 'search.failed'
  | 'export.ready';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

// ============ In-Memory Storage (Replace with DB in production) ============

const apiKeys = new Map<string, ApiKey>();
const apiKeysByHash = new Map<string, ApiKey>();
const apiKeyUsage = new Map<string, Map<string, ApiKeyUsage>>();
const rateLimitWindows = new Map<string, { count: number; resetAt: Date }>();
const webhooks = new Map<string, Webhook>();

// ============ API Key Generation ============

/**
 * Generate a new API key
 * Returns the raw key (only shown once) and the stored key object
 */
export function generateApiKey(
  userId: string,
  name: string,
  options?: {
    permissions?: ApiPermission[];
    rateLimit?: number;
    monthlyLimit?: number;
    expiresInDays?: number;
  }
): { key: string; apiKey: ApiKey } {
  // Generate a secure random key
  const rawKey = `lgk_${randomBytes(32).toString('hex')}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.substring(0, 12);

  const apiKey: ApiKey = {
    id: `key_${Date.now()}_${randomBytes(4).toString('hex')}`,
    userId,
    name,
    keyHash,
    keyPrefix,
    permissions: options?.permissions || ['search:read', 'results:read'],
    rateLimit: options?.rateLimit || 60, // 60 requests per minute default
    monthlyLimit: options?.monthlyLimit || 10000, // 10k requests per month default
    isActive: true,
    expiresAt: options?.expiresInDays
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : null,
    createdAt: new Date(),
    lastUsedAt: null,
  };

  // Store by ID and hash
  apiKeys.set(apiKey.id, apiKey);
  apiKeysByHash.set(keyHash, apiKey);

  return { key: rawKey, apiKey };
}

/**
 * Hash an API key for storage
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Validate an API key and return the key object if valid
 */
export function validateApiKey(rawKey: string): ApiKey | null {
  if (!rawKey || !rawKey.startsWith('lgk_')) {
    return null;
  }

  const keyHash = hashApiKey(rawKey);
  const apiKey = apiKeysByHash.get(keyHash);

  if (!apiKey) {
    return null;
  }

  // Check if active
  if (!apiKey.isActive) {
    return null;
  }

  // Check expiration
  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    return null;
  }

  return apiKey;
}

/**
 * Revoke an API key
 */
export function revokeApiKey(keyId: string): boolean {
  const apiKey = apiKeys.get(keyId);
  if (!apiKey) {
    return false;
  }

  apiKey.isActive = false;
  return true;
}

/**
 * Get all API keys for a user
 */
export function getUserApiKeys(userId: string): ApiKey[] {
  return Array.from(apiKeys.values()).filter(key => key.userId === userId);
}

/**
 * Delete an API key
 */
export function deleteApiKey(keyId: string): boolean {
  const apiKey = apiKeys.get(keyId);
  if (!apiKey) {
    return false;
  }

  apiKeysByHash.delete(apiKey.keyHash);
  apiKeys.delete(keyId);
  return true;
}

// ============ Rate Limiting ============

/**
 * Check and update rate limit for an API key
 * Returns rate limit info or null if limit exceeded
 */
export function checkRateLimit(apiKey: ApiKey): ApiRateLimitInfo | null {
  const now = new Date();
  const windowKey = `${apiKey.id}:minute`;

  // Get or create rate limit window
  let window = rateLimitWindows.get(windowKey);
  if (!window || now > window.resetAt) {
    window = {
      count: 0,
      resetAt: new Date(now.getTime() + 60 * 1000), // 1 minute window
    };
    rateLimitWindows.set(windowKey, window);
  }

  // Check monthly limit
  const monthlyUsage = getMonthlyUsage(apiKey.id);

  // Calculate remaining
  const remaining = apiKey.rateLimit - window.count;
  const monthlyRemaining = apiKey.monthlyLimit - monthlyUsage;

  if (remaining <= 0 || monthlyRemaining <= 0) {
    return null;
  }

  // Increment count
  window.count++;

  return {
    remaining: remaining - 1,
    limit: apiKey.rateLimit,
    resetAt: window.resetAt,
    monthlyRemaining: monthlyRemaining - 1,
    monthlyLimit: apiKey.monthlyLimit,
  };
}

/**
 * Get rate limit info without consuming a request
 */
export function getRateLimitInfo(apiKey: ApiKey): ApiRateLimitInfo {
  const now = new Date();
  const windowKey = `${apiKey.id}:minute`;

  let window = rateLimitWindows.get(windowKey);
  if (!window || now > window.resetAt) {
    window = {
      count: 0,
      resetAt: new Date(now.getTime() + 60 * 1000),
    };
  }

  const monthlyUsage = getMonthlyUsage(apiKey.id);

  return {
    remaining: Math.max(0, apiKey.rateLimit - window.count),
    limit: apiKey.rateLimit,
    resetAt: window.resetAt,
    monthlyRemaining: Math.max(0, apiKey.monthlyLimit - monthlyUsage),
    monthlyLimit: apiKey.monthlyLimit,
  };
}

function getMonthlyUsage(keyId: string): number {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const keyUsage = apiKeyUsage.get(keyId);
  if (!keyUsage) return 0;

  let total = 0;
  for (const [date, usage] of keyUsage) {
    if (date >= monthStart) {
      total += usage.requestCount;
    }
  }

  return total;
}

// ============ Usage Tracking ============

/**
 * Record API usage for a key
 */
export function recordUsage(
  apiKey: ApiKey,
  type: 'request' | 'search' | 'export',
  bytes?: number
): void {
  const today = new Date().toISOString().split('T')[0];

  // Get or create usage map for this key
  let keyUsage = apiKeyUsage.get(apiKey.id);
  if (!keyUsage) {
    keyUsage = new Map();
    apiKeyUsage.set(apiKey.id, keyUsage);
  }

  // Get or create today's usage
  let todayUsage = keyUsage.get(today);
  if (!todayUsage) {
    todayUsage = {
      keyId: apiKey.id,
      date: today,
      requestCount: 0,
      searchCount: 0,
      exportCount: 0,
      bytesTransferred: 0,
    };
    keyUsage.set(today, todayUsage);
  }

  // Update counts
  todayUsage.requestCount++;
  if (type === 'search') todayUsage.searchCount++;
  if (type === 'export') todayUsage.exportCount++;
  if (bytes) todayUsage.bytesTransferred += bytes;

  // Update last used
  apiKey.lastUsedAt = new Date();
}

/**
 * Get usage statistics for a key
 */
export function getKeyUsage(keyId: string, days: number = 30): ApiKeyUsage[] {
  const keyUsage = apiKeyUsage.get(keyId);
  if (!keyUsage) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  return Array.from(keyUsage.values())
    .filter(u => u.date >= cutoffStr)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get aggregated usage statistics for a user
 */
export function getUserUsageStats(userId: string): {
  totalRequests: number;
  totalSearches: number;
  totalExports: number;
  totalBytes: number;
  byKey: Map<string, { name: string; requests: number }>;
} {
  const userKeys = getUserApiKeys(userId);
  let totalRequests = 0;
  let totalSearches = 0;
  let totalExports = 0;
  let totalBytes = 0;
  const byKey = new Map<string, { name: string; requests: number }>();

  for (const key of userKeys) {
    const keyUsageList = getKeyUsage(key.id);
    let keyTotal = 0;

    for (const usage of keyUsageList) {
      totalRequests += usage.requestCount;
      totalSearches += usage.searchCount;
      totalExports += usage.exportCount;
      totalBytes += usage.bytesTransferred;
      keyTotal += usage.requestCount;
    }

    byKey.set(key.id, { name: key.name, requests: keyTotal });
  }

  return { totalRequests, totalSearches, totalExports, totalBytes, byKey };
}

// ============ Webhooks ============

/**
 * Create a new webhook
 */
export function createWebhook(
  userId: string,
  url: string,
  events: WebhookEvent[]
): Webhook {
  const webhook: Webhook = {
    id: `wh_${Date.now()}_${randomBytes(4).toString('hex')}`,
    userId,
    url,
    events,
    secret: randomBytes(32).toString('hex'),
    isActive: true,
    createdAt: new Date(),
    lastTriggeredAt: null,
    failureCount: 0,
  };

  webhooks.set(webhook.id, webhook);
  return webhook;
}

/**
 * Get webhooks for a user
 */
export function getUserWebhooks(userId: string): Webhook[] {
  return Array.from(webhooks.values()).filter(wh => wh.userId === userId);
}

/**
 * Delete a webhook
 */
export function deleteWebhook(webhookId: string): boolean {
  return webhooks.delete(webhookId);
}

/**
 * Update webhook status
 */
export function updateWebhookStatus(
  webhookId: string,
  isActive: boolean
): boolean {
  const webhook = webhooks.get(webhookId);
  if (!webhook) return false;
  webhook.isActive = isActive;
  return true;
}

/**
 * Trigger webhooks for an event
 */
export async function triggerWebhooks(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const userWebhooks = getUserWebhooks(userId).filter(
    wh => wh.isActive && wh.events.includes(event)
  );

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const payloadStr = JSON.stringify(payload);

  for (const webhook of userWebhooks) {
    try {
      const signature = createHash('sha256')
        .update(webhook.secret + payloadStr)
        .digest('hex');

      await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
        },
        body: payloadStr,
      });

      webhook.lastTriggeredAt = new Date();
      webhook.failureCount = 0;
    } catch {
      webhook.failureCount++;

      // Disable webhook after too many failures
      if (webhook.failureCount >= 5) {
        webhook.isActive = false;
      }
    }
  }
}

// ============ Permission Checking ============

/**
 * Check if an API key has a specific permission
 */
export function hasPermission(apiKey: ApiKey, permission: ApiPermission): boolean {
  return apiKey.permissions.includes(permission);
}

/**
 * Require a permission, throw if not present
 */
export function requirePermission(apiKey: ApiKey, permission: ApiPermission): void {
  if (!hasPermission(apiKey, permission)) {
    throw new ApiPermissionError(permission);
  }
}

export class ApiPermissionError extends Error {
  permission: ApiPermission;

  constructor(permission: ApiPermission) {
    super(`Missing required permission: ${permission}`);
    this.permission = permission;
    this.name = 'ApiPermissionError';
  }
}

export class ApiRateLimitError extends Error {
  retryAfter: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`);
    this.retryAfter = retryAfterSeconds;
    this.name = 'ApiRateLimitError';
  }
}

// ============ Middleware Helpers ============

/**
 * Extract API key from request headers
 */
export function extractApiKey(headers: Headers): string | null {
  // Try Authorization header first
  const auth = headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.substring(7);
  }

  // Try X-API-Key header
  const xApiKey = headers.get('X-API-Key');
  if (xApiKey) {
    return xApiKey;
  }

  return null;
}

/**
 * Validate request and return API key
 * Throws appropriate errors if validation fails
 */
export function validateRequest(headers: Headers): {
  apiKey: ApiKey;
  rateLimitInfo: ApiRateLimitInfo;
} {
  const rawKey = extractApiKey(headers);
  if (!rawKey) {
    throw new Error('API key is required. Provide via Authorization: Bearer <key> or X-API-Key header.');
  }

  const apiKey = validateApiKey(rawKey);
  if (!apiKey) {
    throw new Error('Invalid or expired API key.');
  }

  const rateLimitInfo = checkRateLimit(apiKey);
  if (!rateLimitInfo) {
    const info = getRateLimitInfo(apiKey);
    const retryAfter = Math.ceil((info.resetAt.getTime() - Date.now()) / 1000);
    throw new ApiRateLimitError(retryAfter);
  }

  return { apiKey, rateLimitInfo };
}

// ============ OpenAPI Helpers ============

export function getApiInfo(): {
  version: string;
  title: string;
  description: string;
  endpoints: Array<{
    method: string;
    path: string;
    description: string;
    permission: ApiPermission;
  }>;
} {
  return {
    version: '1.0.0',
    title: 'LeadGenTool API',
    description: 'API for programmatic access to lead generation features',
    endpoints: [
      { method: 'POST', path: '/api/v1/search', description: 'Start a new lead search', permission: 'search:write' },
      { method: 'GET', path: '/api/v1/search/{id}', description: 'Get search status and results', permission: 'search:read' },
      { method: 'GET', path: '/api/v1/search', description: 'List all searches', permission: 'search:read' },
      { method: 'GET', path: '/api/v1/results/{id}', description: 'Get results for a search', permission: 'results:read' },
      { method: 'GET', path: '/api/v1/export/{id}', description: 'Export results as CSV/JSON', permission: 'export:read' },
      { method: 'POST', path: '/api/v1/webhooks', description: 'Create a webhook', permission: 'webhooks:write' },
      { method: 'GET', path: '/api/v1/webhooks', description: 'List webhooks', permission: 'webhooks:write' },
      { method: 'DELETE', path: '/api/v1/webhooks/{id}', description: 'Delete a webhook', permission: 'webhooks:write' },
      { method: 'GET', path: '/api/v1/usage', description: 'Get API usage statistics', permission: 'usage:read' },
    ],
  };
}

// ============ Testing Helpers ============

/**
 * Clear all API keys and usage (for testing)
 */
export function clearAllApiData(): void {
  apiKeys.clear();
  apiKeysByHash.clear();
  apiKeyUsage.clear();
  rateLimitWindows.clear();
  webhooks.clear();
}
