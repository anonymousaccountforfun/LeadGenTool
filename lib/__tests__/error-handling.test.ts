/**
 * Tests for Graceful Error Handling Module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  withRetry,
  isRetryableError,
  isCircuitOpen,
  recordSuccess,
  recordFailure,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
  getAllCircuitBreakerStatuses,
  withPartialResults,
  toFriendlyError,
  getRetrySuggestions,
  withGracefulHandling,
  clearAllErrorHandlingState,
  PartialResultsError,
  CircuitBreakerError,
  type FriendlyError,
} from '../error-handling';

describe('Error Handling', () => {
  beforeEach(() => {
    clearAllErrorHandlingState();
    vi.clearAllMocks();
  });

  describe('isRetryableError', () => {
    it('should identify network errors as retryable', () => {
      expect(isRetryableError(new Error('Network error'))).toBe(true);
      expect(isRetryableError(new Error('fetch failed'))).toBe(true);
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
      expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isRetryableError(new Error('socket hang up'))).toBe(true);
    });

    it('should identify timeout errors as retryable', () => {
      expect(isRetryableError(new Error('Request timeout'))).toBe(true);
      expect(isRetryableError(new Error('Operation timed out'))).toBe(true);
      const timeoutError = new Error('Timeout');
      timeoutError.name = 'TimeoutError';
      expect(isRetryableError(timeoutError)).toBe(true);
    });

    it('should identify rate limit errors as retryable', () => {
      expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
      expect(isRetryableError(new Error('Too many requests'))).toBe(true);
      expect(isRetryableError(new Error('429 Too Many Requests'))).toBe(true);
      expect(isRetryableError(new Error('Quota exceeded'))).toBe(true);
    });

    it('should identify server errors as retryable', () => {
      expect(isRetryableError(new Error('500 Internal Server Error'))).toBe(true);
      expect(isRetryableError(new Error('502 Bad Gateway'))).toBe(true);
      expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
      expect(isRetryableError(new Error('504 Gateway Timeout'))).toBe(true);
    });

    it('should identify browser/playwright errors as retryable', () => {
      expect(isRetryableError(new Error('Page crashed'))).toBe(true);
      expect(isRetryableError(new Error('Target closed'))).toBe(true);
      expect(isRetryableError(new Error('Navigation failed'))).toBe(true);
      expect(isRetryableError(new Error('Frame detached'))).toBe(true);
    });

    it('should not identify validation errors as retryable', () => {
      expect(isRetryableError(new Error('Invalid input'))).toBe(false);
      expect(isRetryableError(new Error('Bad request'))).toBe(false);
      expect(isRetryableError(new Error('Missing required field'))).toBe(false);
    });

    it('should not identify auth errors as retryable', () => {
      expect(isRetryableError(new Error('Unauthorized'))).toBe(false);
      expect(isRetryableError(new Error('Invalid API key'))).toBe(false);
      expect(isRetryableError(new Error('Permission denied'))).toBe(false);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first try', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { initialDelayMs: 10, maxRetries: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should respect maxRetries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        withRetry(fn, { maxRetries: 2, initialDelayMs: 10 })
      ).rejects.toThrow('Network error');

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Invalid input'));

      await expect(
        withRetry(fn, { maxRetries: 3, initialDelayMs: 10 })
      ).rejects.toThrow('Invalid input');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue('success');
      const onRetry = vi.fn();

      await withRetry(fn, { initialDelayMs: 10, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.any(Error),
        1,
        expect.any(Number)
      );
    });

    it('should use custom shouldRetry function', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Custom error'))
        .mockResolvedValue('success');
      const shouldRetry = vi.fn().mockReturnValue(true);

      await withRetry(fn, { initialDelayMs: 10, shouldRetry });

      expect(fn).toHaveBeenCalledTimes(2);
      expect(shouldRetry).toHaveBeenCalled();
    });

    it('should apply exponential backoff', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');
      const onRetry = vi.fn();

      await withRetry(fn, {
        initialDelayMs: 100,
        backoffMultiplier: 2,
        onRetry,
      });

      // First retry delay should be ~100ms (with jitter)
      // Second retry delay should be ~200ms (with jitter)
      expect(onRetry).toHaveBeenCalledTimes(2);
      const firstDelay = onRetry.mock.calls[0][2];
      const secondDelay = onRetry.mock.calls[1][2];
      expect(secondDelay).toBeGreaterThan(firstDelay);
    });
  });

  describe('Circuit Breaker', () => {
    describe('isCircuitOpen', () => {
      it('should start with closed circuit', () => {
        expect(isCircuitOpen('test-source')).toBe(false);
      });

      it('should open circuit after threshold failures', () => {
        for (let i = 0; i < 5; i++) {
          recordFailure('test-source', { failureThreshold: 5 });
        }

        expect(isCircuitOpen('test-source')).toBe(true);
      });

      it('should not open circuit before threshold', () => {
        for (let i = 0; i < 4; i++) {
          recordFailure('test-source', { failureThreshold: 5 });
        }

        expect(isCircuitOpen('test-source')).toBe(false);
      });

      it('should track different sources independently', () => {
        for (let i = 0; i < 5; i++) {
          recordFailure('source-a', { failureThreshold: 5 });
        }

        expect(isCircuitOpen('source-a')).toBe(true);
        expect(isCircuitOpen('source-b')).toBe(false);
      });
    });

    describe('recordSuccess', () => {
      it('should reset failure count on success', () => {
        recordFailure('test-source', { failureThreshold: 5 });
        recordFailure('test-source', { failureThreshold: 5 });
        recordSuccess('test-source');

        const status = getCircuitBreakerStatus('test-source');
        expect(status.failures).toBe(0);
      });

      it('should transition from half-open to closed after enough successes', () => {
        // Open the circuit
        for (let i = 0; i < 5; i++) {
          recordFailure('test-source', { failureThreshold: 5, resetTimeoutMs: 0 });
        }

        // Allow transition to half-open
        isCircuitOpen('test-source', { resetTimeoutMs: 0 });

        // Record successes
        recordSuccess('test-source', { halfOpenRequests: 2 });
        expect(getCircuitBreakerStatus('test-source').state).toBe('half-open');

        recordSuccess('test-source', { halfOpenRequests: 2 });
        expect(getCircuitBreakerStatus('test-source').state).toBe('closed');
      });
    });

    describe('recordFailure', () => {
      it('should increment failure count', () => {
        recordFailure('test-source');
        recordFailure('test-source');

        const status = getCircuitBreakerStatus('test-source');
        expect(status.failures).toBe(2);
      });

      it('should reopen circuit from half-open on failure', () => {
        // Open the circuit
        for (let i = 0; i < 5; i++) {
          recordFailure('test-source', { failureThreshold: 5, resetTimeoutMs: 0 });
        }

        // Allow transition to half-open
        isCircuitOpen('test-source', { resetTimeoutMs: 0 });
        expect(getCircuitBreakerStatus('test-source').state).toBe('half-open');

        // Any failure reopens
        recordFailure('test-source');
        expect(getCircuitBreakerStatus('test-source').state).toBe('open');
      });

      it('should call onStateChange when opening circuit', () => {
        const onStateChange = vi.fn();

        for (let i = 0; i < 5; i++) {
          recordFailure('test-source', { failureThreshold: 5, onStateChange });
        }

        expect(onStateChange).toHaveBeenCalledWith('test-source', 'open');
      });
    });

    describe('getCircuitBreakerStatus', () => {
      it('should return initial state for new source', () => {
        const status = getCircuitBreakerStatus('new-source');

        expect(status.state).toBe('closed');
        expect(status.failures).toBe(0);
        expect(status.lastFailureTime).toBeNull();
      });

      it('should calculate next retry time for open circuit', () => {
        for (let i = 0; i < 5; i++) {
          recordFailure('test-source', { failureThreshold: 5 });
        }

        const status = getCircuitBreakerStatus('test-source', { resetTimeoutMs: 60000 });

        expect(status.nextRetryTime).not.toBeNull();
        expect(status.nextRetryTime!.getTime()).toBeGreaterThan(Date.now());
      });
    });

    describe('resetCircuitBreaker', () => {
      it('should reset a specific circuit breaker', () => {
        for (let i = 0; i < 5; i++) {
          recordFailure('test-source', { failureThreshold: 5 });
        }
        expect(isCircuitOpen('test-source')).toBe(true);

        resetCircuitBreaker('test-source');

        expect(isCircuitOpen('test-source')).toBe(false);
      });
    });

    describe('getAllCircuitBreakerStatuses', () => {
      it('should return all circuit breakers', () => {
        recordFailure('source-a');
        recordFailure('source-b');

        const statuses = getAllCircuitBreakerStatuses();

        expect(Object.keys(statuses)).toContain('source-a');
        expect(Object.keys(statuses)).toContain('source-b');
      });
    });
  });

  describe('Partial Results', () => {
    describe('withPartialResults', () => {
      it('should aggregate results from all sources', async () => {
        const sources = [
          { name: 'source-a', execute: async () => [1, 2] },
          { name: 'source-b', execute: async () => [3, 4] },
        ];

        const result = await withPartialResults(sources);

        expect(result.data).toContain(1);
        expect(result.data).toContain(2);
        expect(result.data).toContain(3);
        expect(result.data).toContain(4);
        expect(result.successfulSources).toBe(2);
      });

      it('should handle partial failures', async () => {
        const sources = [
          { name: 'source-a', execute: async () => [1, 2] },
          { name: 'source-b', execute: async () => { throw new Error('Failed'); } },
        ];

        const result = await withPartialResults(sources);

        expect(result.data).toEqual([1, 2]);
        expect(result.successfulSources).toBe(1);
        expect(result.failedSources).toContain('source-b');
        expect(result.partialFailure).toBe(true);
      });

      it('should throw when below minimum sources', async () => {
        const sources = [
          { name: 'source-a', execute: async () => { throw new Error('Failed'); } },
          { name: 'source-b', execute: async () => { throw new Error('Failed'); } },
        ];

        await expect(
          withPartialResults(sources, { minSuccessfulSources: 1 })
        ).rejects.toThrow(PartialResultsError);
      });

      it('should throw when required source fails', async () => {
        const sources = [
          { name: 'source-a', execute: async () => [1], required: true },
          { name: 'source-b', execute: async () => [2] },
        ];

        // Make required source fail
        sources[0].execute = async () => { throw new Error('Required failed'); };

        await expect(withPartialResults(sources)).rejects.toThrow(PartialResultsError);
      });

      it('should respect circuit breakers', async () => {
        // Open circuit for source-a
        for (let i = 0; i < 5; i++) {
          recordFailure('source-a', { failureThreshold: 5 });
        }

        const sources = [
          { name: 'source-a', execute: async () => [1] },
          { name: 'source-b', execute: async () => [2] },
        ];

        const result = await withPartialResults(sources);

        expect(result.successfulSources).toBe(1);
        expect(result.failedSources).toContain('source-a');
      });

      it('should retry failed operations', async () => {
        let attempts = 0;
        const sources = [
          {
            name: 'source-a',
            execute: async () => {
              attempts++;
              if (attempts < 2) throw new Error('Network error');
              return [1];
            },
          },
        ];

        const result = await withPartialResults(sources, {
          retryOptions: { maxRetries: 2, initialDelayMs: 10 },
        });

        expect(result.data).toEqual([1]);
        expect(attempts).toBe(2);
      });
    });
  });

  describe('User-Friendly Errors', () => {
    describe('toFriendlyError', () => {
      it('should handle rate limit errors', () => {
        const error = new Error('Rate limit exceeded, wait 60 seconds');
        const friendly = toFriendlyError(error);

        expect(friendly.title).toBe('Rate Limit Reached');
        expect(friendly.recoverable).toBe(true);
        expect(friendly.suggestions.some(s => s.type === 'wait')).toBe(true);
      });

      it('should handle network errors', () => {
        const error = new Error('fetch failed');
        const friendly = toFriendlyError(error);

        expect(friendly.title).toBe('Connection Error');
        expect(friendly.recoverable).toBe(true);
        expect(friendly.suggestions.some(s => s.type === 'retry')).toBe(true);
      });

      it('should handle timeout errors', () => {
        const error = new Error('Request timed out');
        const friendly = toFriendlyError(error);

        expect(friendly.title).toBe('Request Timed Out');
        expect(friendly.recoverable).toBe(true);
      });

      it('should handle API key errors', () => {
        const error = new Error('Invalid API key');
        const friendly = toFriendlyError(error);

        expect(friendly.title).toBe('Authentication Error');
        expect(friendly.recoverable).toBe(false);
      });

      it('should handle quota errors', () => {
        const error = new Error('Quota limit exceeded');
        const friendly = toFriendlyError(error);

        expect(friendly.title).toBe('Quota Exhausted');
        expect(friendly.suggestions.some(s => s.type === 'alternative')).toBe(true);
      });

      it('should handle server errors', () => {
        const error = new Error('500 Internal Server Error');
        const friendly = toFriendlyError(error);

        expect(friendly.title).toBe('Server Error');
        expect(friendly.recoverable).toBe(true);
      });

      it('should handle partial results errors', () => {
        const partialResults = {
          data: [1, 2],
          totalSources: 3,
          successfulSources: 2,
          failedSources: ['source-c'],
          partialFailure: true,
          errors: [{ source: 'source-c', error: 'Failed' }],
        };
        const error = new PartialResultsError('Partial failure', partialResults);
        const friendly = toFriendlyError(error);

        expect(friendly.title).toBe('Partial Results');
        expect(friendly.message).toContain('2/3');
        expect(friendly.suggestions.some(s => s.actionLabel === 'Use Partial Results')).toBe(true);
      });

      it('should handle no results found', () => {
        const error = new Error('No results found');
        const friendly = toFriendlyError(error, 'dentists in NYC');

        expect(friendly.title).toBe('No Results Found');
        expect(friendly.message).toContain('dentists in NYC');
        expect(friendly.suggestions.some(s => s.type === 'modify')).toBe(true);
      });

      it('should handle unknown errors', () => {
        const error = new Error('Something unexpected');
        const friendly = toFriendlyError(error);

        expect(friendly.title).toBe('Something Went Wrong');
        expect(friendly.technical).toBe('Something unexpected');
      });
    });

    describe('getRetrySuggestions', () => {
      it('should suggest reducing limit for timeouts', () => {
        const error = new Error('Request timed out');
        const suggestions = getRetrySuggestions(error, { limit: 100 });

        expect(suggestions.some(s => s.actionData?.limit === 20)).toBe(true);
      });

      it('should suggest broader location for no results', () => {
        const error = new Error('No results found');
        const suggestions = getRetrySuggestions(error, { location: 'San Francisco, CA' });

        expect(suggestions.some(s => s.type === 'modify')).toBe(true);
      });

      it('should suggest alternative sources when some fail', () => {
        const error = new Error('Some sources failed');
        const suggestions = getRetrySuggestions(error, { failedSources: ['BBB'] });

        expect(suggestions.some(s => s.type === 'alternative')).toBe(true);
      });

      it('should always include retry option', () => {
        const error = new Error('Any error');
        const suggestions = getRetrySuggestions(error);

        expect(suggestions.some(s => s.type === 'retry')).toBe(true);
      });
    });
  });

  describe('withGracefulHandling', () => {
    it('should wrap function with retry and circuit breaker', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 2) throw new Error('Network error');
        return 'success';
      };

      const wrapped = withGracefulHandling(fn, {
        source: 'test',
        retryOptions: { maxRetries: 2, initialDelayMs: 10 },
      });

      const result = await wrapped();

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should check circuit breaker before executing', async () => {
      // Open circuit
      for (let i = 0; i < 5; i++) {
        recordFailure('test-source', { failureThreshold: 5 });
      }

      const fn = vi.fn().mockResolvedValue('success');
      const wrapped = withGracefulHandling(fn, { source: 'test-source' });

      await expect(wrapped()).rejects.toThrow(CircuitBreakerError);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should call onError callback', async () => {
      const fn = async () => { throw new Error('Test error'); };
      const onError = vi.fn();

      const wrapped = withGracefulHandling(fn, {
        retryOptions: { maxRetries: 0 },
        onError,
      });

      await expect(wrapped()).rejects.toThrow();
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0]).toHaveProperty('title');
    });

    it('should record success to circuit breaker', async () => {
      const fn = async () => 'success';
      const wrapped = withGracefulHandling(fn, { source: 'test-source' });

      await wrapped();

      const status = getCircuitBreakerStatus('test-source');
      expect(status.failures).toBe(0);
    });

    it('should record failure to circuit breaker', async () => {
      const fn = async () => { throw new Error('Test error'); };
      const wrapped = withGracefulHandling(fn, {
        source: 'test-source',
        retryOptions: { maxRetries: 0 },
      });

      await expect(wrapped()).rejects.toThrow();

      const status = getCircuitBreakerStatus('test-source');
      expect(status.failures).toBe(1);
    });
  });

  describe('Error Classes', () => {
    describe('PartialResultsError', () => {
      it('should store partial results', () => {
        const partialResults = {
          data: [1, 2],
          totalSources: 3,
          successfulSources: 2,
          failedSources: ['c'],
          partialFailure: true,
          errors: [],
        };

        const error = new PartialResultsError('Test', partialResults);

        expect(error.name).toBe('PartialResultsError');
        expect(error.partialResults).toBe(partialResults);
      });
    });

    describe('CircuitBreakerError', () => {
      it('should store source and status', () => {
        const status = {
          state: 'open' as const,
          failures: 5,
          lastFailureTime: new Date(),
          successCount: 0,
          nextRetryTime: new Date(Date.now() + 60000),
        };

        const error = new CircuitBreakerError('test-source', status);

        expect(error.name).toBe('CircuitBreakerError');
        expect(error.source).toBe('test-source');
        expect(error.status).toBe(status);
      });
    });
  });

  describe('clearAllErrorHandlingState', () => {
    it('should clear all circuit breakers', () => {
      recordFailure('source-a');
      recordFailure('source-b');

      clearAllErrorHandlingState();

      expect(getAllCircuitBreakerStatuses()).toEqual({});
    });
  });
});
