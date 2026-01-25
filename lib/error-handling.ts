/**
 * Graceful Error Handling Module
 *
 * Provides:
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern for failing sources
 * - Partial results when some sources fail
 * - User-friendly error messages
 * - Smart suggestions for retrying
 */

// ============ Types ============

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
  onStateChange?: (source: string, state: CircuitState) => void;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStatus {
  state: CircuitState;
  failures: number;
  lastFailureTime: Date | null;
  successCount: number;
  nextRetryTime: Date | null;
}

export interface SourceResult<T> {
  source: string;
  success: boolean;
  data: T[];
  error?: Error;
  durationMs: number;
  retries: number;
}

export interface PartialResults<T> {
  data: T[];
  totalSources: number;
  successfulSources: number;
  failedSources: string[];
  partialFailure: boolean;
  errors: Array<{ source: string; error: string }>;
}

export interface ErrorSuggestion {
  message: string;
  type: 'retry' | 'modify' | 'wait' | 'alternative';
  actionLabel: string;
  actionData?: Record<string, unknown>;
}

// ============ Default Configuration ============

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 1 minute
  halfOpenRequests: 2,
};

// ============ Retry Logic ============

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const shouldRetry = opts.shouldRetry
        ? opts.shouldRetry(lastError, attempt)
        : isRetryableError(lastError);

      if (attempt >= opts.maxRetries || !shouldRetry) {
        throw lastError;
      }

      // Calculate delay with jitter
      const jitter = Math.random() * 0.3 * delay;
      const actualDelay = Math.min(delay + jitter, opts.maxDelayMs);

      opts.onRetry?.(lastError, attempt + 1, actualDelay);

      await sleep(actualDelay);
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Network errors are retryable
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket hang up') ||
    message.includes('fetch failed')
  ) {
    return true;
  }

  // Rate limit errors are retryable
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429') ||
    message.includes('quota')
  ) {
    return true;
  }

  // Temporary server errors are retryable
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('service unavailable') ||
    message.includes('internal server error')
  ) {
    return true;
  }

  // Playwright/browser errors that might be temporary
  if (
    name.includes('timeouterror') ||
    message.includes('page crashed') ||
    message.includes('target closed') ||
    message.includes('navigation') ||
    message.includes('frame detached')
  ) {
    return true;
  }

  return false;
}

// ============ Circuit Breaker ============

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  successCountInHalfOpen: number;
}

// Circuit breaker state per source
const circuitBreakers = new Map<string, CircuitBreakerState>();

/**
 * Get or create circuit breaker state for a source
 */
function getCircuitBreaker(source: string): CircuitBreakerState {
  if (!circuitBreakers.has(source)) {
    circuitBreakers.set(source, {
      state: 'closed',
      failures: 0,
      lastFailureTime: 0,
      successCountInHalfOpen: 0,
    });
  }
  return circuitBreakers.get(source)!;
}

/**
 * Check if a source's circuit breaker allows requests
 */
export function isCircuitOpen(
  source: string,
  options: Partial<CircuitBreakerOptions> = {}
): boolean {
  const opts: CircuitBreakerOptions = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  const breaker = getCircuitBreaker(source);
  const now = Date.now();

  if (breaker.state === 'closed') {
    return false;
  }

  if (breaker.state === 'open') {
    // Check if reset timeout has passed
    if (now - breaker.lastFailureTime >= opts.resetTimeoutMs) {
      // Move to half-open state
      breaker.state = 'half-open';
      breaker.successCountInHalfOpen = 0;
      opts.onStateChange?.(source, 'half-open');
      return false;
    }
    return true;
  }

  // Half-open state allows limited requests
  return false;
}

/**
 * Record a successful request for a source
 */
export function recordSuccess(
  source: string,
  options: Partial<CircuitBreakerOptions> = {}
): void {
  const opts: CircuitBreakerOptions = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  const breaker = getCircuitBreaker(source);

  if (breaker.state === 'half-open') {
    breaker.successCountInHalfOpen++;
    if (breaker.successCountInHalfOpen >= opts.halfOpenRequests) {
      // Transition back to closed
      breaker.state = 'closed';
      breaker.failures = 0;
      opts.onStateChange?.(source, 'closed');
    }
  } else if (breaker.state === 'closed') {
    // Reset failure count on success
    breaker.failures = 0;
  }
}

/**
 * Record a failed request for a source
 */
