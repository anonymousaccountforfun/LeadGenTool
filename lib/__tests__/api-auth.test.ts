/**
 * Tests for API Authentication and Rate Limiting Module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateApiKey,
  validateApiKey,
  revokeApiKey,
  deleteApiKey,
  getUserApiKeys,
  checkRateLimit,
  getRateLimitInfo,
  recordUsage,
  getKeyUsage,
  getUserUsageStats,
  createWebhook,
  getUserWebhooks,
  deleteWebhook,
  updateWebhookStatus,
  hasPermission,
  requirePermission,
  extractApiKey,
  validateRequest,
  clearAllApiData,
  ApiPermissionError,
  ApiRateLimitError,
  type ApiPermission,
} from '../api-auth';

describe('API Authentication', () => {
  beforeEach(() => {
    clearAllApiData();
  });

  describe('generateApiKey', () => {
    it('should generate a new API key', () => {
      const { key, apiKey } = generateApiKey('user-1', 'Test Key');

      expect(key).toMatch(/^lgk_[a-f0-9]{64}$/);
      expect(apiKey.id).toMatch(/^key_/);
      expect(apiKey.userId).toBe('user-1');
      expect(apiKey.name).toBe('Test Key');
      expect(apiKey.isActive).toBe(true);
      expect(apiKey.keyPrefix).toBe(key.substring(0, 12));
    });

    it('should use default permissions', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key');

      expect(apiKey.permissions).toContain('search:read');
      expect(apiKey.permissions).toContain('results:read');
      expect(apiKey.permissions.length).toBe(2);
    });

    it('should accept custom permissions', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key', {
        permissions: ['search:write', 'export:read', 'webhooks:write'],
      });

      expect(apiKey.permissions).toContain('search:write');
      expect(apiKey.permissions).toContain('export:read');
      expect(apiKey.permissions).toContain('webhooks:write');
    });

    it('should use default rate limits', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key');

      expect(apiKey.rateLimit).toBe(60);
      expect(apiKey.monthlyLimit).toBe(10000);
    });

    it('should accept custom rate limits', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key', {
        rateLimit: 100,
        monthlyLimit: 50000,
      });

      expect(apiKey.rateLimit).toBe(100);
      expect(apiKey.monthlyLimit).toBe(50000);
    });

    it('should accept expiration', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key', {
        expiresInDays: 30,
      });

      expect(apiKey.expiresAt).toBeDefined();
      const expectedExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
      expect(apiKey.expiresAt!.getTime()).toBeCloseTo(expectedExpiry, -3);
    });
  });

  describe('validateApiKey', () => {
    it('should validate a valid key', () => {
      const { key, apiKey } = generateApiKey('user-1', 'Test Key');

      const validated = validateApiKey(key);

      expect(validated).not.toBeNull();
      expect(validated!.id).toBe(apiKey.id);
    });

    it('should return null for invalid key', () => {
      expect(validateApiKey('invalid-key')).toBeNull();
      expect(validateApiKey('lgk_0000000000000000000000000000000000000000000000000000000000000000')).toBeNull();
    });

    it('should return null for keys without correct prefix', () => {
      expect(validateApiKey('abc_123456')).toBeNull();
    });

    it('should return null for revoked keys', () => {
      const { key, apiKey } = generateApiKey('user-1', 'Test Key');
      revokeApiKey(apiKey.id);

      expect(validateApiKey(key)).toBeNull();
    });

    it('should return null for expired keys', () => {
      const { key, apiKey } = generateApiKey('user-1', 'Test Key', {
        expiresInDays: -1, // Already expired
      });

      // Manually set expiry to past
      apiKey.expiresAt = new Date(Date.now() - 1000);

      expect(validateApiKey(key)).toBeNull();
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke an API key', () => {
      const { key, apiKey } = generateApiKey('user-1', 'Test Key');

      expect(revokeApiKey(apiKey.id)).toBe(true);
      expect(validateApiKey(key)).toBeNull();
    });

    it('should return false for non-existent key', () => {
      expect(revokeApiKey('non-existent')).toBe(false);
    });
  });

  describe('deleteApiKey', () => {
    it('should delete an API key', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key');

      expect(deleteApiKey(apiKey.id)).toBe(true);
      expect(getUserApiKeys('user-1').length).toBe(0);
    });

    it('should return false for non-existent key', () => {
      expect(deleteApiKey('non-existent')).toBe(false);
    });
  });

  describe('getUserApiKeys', () => {
    it('should return all keys for a user', () => {
      generateApiKey('user-1', 'Key 1');
      generateApiKey('user-1', 'Key 2');
      generateApiKey('user-2', 'Other User Key');

      const keys = getUserApiKeys('user-1');

      expect(keys.length).toBe(2);
      expect(keys.every(k => k.userId === 'user-1')).toBe(true);
    });

    it('should return empty array for user with no keys', () => {
      expect(getUserApiKeys('no-keys-user')).toEqual([]);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key', {
        rateLimit: 10,
      });

      const result = checkRateLimit(apiKey);

      expect(result).not.toBeNull();
      expect(result!.remaining).toBe(9);
      expect(result!.limit).toBe(10);
    });

    it('should return null when limit exceeded', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key', {
        rateLimit: 2,
      });

      checkRateLimit(apiKey);
      checkRateLimit(apiKey);
      const result = checkRateLimit(apiKey);

      expect(result).toBeNull();
    });

    it('should include monthly limit info', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key', {
        monthlyLimit: 1000,
      });

      const result = checkRateLimit(apiKey);

      expect(result!.monthlyLimit).toBe(1000);
      expect(result!.monthlyRemaining).toBe(999);
    });
  });

  describe('getRateLimitInfo', () => {
    it('should return rate limit info without consuming request', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key', {
        rateLimit: 10,
      });

      const info1 = getRateLimitInfo(apiKey);
      const info2 = getRateLimitInfo(apiKey);

      expect(info1.remaining).toBe(10);
      expect(info2.remaining).toBe(10);
    });
  });

  describe('recordUsage', () => {
    it('should record request usage', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key');

      recordUsage(apiKey, 'request');
      recordUsage(apiKey, 'request');

      const usage = getKeyUsage(apiKey.id, 1);
      expect(usage[0].requestCount).toBe(2);
    });

    it('should record search usage', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key');

      recordUsage(apiKey, 'search');

      const usage = getKeyUsage(apiKey.id, 1);
      expect(usage[0].searchCount).toBe(1);
      expect(usage[0].requestCount).toBe(1);
    });

    it('should record export usage', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key');

      recordUsage(apiKey, 'export', 1024);

      const usage = getKeyUsage(apiKey.id, 1);
      expect(usage[0].exportCount).toBe(1);
      expect(usage[0].bytesTransferred).toBe(1024);
    });

    it('should update lastUsedAt', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key');
      expect(apiKey.lastUsedAt).toBeNull();

      recordUsage(apiKey, 'request');

      expect(apiKey.lastUsedAt).not.toBeNull();
    });
  });

  describe('getUserUsageStats', () => {
    it('should aggregate usage across keys', () => {
      const { apiKey: key1 } = generateApiKey('user-1', 'Key 1');
      const { apiKey: key2 } = generateApiKey('user-1', 'Key 2');

      recordUsage(key1, 'request');
      recordUsage(key1, 'search');
      recordUsage(key2, 'request');
      recordUsage(key2, 'export', 2048);

      const stats = getUserUsageStats('user-1');

      expect(stats.totalRequests).toBe(4);
      expect(stats.totalSearches).toBe(1);
      expect(stats.totalExports).toBe(1);
      expect(stats.totalBytes).toBe(2048);
    });
  });

  describe('Webhooks', () => {
    it('should create a webhook', () => {
      const webhook = createWebhook('user-1', 'https://example.com/hook', ['search.completed']);

      expect(webhook.id).toMatch(/^wh_/);
      expect(webhook.userId).toBe('user-1');
      expect(webhook.url).toBe('https://example.com/hook');
      expect(webhook.events).toContain('search.completed');
      expect(webhook.secret.length).toBe(64);
      expect(webhook.isActive).toBe(true);
    });

    it('should list user webhooks', () => {
      createWebhook('user-1', 'https://example.com/hook1', ['search.completed']);
      createWebhook('user-1', 'https://example.com/hook2', ['search.failed']);
      createWebhook('user-2', 'https://other.com/hook', ['export.ready']);

      const webhooks = getUserWebhooks('user-1');

      expect(webhooks.length).toBe(2);
      expect(webhooks.every(w => w.userId === 'user-1')).toBe(true);
    });

    it('should delete a webhook', () => {
      const webhook = createWebhook('user-1', 'https://example.com/hook', ['search.completed']);

      expect(deleteWebhook(webhook.id)).toBe(true);
      expect(getUserWebhooks('user-1').length).toBe(0);
    });

    it('should update webhook status', () => {
      const webhook = createWebhook('user-1', 'https://example.com/hook', ['search.completed']);

      updateWebhookStatus(webhook.id, false);

      expect(webhook.isActive).toBe(false);
    });
  });

  describe('Permission Checking', () => {
    it('should check if key has permission', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key', {
        permissions: ['search:read', 'export:read'],
      });

      expect(hasPermission(apiKey, 'search:read')).toBe(true);
      expect(hasPermission(apiKey, 'export:read')).toBe(true);
      expect(hasPermission(apiKey, 'search:write')).toBe(false);
    });

    it('should throw error for missing permission', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key', {
        permissions: ['search:read'],
      });

      expect(() => requirePermission(apiKey, 'search:write'))
        .toThrow(ApiPermissionError);
    });

    it('should not throw for valid permission', () => {
      const { apiKey } = generateApiKey('user-1', 'Test Key', {
        permissions: ['search:read'],
      });

      expect(() => requirePermission(apiKey, 'search:read')).not.toThrow();
    });
  });

  describe('extractApiKey', () => {
    it('should extract from Authorization header', () => {
      const headers = new Headers({
        'Authorization': 'Bearer lgk_test123',
      });

      expect(extractApiKey(headers)).toBe('lgk_test123');
    });

    it('should extract from X-API-Key header', () => {
      const headers = new Headers({
        'X-API-Key': 'lgk_test456',
      });

      expect(extractApiKey(headers)).toBe('lgk_test456');
    });

    it('should prefer Authorization header', () => {
      const headers = new Headers({
        'Authorization': 'Bearer lgk_from_auth',
        'X-API-Key': 'lgk_from_header',
      });

      expect(extractApiKey(headers)).toBe('lgk_from_auth');
    });

    it('should return null when no key present', () => {
      const headers = new Headers({});
      expect(extractApiKey(headers)).toBeNull();
    });
  });

  describe('validateRequest', () => {
    it('should validate valid request', () => {
      const { key } = generateApiKey('user-1', 'Test Key');
      const headers = new Headers({
        'Authorization': `Bearer ${key}`,
      });

      const result = validateRequest(headers);

      expect(result.apiKey).toBeDefined();
      expect(result.rateLimitInfo).toBeDefined();
    });

    it('should throw for missing key', () => {
      const headers = new Headers({});

      expect(() => validateRequest(headers)).toThrow('API key is required');
    });

    it('should throw for invalid key', () => {
      const headers = new Headers({
        'Authorization': 'Bearer lgk_invalid',
      });

      expect(() => validateRequest(headers)).toThrow('Invalid or expired API key');
    });

    it('should throw for rate limited key', () => {
      const { key, apiKey } = generateApiKey('user-1', 'Test Key', {
        rateLimit: 1,
      });
      const headers = new Headers({
        'Authorization': `Bearer ${key}`,
      });

      // Use up the rate limit
      checkRateLimit(apiKey);

      expect(() => validateRequest(headers)).toThrow(ApiRateLimitError);
    });
  });
});
