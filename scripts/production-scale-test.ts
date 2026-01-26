#!/usr/bin/env npx tsx
/**
 * Production Scale Test - Fashion/Retail Focus
 *
 * Validates 85%+ email identification rate for fashion/retail businesses
 * using the production Vercel deployment API.
 *
 * Target: 8 searches × 25 businesses = 200 businesses
 * Goal: 170+ emails found (85%+)
 * Geography: Towns within 25 miles of Hicksville, NY
 */

const PRODUCTION_URL = 'https://lead-gen-tool-two.vercel.app';
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_POLL_TIME_MS = 300000; // 5 minutes max per job

interface SearchConfig {
  id: number;
  query: string;
  location: string;
  count: number;
  round: string;
}

interface SearchResult {
  id: number;
  query: string;
  location: string;
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  found: number;
  withEmail: number;
  emailRate: number;
  timeSeconds: number;
  error?: string;
}

const SEARCHES: SearchConfig[] = [
  // Round 1: Hicksville Area Core
  { id: 1, query: 'fashion boutique', location: 'Hicksville, NY', count: 25, round: 'Hicksville Core' },
  { id: 2, query: 'clothing store', location: 'Garden City, NY', count: 25, round: 'Hicksville Core' },
  { id: 3, query: "women's boutique", location: 'Huntington, NY', count: 25, round: 'Hicksville Core' },

  // Round 2: Nassau County Towns
  { id: 4, query: 'boutique', location: 'Syosset, NY', count: 25, round: 'Nassau County' },
  { id: 5, query: 'clothing boutique', location: 'Westbury, NY', count: 25, round: 'Nassau County' },
  { id: 6, query: 'bridal shop', location: 'Farmingdale, NY', count: 25, round: 'Nassau County' },

  // Round 3: Surrounding Areas
  { id: 7, query: 'fashion store', location: 'Massapequa, NY', count: 25, round: 'Surrounding Areas' },
  { id: 8, query: "women's clothing", location: 'Melville, NY', count: 25, round: 'Surrounding Areas' },
];