export function recordFailure(
  source: string,
  options: Partial<CircuitBreakerOptions> = {}
): void {
  const opts: CircuitBreakerOptions = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  const breaker = getCircuitBreaker(source);
  const now = Date.now();

  breaker.failures++;
  breaker.lastFailureTime = now;

  if (breaker.state === 'half-open') {
    // Any failure in half-open reopens the circuit
    breaker.state = 'open';
    opts.onStateChange?.(source, 'open');
  } else if (breaker.state === 'closed' && breaker.failures >= opts.failureThreshold) {
    breaker.state = 'open';
    opts.onStateChange?.(source, 'open');
  }
}

/**
 * Get the status of a source's circuit breaker
 */
export function getCircuitBreakerStatus(
  source: string,
  options: Partial<CircuitBreakerOptions> = {}
): CircuitBreakerStatus {
  const opts: CircuitBreakerOptions = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  const breaker = getCircuitBreaker(source);

  let nextRetryTime: Date | null = null;
  if (breaker.state === 'open' && breaker.lastFailureTime > 0) {
    nextRetryTime = new Date(breaker.lastFailureTime + opts.resetTimeoutMs);
  }

  return {
    state: breaker.state,
    failures: breaker.failures,
    lastFailureTime: breaker.lastFailureTime > 0 ? new Date(breaker.lastFailureTime) : null,
    successCount: breaker.successCountInHalfOpen,
    nextRetryTime,
  };
}

/**
 * Reset a circuit breaker
 */
export function resetCircuitBreaker(source: string): void {
  circuitBreakers.delete(source);
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  circuitBreakers.clear();
}

/**
 * Get all circuit breaker statuses
 */
export function getAllCircuitBreakerStatuses(): Record<string, CircuitBreakerStatus> {
  const statuses: Record<string, CircuitBreakerStatus> = {};
  for (const source of circuitBreakers.keys()) {
    statuses[source] = getCircuitBreakerStatus(source);
  }
  return statuses;
}

// ============ Partial Results ============

/**
 * Execute multiple source operations and aggregate partial results
 */
export async function withPartialResults<T>(
  sources: Array<{
    name: string;
    execute: () => Promise<T[]>;
    required?: boolean;
  }>,
  options: {
    minSuccessfulSources?: number;
    retryOptions?: Partial<RetryOptions>;
    circuitBreakerOptions?: Partial<CircuitBreakerOptions>;
  } = {}
): Promise<PartialResults<T>> {
  const {
    minSuccessfulSources = 1,
    retryOptions = {},
    circuitBreakerOptions = {},
  } = options;

  const results: SourceResult<T>[] = [];
  const allData: T[] = [];

  // Execute all sources in parallel
  await Promise.all(
    sources.map(async (source) => {
      const startTime = Date.now();
      let retries = 0;

      // Check circuit breaker
      if (isCircuitOpen(source.name, circuitBreakerOptions)) {
        results.push({
          source: source.name,
          success: false,
          data: [],
          error: new Error(`Circuit breaker open for ${source.name}`),
          durationMs: 0,
          retries: 0,
        });
        return;
      }

      try {
        const data = await withRetry(
          () => source.execute(),
          {
            ...retryOptions,
            onRetry: (error, attempt, delay) => {
              retries = attempt;
              retryOptions.onRetry?.(error, attempt, delay);
            },
          }
        );

        recordSuccess(source.name, circuitBreakerOptions);

        results.push({
          source: source.name,
          success: true,
          data,
          durationMs: Date.now() - startTime,
          retries,
        });

        allData.push(...data);
      } catch (error) {
        recordFailure(source.name, circuitBreakerOptions);

        results.push({
          source: source.name,
          success: false,
          data: [],
          error: error instanceof Error ? error : new Error(String(error)),
          durationMs: Date.now() - startTime,
          retries,
        });
      }
    })
  );

  const successfulSources = results.filter((r) => r.success).length;
  const failedSources = results.filter((r) => !r.success).map((r) => r.source);
  const requiredFailed = sources
    .filter((s) => s.required)
    .some((s) => failedSources.includes(s.name));

  // Check if we have enough successful sources
  if (successfulSources < minSuccessfulSources || requiredFailed) {
    const errors = results
      .filter((r) => !r.success)
      .map((r) => ({
        source: r.source,
        error: r.error?.message || 'Unknown error',
      }));

    throw new PartialResultsError(
      `Insufficient data sources: ${successfulSources}/${sources.length} succeeded`,
      {
        data: allData,
        totalSources: sources.length,
        successfulSources,
        failedSources,
        partialFailure: true,
        errors,
      }
    );
  }

  return {
    data: allData,
    totalSources: sources.length,
    successfulSources,
    failedSources,
    partialFailure: failedSources.length > 0,
    errors: results
      .filter((r) => !r.success)
      .map((r) => ({
        source: r.source,
        error: r.error?.message || 'Unknown error',
      })),
  };
}

