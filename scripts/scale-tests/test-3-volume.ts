/**
 * Test 3: Volume Scaling Test
 *
 * Purpose: Stress-test with large requests, find rate limits and performance degradation
 * Target: No significant degradation at scale
 */
import {
  discoverBusinesses,
  findEmailsForBusinesses,
  formatDuration,
  type TestResult,
  type TestSummary,
} from './test-utils';

const QUERY = 'restaurant';
const LOCATION = 'Los Angeles, CA';
const TARGET_COUNT = 250;
const CHECKPOINTS = [25, 50, 100, 150, 200, 250];

interface CheckpointResult {
  checkpoint: number;
  actualCount: number;
  emailsFound: number;
  emailRate: number;
  avgTimeMs: number;
  errors: number;
  cumulativeTimeMs: number;
}

export async function runTest3(): Promise<{ checkpoints: CheckpointResult[]; allResults: TestResult[] }> {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 3: VOLUME SCALING TEST');
  console.log('═'.repeat(70));
  console.log(`Query: "${QUERY}" in ${LOCATION}`);
  console.log(`Target: ${TARGET_COUNT} businesses`);
  console.log(`Checkpoints: ${CHECKPOINTS.join(', ')}`);

  const startTime = Date.now();

  // Discover all businesses upfront
  console.log('\n📍 Discovering businesses...');
  const businesses = await discoverBusinesses(QUERY, LOCATION, TARGET_COUNT, (msg) => {
    process.stdout.write(`\r  ${msg.slice(0, 60).padEnd(60)}`);
  });
  console.log(`\n  ✓ Found ${businesses.length} businesses`);

  if (businesses.length < 50) {
    console.log('  ⚠️  Not enough businesses found for meaningful scale test');
    return { checkpoints: [], allResults: [] };
  }

  // Process and measure at checkpoints
  console.log('\n📧 Finding emails with checkpoint measurements...\n');

  const allResults: TestResult[] = [];
  const checkpointResults: CheckpointResult[] = [];
  let lastCheckpoint = 0;

  for (const checkpoint of CHECKPOINTS) {
    if (checkpoint > businesses.length) break;

    const batchStart = Date.now();
    const batchBusinesses = businesses.slice(lastCheckpoint, checkpoint);

    // Find emails for this batch
    const batchResults = await findEmailsForBusinesses(
      batchBusinesses,
      LOCATION,
      (current, total, name) => {
        const overall = lastCheckpoint + current;
        process.stdout.write(`\r  [${overall}/${businesses.length}] ${name.slice(0, 40).padEnd(40)}`);
      }
    );

    allResults.push(...batchResults);
    const batchTime = Date.now() - batchStart;

    // Calculate checkpoint stats
    const emailsFound = allResults.filter(r => r.email).length;
    const errors = allResults.filter(r => r.error).length;
    const totalTime = allResults.reduce((sum, r) => sum + r.timeMs, 0);

    const checkpointResult: CheckpointResult = {
      checkpoint,
      actualCount: allResults.length,
      emailsFound,
      emailRate: (emailsFound / allResults.length) * 100,
      avgTimeMs: totalTime / allResults.length,
      errors,
      cumulativeTimeMs: Date.now() - startTime,
    };

    checkpointResults.push(checkpointResult);
    lastCheckpoint = checkpoint;

    // Print checkpoint summary
    console.log(`\n  ── Checkpoint ${checkpoint} ──`);
    console.log(`     Emails: ${emailsFound}/${allResults.length} (${checkpointResult.emailRate.toFixed(1)}%)`);
    console.log(`     Avg time: ${(checkpointResult.avgTimeMs / 1000).toFixed(2)}s/business`);
    console.log(`     Errors: ${errors}`);
    console.log(`     Elapsed: ${formatDuration(checkpointResult.cumulativeTimeMs)}`);
  }

  // Print summary table
  console.log('\n' + '='.repeat(70));
  console.log('SCALING ANALYSIS');
  console.log('='.repeat(70));
  console.log('Checkpoint'.padEnd(12) + 'Businesses'.padEnd(12) + 'Email Rate'.padEnd(12) + 'Avg Time'.padEnd(12) + 'Errors');
  console.log('-'.repeat(70));

  for (const cp of checkpointResults) {
    console.log(
      String(cp.checkpoint).padEnd(12) +
      String(cp.actualCount).padEnd(12) +
      `${cp.emailRate.toFixed(1)}%`.padEnd(12) +
      `${(cp.avgTimeMs / 1000).toFixed(2)}s`.padEnd(12) +
      String(cp.errors)
    );
  }

  // Analyze degradation
  console.log('\n' + '-'.repeat(70));
  console.log('DEGRADATION ANALYSIS');
  console.log('-'.repeat(70));

  if (checkpointResults.length >= 2) {
    const first = checkpointResults[0];
    const last = checkpointResults[checkpointResults.length - 1];

    const rateDiff = last.emailRate - first.emailRate;
    const timeDiff = last.avgTimeMs - first.avgTimeMs;

    console.log(`Email rate change: ${first.emailRate.toFixed(1)}% → ${last.emailRate.toFixed(1)}% (${rateDiff >= 0 ? '+' : ''}${rateDiff.toFixed(1)}%)`);
    console.log(`Avg time change: ${(first.avgTimeMs / 1000).toFixed(2)}s → ${(last.avgTimeMs / 1000).toFixed(2)}s (${timeDiff >= 0 ? '+' : ''}${(timeDiff / 1000).toFixed(2)}s)`);

    if (Math.abs(rateDiff) <= 5 && timeDiff < 2000) {
      console.log('\n✅ NO SIGNIFICANT DEGRADATION - System scales well!');
    } else if (rateDiff < -10) {
      console.log('\n⚠️  EMAIL RATE DEGRADATION DETECTED - Investigate email finder at scale');
    } else if (timeDiff > 5000) {
      console.log('\n⚠️  PERFORMANCE DEGRADATION DETECTED - Investigate timeouts/rate limits');
    }
  }

  console.log(`\n⏱️  Total time: ${formatDuration(Date.now() - startTime)}`);

  return { checkpoints: checkpointResults, allResults };
}

// Run if executed directly
if (require.main === module) {
  runTest3().catch(console.error);
}