async function createJob(search: SearchConfig): Promise<string> {
  const response = await fetch(`${PRODUCTION_URL}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: search.query,
      location: search.location,
      count: search.count,
      priority: 'high',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create job: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.jobId;
}

async function pollJobStatus(jobId: string): Promise<{
  status: string;
  progress: number;
  total: number;
  withEmail: number;
  message: string;
}> {
  const response = await fetch(`${PRODUCTION_URL}/api/jobs/${jobId}`);

  if (!response.ok) {
    throw new Error(`Failed to get job status: ${response.status}`);
  }

  const data = await response.json();

  return {
    status: data.status,
    progress: data.progress || 0,
    total: data.results?.total || data.currentCount || 0,
    withEmail: data.results?.withEmail || 0,
    message: data.message || '',
  };
}

async function waitForJobCompletion(jobId: string, searchId: number): Promise<{
  total: number;
  withEmail: number;
  timeSeconds: number;
  status: string;
  error?: string;
}> {
  const startTime = Date.now();
  let lastProgress = 0;

  while (true) {
    const elapsed = Date.now() - startTime;

    if (elapsed > MAX_POLL_TIME_MS) {
      return {
        total: 0,
        withEmail: 0,
        timeSeconds: elapsed / 1000,
        status: 'failed',
        error: 'Timeout waiting for job completion',
      };
    }

    try {
      const status = await pollJobStatus(jobId);

      // Show progress update if changed
      if (status.progress !== lastProgress) {
        console.log(`  [#${searchId}] Progress: ${status.progress}% - ${status.message}`);
        lastProgress = status.progress;
      }

      if (status.status === 'completed') {
        return {
          total: status.total,
          withEmail: status.withEmail,
          timeSeconds: elapsed / 1000,
          status: 'completed',
        };
      }

      if (status.status === 'failed') {
        return {
          total: status.total,
          withEmail: status.withEmail,
          timeSeconds: elapsed / 1000,
          status: 'failed',
          error: status.message,
        };
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    } catch (error) {
      console.error(`  [#${searchId}] Poll error:`, error);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

async function runSearch(search: SearchConfig): Promise<SearchResult> {
  console.log(`\n--- Search #${search.id}: "${search.query}" in ${search.location} ---`);
  const startTime = Date.now();

  try {
    // Create the job
    console.log(`  Creating job...`);
    const jobId = await createJob(search);
    console.log(`  Job created: ${jobId}`);

    // Wait for completion
    console.log(`  Waiting for completion...`);
    const result = await waitForJobCompletion(jobId, search.id);

    const emailRate = result.total > 0 ? (result.withEmail / result.total) * 100 : 0;

    console.log(`  DONE: Found ${result.total} businesses, ${result.withEmail} with email (${emailRate.toFixed(1)}%)`);

    return {
      id: search.id,
      query: search.query,
      location: search.location,
      jobId,
      status: result.status as 'completed' | 'failed',
      found: result.total,
      withEmail: result.withEmail,
      emailRate,
      timeSeconds: result.timeSeconds,
      error: result.error,
    };
  } catch (error) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.error(`  FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`);

    return {
      id: search.id,
      query: search.query,
      location: search.location,
      jobId: '',
      status: 'failed',
      found: 0,
      withEmail: 0,
      emailRate: 0,
      timeSeconds: elapsed,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function generateReport(results: SearchResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('PRODUCTION SCALE TEST RESULTS');
  console.log('='.repeat(80));

  // Individual results table
  console.log('\n### Individual Search Results\n');
  console.log('| # | Query | Location | Found | Emails | Rate | Time |');
  console.log('|---|-------|----------|-------|--------|------|------|');

  for (const r of results) {
    const status = r.status === 'failed' ? ' FAIL' : '';
    console.log(`| ${r.id} | ${r.query} | ${r.location} | ${r.found} | ${r.withEmail} | ${r.emailRate.toFixed(1)}%${status} | ${r.timeSeconds.toFixed(0)}s |`);
  }

  // Calculate totals by round
  const rounds = ['Hicksville Core', 'Nassau County', 'Surrounding Areas'];

  console.log('\n### Results by Round\n');
  for (const round of rounds) {
    const roundResults = results.filter((_, i) => SEARCHES[i].round === round);
    const totalFound = roundResults.reduce((sum, r) => sum + r.found, 0);
    const totalEmails = roundResults.reduce((sum, r) => sum + r.withEmail, 0);
    const rate = totalFound > 0 ? (totalEmails / totalFound) * 100 : 0;
    const pass = rate >= 84 ? 'PASS' : 'FAIL';

    console.log(`${round}: ${totalEmails}/${totalFound} (${rate.toFixed(1)}%) - ${pass}`);
  }

  // Overall summary
  const totalFound = results.reduce((sum, r) => sum + r.found, 0);
  const totalEmails = results.reduce((sum, r) => sum + r.withEmail, 0);
  const overallRate = totalFound > 0 ? (totalEmails / totalFound) * 100 : 0;
  const failedJobs = results.filter(r => r.status === 'failed').length;
  const avgTime = results.reduce((sum, r) => sum + r.timeSeconds, 0) / results.length;

  console.log('\n### Overall Summary\n');
  console.log(`Total Businesses: ${totalFound}`);
  console.log(`Total with Email: ${totalEmails}`);
  console.log(`Overall Rate: ${overallRate.toFixed(1)}%`);
  console.log(`Failed Jobs: ${failedJobs}`);
  console.log(`Avg Time per Search: ${avgTime.toFixed(0)}s`);

  // Success criteria
  console.log('\n### Success Criteria\n');
  console.log(`| Metric | Target | Actual | Pass/Fail |`);
  console.log(`|--------|--------|--------|-----------|`);
  console.log(`| Overall email rate | >= 85% | ${overallRate.toFixed(1)}% | ${overallRate >= 85 ? 'PASS' : 'FAIL'} |`);
  console.log(`| Failed jobs | 0 | ${failedJobs} | ${failedJobs === 0 ? 'PASS' : 'FAIL'} |`);
  console.log(`| Avg time per 25 | < 120s | ${avgTime.toFixed(0)}s | ${avgTime < 120 ? 'PASS' : 'FAIL'} |`);

  // Final verdict
  console.log('\n' + '='.repeat(80));
  if (overallRate >= 85 && failedJobs === 0) {
    console.log('TEST RESULT: PASS - Email rate target met!');
  } else {
    console.log('TEST RESULT: FAIL - Target not met');
    if (overallRate < 85) {
      console.log(`  - Email rate ${overallRate.toFixed(1)}% is below 85% target`);
    }
    if (failedJobs > 0) {
      console.log(`  - ${failedJobs} job(s) failed`);
    }
  }
  console.log('='.repeat(80));
}

async function main() {
  console.log('='.repeat(80));
  console.log('PRODUCTION SCALE TEST - Fashion/Retail Focus');
  console.log('='.repeat(80));
  console.log(`Production URL: ${PRODUCTION_URL}`);
  console.log(`Test Searches: ${SEARCHES.length}`);
  console.log(`Total Businesses: ${SEARCHES.reduce((sum, s) => sum + s.count, 0)}`);
  console.log(`Target Email Rate: 85%+`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('='.repeat(80));

  const results: SearchResult[] = [];

  // Run searches sequentially to avoid overwhelming the API
  for (const search of SEARCHES) {
    const result = await runSearch(search);
    results.push(result);

    // Small delay between searches
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Generate report
  generateReport(results);

  // Save results to JSON file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsPath = `/private/tmp/claude/-Users-brianhughes/92dfbf84-7d59-4102-9ead-33cd944482b1/scratchpad/test-results-${timestamp}.json`;

  const fs = await import('fs');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    productionUrl: PRODUCTION_URL,
    searches: SEARCHES,
    results,
    summary: {
      totalFound: results.reduce((sum, r) => sum + r.found, 0),
      totalEmails: results.reduce((sum, r) => sum + r.withEmail, 0),
      overallRate: results.reduce((sum, r) => sum + r.found, 0) > 0
        ? (results.reduce((sum, r) => sum + r.withEmail, 0) / results.reduce((sum, r) => sum + r.found, 0)) * 100
        : 0,
      failedJobs: results.filter(r => r.status === 'failed').length,
    },
  }, null, 2));

  console.log(`\nResults saved to: ${resultsPath}`);
}

main().catch(console.error);