// ============ User-Friendly Error Messages ============

export interface FriendlyError {
  title: string;
  message: string;
  suggestions: ErrorSuggestion[];
  technical?: string;
  recoverable: boolean;
}

/**
 * Convert an error into a user-friendly format with suggestions
 */
export function toFriendlyError(error: Error, context?: string): FriendlyError {
  const message = error.message.toLowerCase();

  // Rate limit errors
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429')
  ) {
    const waitMatch = message.match(/(\d+)\s*(?:seconds?|minutes?)/);
    const waitTime = waitMatch ? waitMatch[0] : '1 minute';

    return {
      title: 'Rate Limit Reached',
      message: `We've made too many requests. Please wait ${waitTime} before trying again.`,
      suggestions: [
        {
          message: `Wait ${waitTime} and try again`,
          type: 'wait',
          actionLabel: 'Try Again Later',
          actionData: { waitMs: parseInt(waitMatch?.[1] || '60') * 1000 },
        },
        {
          message: 'Try searching for fewer results',
          type: 'modify',
          actionLabel: 'Reduce Limit',
        },
      ],
      technical: error.message,
      recoverable: true,
    };
  }

  // Network errors
  if (
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('econnrefused') ||
    message.includes('econnreset')
  ) {
    return {
      title: 'Connection Error',
      message: 'Unable to connect to the server. Please check your internet connection.',
      suggestions: [
        {
          message: 'Check your internet connection and try again',
          type: 'retry',
          actionLabel: 'Retry',
        },
        {
          message: 'The service might be temporarily unavailable',
          type: 'wait',
          actionLabel: 'Try Again in 30 seconds',
          actionData: { waitMs: 30000 },
        },
      ],
      technical: error.message,
      recoverable: true,
    };
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return {
      title: 'Request Timed Out',
      message: 'The request took too long. This might be due to slow connection or high server load.',
      suggestions: [
        {
          message: 'Try again with a smaller search',
          type: 'modify',
          actionLabel: 'Reduce Results',
        },
        {
          message: 'Retry the search',
          type: 'retry',
          actionLabel: 'Try Again',
        },
      ],
      technical: error.message,
      recoverable: true,
    };
  }

  // API key errors
  if (
    message.includes('api key') ||
    message.includes('unauthorized') ||
    message.includes('401') ||
    message.includes('invalid key')
  ) {
    return {
      title: 'Authentication Error',
      message: 'There was a problem with the API authentication. This is usually a configuration issue.',
      suggestions: [
        {
          message: 'Check if API keys are properly configured',
          type: 'alternative',
          actionLabel: 'Check Settings',
        },
      ],
      technical: error.message,
      recoverable: false,
    };
  }

  // Quota exhausted
  if (message.includes('quota') || message.includes('limit exceeded')) {
    return {
      title: 'Quota Exhausted',
      message: 'The daily API quota has been reached. Results may be limited.',
      suggestions: [
        {
          message: 'Try again tomorrow when quotas reset',
          type: 'wait',
          actionLabel: 'Wait for Reset',
        },
        {
          message: 'Use alternative data sources',
          type: 'alternative',
          actionLabel: 'Try Other Sources',
        },
      ],
      technical: error.message,
      recoverable: true,
    };
  }

  // Server errors
  if (
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('server error')
  ) {
    return {
      title: 'Server Error',
      message: 'The server encountered an error. This is usually temporary.',
      suggestions: [
        {
          message: 'Wait a moment and try again',
          type: 'retry',
          actionLabel: 'Retry',
        },
      ],
      technical: error.message,
      recoverable: true,
    };
  }

  // Partial failure (from withPartialResults)
  if (error instanceof PartialResultsError) {
    const partial = error.partialResults;
    return {
      title: 'Partial Results',
      message: `Some data sources failed (${partial.successfulSources}/${partial.totalSources} succeeded). You have partial results.`,
      suggestions: [
        {
          message: 'Continue with partial results',
          type: 'alternative',
          actionLabel: 'Use Partial Results',
          actionData: { data: partial.data },
        },
        {
          message: 'Retry failed sources',
          type: 'retry',
          actionLabel: 'Retry Failed',
          actionData: { failedSources: partial.failedSources },
        },
      ],
      technical: partial.errors.map((e) => `${e.source}: ${e.error}`).join('; '),
      recoverable: true,
    };
  }

  // No results found
  if (message.includes('no results') || message.includes('not found')) {
    return {
      title: 'No Results Found',
      message: context
        ? `No businesses found for "${context}". Try adjusting your search.`
        : 'No results found for your search.',
      suggestions: [
        {
          message: 'Try a broader search term',
          type: 'modify',
          actionLabel: 'Modify Search',
        },
        {
          message: 'Check spelling and try again',
          type: 'modify',
          actionLabel: 'Check Search',
        },
        {
          message: 'Try a different location',
          type: 'modify',
          actionLabel: 'Change Location',
        },
      ],
      recoverable: true,
    };
  }

  // Default unknown error
  return {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again.',
    suggestions: [
      {
        message: 'Retry the operation',
        type: 'retry',
        actionLabel: 'Try Again',
      },
    ],
    technical: error.message,
    recoverable: true,
  };
}

