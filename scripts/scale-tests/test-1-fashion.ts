/**
 * Test 1: Fashion/Clothing Deep Dive
 *
 * Purpose: Validate performance in core market (CPG/fashion)
 * Target: 90%+ email find rate
 */
import {
  discoverBusinesses,
  findEmailsForBusinesses,
  summarizeResults,
  printSummary,
  formatDuration,
  type TestResult,
  type TestSummary,
} from './test-utils';

const FASHION_QUERIES = [
  { query: 'boutique clothing store', location: 'New York, NY' },
  { query: 'women\'s fashion boutique', location: 'Los Angeles, CA' },
  { query: 'men\'s clothing store', location: 'Miami, FL' },
  { query: 'vintage clothing shop', location: 'Austin, TX' },
  { query: 'streetwear store', location: 'Denver, CO' },
  { query: 'designer consignment', location: 'New York, NY' },
  { query: 'bridal shop', location: 'Los Angeles, CA' },
  { query: 'children\'s clothing boutique', location: 'Phoenix, AZ' },
  { query: 'sustainable fashion store', location: 'Portland, OR' },
  { query: 'sneaker store', location: 'Chicago, IL' },
];

const BUSINESSES_PER_QUERY = 10;
const TARGET_RATE = 90;

export async function runTest1(): Promise<TestSummary> {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 1: FASHION/CLOTHING DEEP DIVE');
  console.log('═'.repeat(70));
  console.log(`Target: ${TARGET_RATE}%+ email find rate`);
  console.log(`Queries: ${FASHION_QUERIES.length} × ${BUSINESSES_PER_QUERY} businesses = ${FASHION_QUERIES.length * BUSINESSES_PER_QUERY} total`);

  const allResults: TestResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < FASHION_QUERIES.length; i++) {
    const { query, location } = FASHION_QUERIES[i];
    console.log(`\n[${i + 1}/${FASHION_QUERIES.length}] "${query}" in ${location}`);

    // Discover businesses
    process.stdout.write('  Discovering businesses... ');
    const businesses = await discoverBusinesses(query, location, BUSINESSES_PER_QUERY);
    console.log(`found ${businesses.length}`);

    if (businesses.length === 0) {
      console.log('  ⚠️  No businesses found, skipping');
      continue;
    }

    // Find emails
    const results = await findEmailsForBusinesses(
      businesses,
      location,
      (current, total, name) => {
        process.stdout.write(`\r  Finding emails... ${current}/${total} - ${name.slice(0, 30).padEnd(30)}`);
      }
    );

    const found = results.filter(r => r.email).length;
    console.log(`\n  ✓ Emails found: ${found}/${results.length} (${((found / results.length) * 100).toFixed(0)}%)`);

    allResults.push(...results);
  }

  const summary = summarizeResults('Fashion/Clothing Deep Dive', allResults);
  const elapsed = Date.now() - startTime;

  printSummary(summary);

  // Target check
  console.log('\n' + '-'.repeat(60));
  console.log(`🎯 TARGET: ${TARGET_RATE}%`);
  console.log(`📊 ACTUAL: ${summary.emailRate.toFixed(1)}%`);
  if (summary.emailRate >= TARGET_RATE) {
    console.log('✅ TARGET MET!');
  } else {
    console.log(`❌ Gap: ${(TARGET_RATE - summary.emailRate).toFixed(1)} percentage points`);
  }
  console.log(`⏱️  Total time: ${formatDuration(elapsed)}`);

  return summary;
}

// Run if executed directly
if (require.main === module) {
  runTest1().catch(console.error);
}
