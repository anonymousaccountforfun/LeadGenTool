/**
 * Tests for Rate Limiting & Abuse Prevention Module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkIpRateLimit,
  checkUserRateLimit,
  checkFingerprintRateLimit,
  analyzeRequest,
  blockIp,
  blockUser,
  unblockIp,
  unblockUser,
  isIpBlocked,
  isUserBlocked,
  addBadActorPattern,
  matchesBadActorPattern,
  generateFingerprint,
  trackFingerprint,
  isFingerprintSuspicious,
  shouldRequireCaptcha,
  getRateLimitStats,
  getBlockedEntities,
  clearAllRateLimitData,
  RATE_LIMIT_TIERS,
} from '../rate-limit';

describe('Rate Limiting', () => {
  beforeEach(() => {
    clearAllRateLimitData();
  });

  describe('checkIpRateLimit', () => {
    it('should allow requests within limit', () => {
      const result = checkIpRateLimit('192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.remaining).toBe(RATE_LIMIT_TIERS.anonymous.requestsPerWindow - 1);
    });

    it('should track requests per IP', () => {
      // Make several requests
      for (let i = 0; i < 5; i++) {
        checkIpRateLimit('192.168.1.1');
      }

      const result = checkIpRateLimit('192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(RATE_LIMIT_TIERS.anonymous.requestsPerWindow - 6);
    });

    it('should deny requests over limit', () => {
      // Exhaust the limit
      const limit = RATE_LIMIT_TIERS.anonymous.requestsPerWindow;
      for (let i = 0; i < limit; i++) {
        checkIpRateLimit('192.168.1.2');
      }

      const result = checkIpRateLimit('192.168.1.2');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('should track different IPs separately', () => {
      // Exhaust limit for one IP
      const limit = RATE_LIMIT_TIERS.anonymous.requestsPerWindow;
      for (let i = 0; i < limit; i++) {
        checkIpRateLimit('192.168.1.1');
      }

      // Different IP should still work
      const result = checkIpRateLimit('192.168.1.2');

      expect(result.allowed).toBe(true);
    });

    it('should deny blocked IPs', () => {
      blockIp('192.168.1.1', 'Testing', 60000);

      const result = checkIpRateLimit('192.168.1.1');

      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe('Testing');
    });
  });

  describe('checkUserRateLimit', () => {
    it('should use free tier limits by default', () => {
      const result = checkUserRateLimit('user-1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(RATE_LIMIT_TIERS.free.requestsPerWindow - 1);
    });

    it('should use premium tier limits when specified', () => {
      const result = checkUserRateLimit('user-1', 'premium');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(RATE_LIMIT_TIERS.premium.requestsPerWindow - 1);
    });

    it('should use API tier limits when specified', () => {
      const result = checkUserRateLimit('user-1', 'api');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(RATE_LIMIT_TIERS.api.requestsPerWindow - 1);
    });

    it('should deny blocked users', () => {
      blockUser('user-1', 'Abuse detected', 60000);

      const result = checkUserRateLimit('user-1');

      expect(result.allowed).toBe(false);
      expect(result.blocked).toBe(true);
    });
  });

  describe('checkFingerprintRateLimit', () => {
    it('should track requests by fingerprint', () => {
      const fingerprint = 'abc123';

      const result1 = checkFingerprintRateLimit(fingerprint);
      const result2 = checkFingerprintRateLimit(fingerprint);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(result1.remaining - 1);
    });
  });

  describe('analyzeRequest', () => {
    it('should detect rapid requests', () => {
      const ip = '192.168.1.1';

      // Make rapid requests
      for (let i = 0; i < 15; i++) {
        checkIpRateLimit(ip);
      }

      const result = analyzeRequest(ip, null, {
        path: '/api/search',
        method: 'GET',
      });

      expect(result.suspicious).toBe(true);
      expect(result.activities.some(a => a.type === 'rapid_requests')).toBe(true);
    });

    it('should detect suspicious user agents', () => {
      const result = analyzeRequest('192.168.1.1', null, {
        path: '/api/search',
        method: 'GET',
        userAgent: 'Mozilla/5.0 (compatible; scrapy/2.0)',
      });

      expect(result.suspicious).toBe(true);
      expect(result.activities.some(a => a.type === 'scraping')).toBe(true);
    });

    it('should detect invalid input patterns', () => {
      const result = analyzeRequest('192.168.1.1', null, {
        path: '/api/search',
        method: 'POST',
        body: { query: '<script>alert(1)</script>' },
      });

      expect(result.suspicious).toBe(true);
      expect(result.activities.some(a => a.type === 'invalid_inputs')).toBe(true);
    });

    it('should not flag normal requests', () => {
      const result = analyzeRequest('192.168.1.1', null, {
        path: '/api/search',
        method: 'GET',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        query: { q: 'dentists in San Francisco' },
      });

      expect(result.suspicious).toBe(false);
      expect(result.activities.length).toBe(0);
    });
  });

  describe('Blocking', () => {
    describe('blockIp', () => {
      it('should block an IP address', () => {
        blockIp('192.168.1.1', 'Abuse', 60000);

        const status = isIpBlocked('192.168.1.1');

        expect(status.blocked).toBe(true);
        expect(status.reason).toBe('Abuse');
      });

      it('should support permanent blocks', () => {
        blockIp('192.168.1.1', 'Permanent ban', 0, true);

        const status = isIpBlocked('192.168.1.1');

        expect(status.blocked).toBe(true);
        // Permanent block should have expiry far in future
        expect(status.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 364 * 24 * 60 * 60 * 1000);
      });
    });

    describe('unblockIp', () => {
      it('should unblock an IP address', () => {
        blockIp('192.168.1.1', 'Test');
        unblockIp('192.168.1.1');

        const status = isIpBlocked('192.168.1.1');

        expect(status.blocked).toBe(false);
      });

      it('should return false for non-blocked IP', () => {
        const result = unblockIp('192.168.1.99');

        expect(result).toBe(false);
      });
    });

    describe('blockUser', () => {
      it('should block a user', () => {
        blockUser('user-1', 'Suspicious activity');

        const status = isUserBlocked('user-1');

        expect(status.blocked).toBe(true);
      });
    });

    describe('unblockUser', () => {
      it('should unblock a user', () => {
        blockUser('user-1', 'Test');
        unblockUser('user-1');

        const status = isUserBlocked('user-1');

        expect(status.blocked).toBe(false);
      });
    });
  });

  describe('Bad Actor Patterns', () => {
    it('should add and match bad actor patterns', () => {
      addBadActorPattern('suspicious-fingerprint-123');

      expect(matchesBadActorPattern('suspicious-fingerprint-123')).toBe(true);
      expect(matchesBadActorPattern('normal-fingerprint-456')).toBe(false);
    });
  });

  describe('Fingerprinting', () => {
    describe('generateFingerprint', () => {
      it('should generate a fingerprint from headers', () => {
        const fingerprint = generateFingerprint({
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          acceptLanguage: 'en-US',
          acceptEncoding: 'gzip',
        });

        expect(fingerprint.hash).toHaveLength(16);
        expect(fingerprint.ip).toBe('192.168.1.1');
        expect(fingerprint.userAgent).toBe('Mozilla/5.0');
      });

      it('should generate consistent fingerprints for same inputs', () => {
        const fp1 = generateFingerprint({ ip: '1.1.1.1', userAgent: 'test' });
        const fp2 = generateFingerprint({ ip: '1.1.1.1', userAgent: 'test' });

        expect(fp1.hash).toBe(fp2.hash);
      });

      it('should generate different fingerprints for different inputs', () => {
        const fp1 = generateFingerprint({ ip: '1.1.1.1', userAgent: 'test' });
        const fp2 = generateFingerprint({ ip: '2.2.2.2', userAgent: 'test' });

        expect(fp1.hash).not.toBe(fp2.hash);
      });
    });

    describe('trackFingerprint', () => {
      it('should track fingerprint with user association', () => {
        const fp = generateFingerprint({ ip: '1.1.1.1', userAgent: 'test' });

        trackFingerprint(fp, 'user-1');
        trackFingerprint(fp, 'user-1');

        // Should not be suspicious with just 2 requests
        expect(isFingerprintSuspicious(fp)).toBe(false);
      });
    });

    describe('isFingerprintSuspicious', () => {
      it('should detect bad actor fingerprints', () => {
        const fp = generateFingerprint({ ip: '1.1.1.1', userAgent: 'test' });

        addBadActorPattern(fp.hash);

        expect(isFingerprintSuspicious(fp)).toBe(true);
      });
    });
  });

  describe('CAPTCHA Requirement', () => {
    it('should not require CAPTCHA for normal requests', () => {
      const result = shouldRequireCaptcha('192.168.1.1', null);

      expect(result.required).toBe(false);
    });

    it('should require CAPTCHA when approaching rate limit', () => {
      const ip = '192.168.1.1';
      const limit = RATE_LIMIT_TIERS.anonymous.requestsPerWindow;

      // Get close to the limit
      for (let i = 0; i < limit - 2; i++) {
        checkIpRateLimit(ip);
      }

      const result = shouldRequireCaptcha(ip, null);

      expect(result.required).toBe(true);
      expect(result.reason).toBe('Approaching rate limit');
    });
  });

  describe('Statistics', () => {
    describe('getRateLimitStats', () => {
      it('should return stats', () => {
        // Create some activity
        checkIpRateLimit('192.168.1.1');
        checkUserRateLimit('user-1');
        blockIp('192.168.1.2', 'Test');

        const stats = getRateLimitStats();

        expect(stats.blockedIps).toBe(1);
        expect(stats.activeWindows).toBeGreaterThanOrEqual(2);
      });
    });

    describe('getBlockedEntities', () => {
      it('should return blocked IPs and users', () => {
        blockIp('192.168.1.1', 'IP ban');
        blockUser('user-1', 'User ban');

        const entities = getBlockedEntities();

        expect(entities.ips.length).toBe(1);
        expect(entities.ips[0].ip).toBe('192.168.1.1');
        expect(entities.users.length).toBe(1);
        expect(entities.users[0].userId).toBe('user-1');
      });
    });
  });

  describe('RATE_LIMIT_TIERS', () => {
    it('should have configured tiers', () => {
      expect(RATE_LIMIT_TIERS.anonymous).toBeDefined();
      expect(RATE_LIMIT_TIERS.free).toBeDefined();
      expect(RATE_LIMIT_TIERS.premium).toBeDefined();
      expect(RATE_LIMIT_TIERS.api).toBeDefined();
    });

    it('should have increasing limits by tier', () => {
      expect(RATE_LIMIT_TIERS.free.requestsPerWindow).toBeGreaterThan(
        RATE_LIMIT_TIERS.anonymous.requestsPerWindow
      );
      expect(RATE_LIMIT_TIERS.premium.requestsPerWindow).toBeGreaterThan(
        RATE_LIMIT_TIERS.free.requestsPerWindow
      );
    });
  });
});