// ============ Custom Error Classes ============

export class PartialResultsError<T> extends Error {
  public readonly partialResults: PartialResults<T>;

  constructor(message: string, partialResults: PartialResults<T>) {
    super(message);
    this.name = 'PartialResultsError';
    this.partialResults = partialResults;
  }
}

export class CircuitBreakerError extends Error {
  public readonly source: string;
  public readonly status: CircuitBreakerStatus;

  constructor(source: string, status: CircuitBreakerStatus) {
    super(`Circuit breaker open for ${source}`);
    this.name = 'CircuitBreakerError';
    this.source = source;
    this.status = status;
  }
}

export class RetryExhaustedError extends Error {
  public readonly attempts: number;
  public readonly lastError: Error;

  constructor(attempts: number, lastError: Error) {
    super(`Exhausted ${attempts} retry attempts: ${lastError.message}`);
    this.name = 'RetryExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

// ============ Utility Functions ============

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap an async function with graceful error handling
 */
export function withGracefulHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  options: {
    source?: string;
    retryOptions?: Partial<RetryOptions>;
    circuitBreakerOptions?: Partial<CircuitBreakerOptions>;
    onError?: (error: FriendlyError) => void;
  } = {}
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const { source, retryOptions, circuitBreakerOptions, onError } = options;

    // Check circuit breaker
    if (source && isCircuitOpen(source, circuitBreakerOptions)) {
      const status = getCircuitBreakerStatus(source, circuitBreakerOptions);
      const error = new CircuitBreakerError(source, status);
      onError?.(toFriendlyError(error));
      throw error;
    }

    try {
      const result = await withRetry(() => fn(...args), retryOptions);
      if (source) {
        recordSuccess(source, circuitBreakerOptions);
      }
      return result;
    } catch (error) {
      if (source) {
        recordFailure(source, circuitBreakerOptions);
      }
      const friendlyError = toFriendlyError(
        error instanceof Error ? error : new Error(String(error))
      );
      onError?.(friendlyError);
      throw error;
    }
  };
}

/**
 * Get smart suggestions for a retry based on the error context
 */
export function getRetrySuggestions(
  error: Error,
  context: {
    query?: string;
    location?: string;
    limit?: number;
    failedSources?: string[];
  } = {}
): ErrorSuggestion[] {
  const suggestions: ErrorSuggestion[] = [];
  const message = error.message.toLowerCase();

  // Suggest reducing limit for timeouts
  if (
    (message.includes('timeout') || message.includes('timed out')) &&
    context.limit &&
    context.limit > 20
  ) {
    suggestions.push({
      message: `Try searching for fewer results (currently ${context.limit})`,
      type: 'modify',
      actionLabel: 'Search for 20 results',
      actionData: { limit: 20 },
    });
  }

  // Suggest trying different location
  if (context.location && (message.includes('no results') || message.includes('not found'))) {
    suggestions.push({
      message: 'Try a broader location',
      type: 'modify',
      actionLabel: 'Expand Location',
      actionData: { location: context.location.split(',')[0] },
    });
  }

  // Suggest specific sources if some failed
  if (context.failedSources && context.failedSources.length > 0) {
    const workingSources = ['Google Maps', 'Yelp', 'Yellow Pages'].filter(
      (s) => !context.failedSources?.includes(s)
    );
    if (workingSources.length > 0) {
      suggestions.push({
        message: `Try using ${workingSources[0]} instead`,
        type: 'alternative',
        actionLabel: `Use ${workingSources[0]}`,
        actionData: { preferredSource: workingSources[0] },
      });
    }
  }

  // Always add a basic retry option
  suggestions.push({
    message: 'Retry the search',
    type: 'retry',
    actionLabel: 'Try Again',
  });

  return suggestions;
}

// ============ Testing Utilities ============

/**
 * Clear all error handling state (for testing)
 */
export function clearAllErrorHandlingState(): void {
  circuitBreakers.clear();
}
