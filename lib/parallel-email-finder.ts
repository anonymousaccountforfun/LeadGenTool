/**
 * Parallel Email Finding Module
 * Processes multiple businesses concurrently for faster email discovery
 */

import type { Browser } from 'playwright';
import { findEmail, type EmailResult } from './email-finder';

// Concurrency limits
const DEFAULT_CONCURRENCY = 3; // Default parallel email lookups
const MAX_CONCURRENCY = 5; // Maximum to prevent overwhelming resources

export interface BusinessEmailInput {
  id: string | number;
  name: string;
  website: string | null;
  email?: string | null; // Pre-existing email from scraping
}

export interface BusinessEmailResult {
  id: string | number;
  name: string;
  email: string | null;
  emailSource: string | null;
  emailConfidence: number;
  duration: number;
  error?: string;
}

/**
 * Process a single business for email
 */
async function processBusinessEmail(
  business: BusinessEmailInput,
  browser: Browser
): Promise<BusinessEmailResult> {
  const startTime = Date.now();

  // If business already has an email, return it
  if (business.email) {
    return {
      id: business.id,
      name: business.name,
      email: business.email,
      emailSource: 'scraped-listing',
      emailConfidence: 0.85,
      duration: Date.now() - startTime,
    };
  }

  // If no website, can't find email
  if (!business.website) {
    return {
      id: business.id,
      name: business.name,
      email: null,
      emailSource: null,
      emailConfidence: 0,
      duration: Date.now() - startTime,
    };
  }

  try {
    const result = await findEmail(business.website, browser);
    return {
      id: business.id,
      name: business.name,
      email: result.email,
      emailSource: result.source,
      emailConfidence: result.confidence,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      id: business.id,
      name: business.name,
      email: null,
      emailSource: null,
      emailConfidence: 0,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Parallel batch processor with concurrency control
 */
async function parallelBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      if (index < items.length) {
        results[index] = await processor(items[index]);
      }
    }
  }

  // Start workers up to concurrency limit
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Find emails for multiple businesses in parallel
 */
export async function findEmailsParallel(
  businesses: BusinessEmailInput[],
  browser: Browser,
  options: {
    concurrency?: number;
    onProgress?: (completed: number, total: number, current: BusinessEmailResult) => void;
    maxPerMinute?: number;
  } = {}
): Promise<BusinessEmailResult[]> {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    onProgress,
    maxPerMinute = 60,
  } = options;

  const effectiveConcurrency = Math.min(concurrency, MAX_CONCURRENCY);
  const total = businesses.length;
  let completed = 0;

  // Rate limiting - track per-minute requests
  let requestsThisMinute = 0;
  let minuteStart = Date.now();

  const resetRateLimitIfNeeded = () => {
    const now = Date.now();
    if (now - minuteStart >= 60000) {
      requestsThisMinute = 0;
      minuteStart = now;
    }
  };

  const waitForRateLimit = async () => {
    resetRateLimitIfNeeded();
    if (requestsThisMinute >= maxPerMinute) {
      const waitTime = 60000 - (Date.now() - minuteStart);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        requestsThisMinute = 0;
        minuteStart = Date.now();
      }
    }
    requestsThisMinute++;
  };

  const processor = async (business: BusinessEmailInput): Promise<BusinessEmailResult> => {
    await waitForRateLimit();
    const result = await processBusinessEmail(business, browser);
    completed++;
    onProgress?.(completed, total, result);
    return result;
  };

  console.log(`[ParallelEmail] Processing ${total} businesses with concurrency ${effectiveConcurrency}`);
  const startTime = Date.now();

  const results = await parallelBatch(businesses, processor, effectiveConcurrency);

  const duration = Date.now() - startTime;
  const withEmail = results.filter(r => r.email).length;
  const avgTime = duration / total;

  console.log(`[ParallelEmail] Completed in ${(duration / 1000).toFixed(1)}s`);
  console.log(`[ParallelEmail] Found ${withEmail}/${total} emails (${(withEmail / total * 100).toFixed(1)}%)`);
  console.log(`[ParallelEmail] Avg ${avgTime.toFixed(0)}ms per business`);

  return results;
}

/**
 * Split businesses into chunks for processing
 */
export function chunkBusinesses<T>(
  businesses: T[],
  chunkSize: number
): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < businesses.length; i += chunkSize) {
    chunks.push(businesses.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Calculate optimal concurrency based on available resources
 */
export function calculateOptimalConcurrency(
  businessCount: number,
  hasApis: boolean = true
): number {
  // More APIs = can handle more concurrency since API calls are fast
  let base = hasApis ? 4 : 2;

  // For very small batches, reduce concurrency to avoid overhead
  if (businessCount < 5) base = Math.min(base, businessCount);

  // Cap at maximum
  return Math.min(base, MAX_CONCURRENCY);
}
