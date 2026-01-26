/**
 * Shared utilities for scale tests
 */
import { discover } from '../../lib/scraper';
import { findEmailComprehensive, type BusinessForComprehensiveSearch } from '../../lib/email-finder';

export interface TestResult {
  name: string;
  location: string;
  website: string | null;
  email: string | null;
  emailSource: string | null;
  emailConfidence: number | null;
  discoveredWebsite: string | null;
  timeMs: number;
  error: string | null;
}

export interface TestSummary {
  testName: string;
  totalBusinesses: number;
  emailsFound: number;
  emailRate: number;
  withWebsite: number;
  withWebsiteEmailsFound: number;
  withWebsiteRate: number;
  withoutWebsite: number;
  withoutWebsiteEmailsFound: number;
  withoutWebsiteRate: number;
  websitesDiscovered: number;
  avgTimeMs: number;
  errors: number;
  results: TestResult[];
}

export interface IndustryResult {
  industry: string;
  query: string;
  total: number;
  emailsFound: number;
  emailRate: number;
  withWebsite: number;
  withWebsiteEmails: number;
}

/**
 * Run email finding for a batch of businesses
 */
export async function findEmailsForBusinesses(
  businesses: Array<{ name: string; website: string | null; phone: string | null; address: string | null }>,
  location: string,
  onProgress?: (current: number, total: number, name: string) => void
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (let i = 0; i < businesses.length; i++) {
    const b = businesses[i];
    onProgress?.(i + 1, businesses.length, b.name);

    const start = Date.now();
    let result: TestResult = {
      name: b.name,
      location,
      website: b.website,
      email: null,
      emailSource: null,
      emailConfidence: null,
      discoveredWebsite: null,
      timeMs: 0,
      error: null,
    };

    try {
      const searchParams: BusinessForComprehensiveSearch = {
        name: b.name,
        location: b.address || location,
        website: b.website,
        phone: b.phone,
        instagram: null,
        facebook_url: null,
      };

      const emailResult = await findEmailComprehensive(searchParams);
      if (emailResult) {
        result.email = emailResult.email;
        result.emailSource = emailResult.source;
        result.emailConfidence = emailResult.confidence;
        result.discoveredWebsite = emailResult.discoveredWebsite || null;
      }
    } catch (err) {
      result.error = String(err);
    }

    result.timeMs = Date.now() - start;
    results.push(result);
  }

  return results;
}

/**
 * Calculate summary statistics from results
 */
export function summarizeResults(testName: string, results: TestResult[]): TestSummary {
  const emailsFound = results.filter(r => r.email).length;
  const withWebsite = results.filter(r => r.website);
  const withoutWebsite = results.filter(r => !r.website);
  const withWebsiteEmailsFound = withWebsite.filter(r => r.email).length;
  const withoutWebsiteEmailsFound = withoutWebsite.filter(r => r.email).length;
  const websitesDiscovered = results.filter(r => r.discoveredWebsite).length;
  const totalTime = results.reduce((sum, r) => sum + r.timeMs, 0);
  const errors = results.filter(r => r.error).length;

  return {
    testName,
    totalBusinesses: results.length,
    emailsFound,
    emailRate: results.length > 0 ? (emailsFound / results.length) * 100 : 0,
    withWebsite: withWebsite.length,
    withWebsiteEmailsFound,
    withWebsiteRate: withWebsite.length > 0 ? (withWebsiteEmailsFound / withWebsite.length) * 100 : 0,
    withoutWebsite: withoutWebsite.length,
    withoutWebsiteEmailsFound,
    withoutWebsiteRate: withoutWebsite.length > 0 ? (withoutWebsiteEmailsFound / withoutWebsite.length) * 100 : 0,
    websitesDiscovered,
    avgTimeMs: results.length > 0 ? totalTime / results.length : 0,
    errors,
    results,
  };
}

/**
 * Print summary to console
 */
export function printSummary(summary: TestSummary): void {
  console.log('\n' + '='.repeat(60));
  console.log(`TEST: ${summary.testName}`);
  console.log('='.repeat(60));
  console.log(`Total businesses: ${summary.totalBusinesses}`);
  console.log(`Emails found: ${summary.emailsFound}/${summary.totalBusinesses} (${summary.emailRate.toFixed(1)}%)`);
  console.log(`\nBreakdown:`);
  console.log(`  With website: ${summary.withWebsiteEmailsFound}/${summary.withWebsite} (${summary.withWebsiteRate.toFixed(1)}%)`);
  console.log(`  Without website: ${summary.withoutWebsiteEmailsFound}/${summary.withoutWebsite} (${summary.withoutWebsiteRate.toFixed(1)}%)`);
  console.log(`  Websites discovered: ${summary.websitesDiscovered}`);
  console.log(`\nPerformance:`);
  console.log(`  Avg time per business: ${(summary.avgTimeMs / 1000).toFixed(2)}s`);
  console.log(`  Errors: ${summary.errors}`);
}

/**
 * Print industry breakdown
 */
export function printIndustryBreakdown(industries: IndustryResult[]): void {
  console.log('\n' + '-'.repeat(60));
  console.log('INDUSTRY BREAKDOWN');
  console.log('-'.repeat(60));
  console.log('Industry'.padEnd(25) + 'Emails'.padEnd(12) + 'Rate'.padEnd(10) + 'Web%');
  console.log('-'.repeat(60));

  // Sort by email rate descending
  const sorted = [...industries].sort((a, b) => b.emailRate - a.emailRate);

  for (const ind of sorted) {
    const webPct = ind.total > 0 ? ((ind.withWebsite / ind.total) * 100).toFixed(0) : '0';
    console.log(
      ind.industry.padEnd(25) +
      `${ind.emailsFound}/${ind.total}`.padEnd(12) +
      `${ind.emailRate.toFixed(0)}%`.padEnd(10) +
      `${webPct}%`
    );
  }

  // Identify bottom 3
  console.log('\n⚠️  Bottom 3 industries (improvement opportunities):');
  for (const ind of sorted.slice(-3).reverse()) {
    console.log(`   - ${ind.industry}: ${ind.emailRate.toFixed(0)}%`);
  }
}

/**
 * Discover businesses using the scraper
 */
export async function discoverBusinesses(
  query: string,
  location: string,
  count: number,
  onProgress?: (message: string) => void
): Promise<Array<{ name: string; website: string | null; phone: string | null; address: string | null; email: string | null }>> {
  try {
    const results = await discover(query, location, count, (msg) => {
      onProgress?.(msg);
    });
    return results.map(r => ({
      name: r.name,
      website: r.website,
      phone: r.phone,
      address: r.address,
      email: r.email,
    }));
  } catch (err) {
    console.error(`Discovery failed for "${query}" in ${location}: ${err}`);
    return [];
  }
}

/**
 * Format time duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * Sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
