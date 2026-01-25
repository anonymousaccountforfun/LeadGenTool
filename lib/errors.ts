/**
 * Custom Error Classes for Lead Gen Tool
 * Provides structured error handling with context
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(process.env.NODE_ENV === 'development' && { context: this.context }),
    };
  }
}

// Validation Errors (400)
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, true, context);
  }
}

export class InvalidQueryError extends ValidationError {
  constructor(query: string) {
    super(
      'Invalid search query. Query must be 2-200 characters and contain only letters, numbers, spaces, and common punctuation.',
      { query: query.substring(0, 50) }
    );
  }
}

export class InvalidLocationError extends ValidationError {
  constructor(location: string) {
    super(
      'Invalid location. Location must be 2-100 characters.',
      { location: location.substring(0, 50) }
    );
  }
}

export class InvalidCountError extends ValidationError {
  constructor(count: number, min: number, max: number) {
    super(
      `Invalid count. Must be between ${min} and ${max}.`,
      { count, min, max }
    );
  }
}

// Rate Limit Errors (429)
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message: string, retryAfter?: number, context?: Record<string, unknown>) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, context);
    this.retryAfter = retryAfter;
  }
}

export class BrowserlessRateLimitError extends RateLimitError {
  constructor() {
    super(
      'Browser service rate limit exceeded. Falling back to local browser.',
      60,
      { service: 'browserless.io' }
    );
  }
}

// Browser Errors (500)
export class BrowserError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'BROWSER_ERROR', 500, true, context);
  }
}

export class BrowserConnectionError extends BrowserError {
  constructor(provider: string, originalError?: Error) {
    super(
      `Failed to connect to browser: ${provider}`,
      { provider, originalError: originalError?.message }
    );
  }
}

export class BrowserTimeoutError extends BrowserError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Browser operation timed out: ${operation}`,
      { operation, timeoutMs }
    );
  }
}

// Database Errors (500)
export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', 500, true, context);
  }
}

export class DatabaseConnectionError extends DatabaseError {
  constructor(originalError?: Error) {
    super(
      'Failed to connect to database',
      { originalError: originalError?.message }
    );
  }
}

// Scraping Errors (500)
export class ScrapingError extends AppError {
  constructor(message: string, source: string, context?: Record<string, unknown>) {
    super(message, 'SCRAPING_ERROR', 500, true, { source, ...context });
  }
}

export class SourceBlockedError extends ScrapingError {
  constructor(source: string) {
    super(`Source blocked or returned CAPTCHA: ${source}`, source);
  }
}

// Job Errors (404, 500)
export class JobNotFoundError extends AppError {
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`, 'JOB_NOT_FOUND', 404, true, { jobId });
  }
}

export class JobProcessingError extends AppError {
  constructor(jobId: string, originalError?: Error) {
    super(
      `Job processing failed: ${originalError?.message || 'Unknown error'}`,
      'JOB_PROCESSING_ERROR',
      500,
      true,
      { jobId, originalError: originalError?.message }
    );
  }
}

/**
 * Utility: Retry function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: Error) => boolean;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = delay * 0.1 * Math.random();

      onRetry?.(lastError, attempt + 1);
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }

  throw lastError;
}

/**
 * Utility: Wrap async function with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new BrowserTimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]);
}

/**
 * Utility: Safe error message extraction
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Utility: Check if error is a rate limit error (429)
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.includes('Too Many Requests');
  }
  return false;
}

/**
 * Utility: Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  // Rate limits should trigger fallback, not retry
  if (isRateLimitError(error)) return false;

  if (error instanceof AppError) {
    return error.isOperational;
  }

  if (error instanceof Error) {
    // Network errors are retryable
    const retryablePatterns = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'socket hang up',
      'network',
      'timeout',
    ];
    return retryablePatterns.some(pattern =>
      error.message.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  return false;
}
