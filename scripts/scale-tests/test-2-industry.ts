/**
 * Test 2: Industry Diversity Stress Test
 *
 * Purpose: Find weak spots across verticals
 * Target: 85%+ average, identify bottom 3 industries
 */
import {
  discoverBusinesses,
  findEmailsForBusinesses,
  summarizeResults,
  printSummary,
  printIndustryBreakdown,
  formatDuration,
  type TestResult,
  type TestSummary,
  type IndustryResult,
} from './test-utils';

const INDUSTRIES = [
  { industry: 'Fashion/CPG', query: 'clothing boutique' },
  { industry: 'Beauty', query: 'hair salon' },
  { industry: 'Fitness', query: 'gym fitness center' },
  { industry: 'Restaurant', query: 'restaurant' },
  { industry: 'Healthcare', query: 'dentist' },
  { industry: 'Legal', query: 'law firm' },
  { industry: 'Accounting', query: 'CPA accountant' },
  { industry: 'Real Estate', query: 'real estate agent' },
  { industry: 'Home Services', query: 'plumber' },
  { industry: 'Auto', query: 'auto repair shop' },
  { industry: 'Pet Services', query: 'veterinarian' },
  { industry: 'Photography', query: 'wedding photographer' },
  { industry: 'Florist', query: 'florist' },
  { industry: 'Jewelry', query: 'jewelry store' },
  { industry: 'Furniture', query: 'furniture store' },
];

const LOCATION = 'Houston, TX';
const BUSINESSES_PER_INDUSTRY = 10;
const TARGET_RATE = 85;

export async function runTest2(): Promise<{ summary: TestSummary; industries: IndustryResult[] }> {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 2: INDUSTRY DIVERSITY STRESS TEST');
  console.log('═'.repeat(70));
  console.log(`Target: ${TARGET_RATE}%+ average email find rate`);
  console.log(`Industries: ${INDUSTRIES.length} × ${BUSINESSES_PER_INDUSTRY} businesses = ${INDUSTRIES.length * BUSINESSES_PER_INDUSTRY} total`);
  console.log(`Location: ${LOCATION} (controlled)`);

  const allResults: TestResult[] = [];
  const industryResults: IndustryResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < INDUSTRIES.length; i++) {
    const { industry, query } = INDUSTRIES[i];
    console.log(`\n[${i + 1}/${INDUSTRIES.length}] ${industry}: "${query}"`);

    // Discover businesses
    process.stdout.write('  Discovering businesses... ');
    const businesses = await discoverBusinesses(query, LOCATION, BUSINESSES_PER_INDUSTRY);
    console.log(`found ${businesses.length}`);

    if (businesses.length === 0) {
      console.log('  ⚠️  No businesses found, skipping');
      industryResults.push({
        industry,
        query,
        total: 0,
        emailsFound: 0,
        emailRate: 0,
        withWebsite: 0,
        withWebsiteEmails: 0,
      });
      continue;
    }

    // Find emails
    const results = await findEmailsForBusinesses(
      businesses,
      LOCATION,
      (current, total, name) => {
        process.stdout.write(`\r  Finding emails... ${current}/${total} - ${name.slice(0, 30).padEnd(30)}`);
      }
    );

    const found = results.filter(r => r.email).length;
    const withWebsite = results.filter(r => r.website);
    const withWebsiteEmails = withWebsite.filter(r => r.email).length;

    console.log(`\n  ✓ Emails: ${found}/${results.length} (${((found / results.length) * 100).toFixed(0)}%) | Web: ${withWebsite.length}/${results.length}`);

    allResults.push(...results);
    industryResults.push({
      industry,
      query,
      total: results.length,
      emailsFound: found,
      emailRate: results.length > 0 ? (found / results.length) * 100 : 0,
      withWebsite: withWebsite.length,
      withWebsiteEmails,
    });
  }

  const summary = summarizeResults('Industry Diversity Stress Test', allResults);
  const elapsed = Date.now() - startTime;

  printSummary(summary);
  printIndustryBreakdown(industryResults);

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

  return { summary, industries: industryResults };
}

// Run if executed directly
if (require.main === module) {
  runTest2().catch(console.error);
}
