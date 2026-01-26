/**
 * Test 4: Website vs No-Website Analysis
 *
 * Purpose: Quantify the website discovery gap
 * Target: With website 95%+, Discovered website 85%+, No website 30%+
 */
import {
  discoverBusinesses,
  findEmailsForBusinesses,
  formatDuration,
  type TestResult,
} from './test-utils';

const QUERY = 'small business';
const LOCATION = 'Austin, TX';
const TARGET_COUNT = 100;

interface GapAnalysis {
  // Businesses that came WITH websites from scraper
  withWebsite: {
    total: number;
    emailsFound: number;
    rate: number;
    avgConfidence: number;
  };
  // Businesses that came WITHOUT websites, but we discovered one
  discoveredWebsite: {
    total: number;
    emailsFound: number;
    rate: number;
    avgConfidence: number;
  };
  // Businesses WITHOUT websites and we couldn't find one
  noWebsiteFound: {
    total: number;
    emailsFound: number;
    rate: number;
    avgConfidence: number;
  };
}

export async function runTest4(): Promise<{ analysis: GapAnalysis; results: TestResult[] }> {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 4: WEBSITE VS NO-WEBSITE ANALYSIS');
  console.log('═'.repeat(70));
  console.log(`Query: "${QUERY}" in ${LOCATION}`);
  console.log(`Target: ${TARGET_COUNT} businesses`);
  console.log('\nTargets:');
  console.log('  With website: 95%+');
  console.log('  Discovered website: 85%+');
  console.log('  No website found: 30%+');

  const startTime = Date.now();

  // Discover businesses
  console.log('\n📍 Discovering businesses...');
  const businesses = await discoverBusinesses(QUERY, LOCATION, TARGET_COUNT, (msg) => {
    process.stdout.write(`\r  ${msg.slice(0, 60).padEnd(60)}`);
  });
  console.log(`\n  ✓ Found ${businesses.length} businesses`);

  const withWebsiteCount = businesses.filter(b => b.website).length;
  const withoutWebsiteCount = businesses.filter(b => !b.website).length;
  console.log(`  With website: ${withWebsiteCount}`);
  console.log(`  Without website: ${withoutWebsiteCount}`);

  // Find emails
  console.log('\n📧 Finding emails...');
  const results = await findEmailsForBusinesses(
    businesses,
    LOCATION,
    (current, total, name) => {
      process.stdout.write(`\r  [${current}/${total}] ${name.slice(0, 40).padEnd(40)}`);
    }
  );

  // Segment results
  const withWebsite = results.filter(r => r.website);
  const withoutWebsite = results.filter(r => !r.website);
  const discoveredWebsite = withoutWebsite.filter(r => r.discoveredWebsite);
  const noWebsiteFound = withoutWebsite.filter(r => !r.discoveredWebsite);

  // Calculate stats
  const calcStats = (arr: TestResult[]) => {
    const found = arr.filter(r => r.email);
    const confidences = found.map(r => r.emailConfidence || 0);
    return {
      total: arr.length,
      emailsFound: found.length,
      rate: arr.length > 0 ? (found.length / arr.length) * 100 : 0,
      avgConfidence: confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
    };
  };

  const analysis: GapAnalysis = {
    withWebsite: calcStats(withWebsite),
    discoveredWebsite: calcStats(discoveredWebsite),
    noWebsiteFound: calcStats(noWebsiteFound),
  };

  // Print results
  console.log('\n\n' + '='.repeat(70));
  console.log('GAP ANALYSIS RESULTS');
  console.log('='.repeat(70));

  console.log('\n┌─────────────────────────┬────────┬─────────┬────────┬───────────┐');
  console.log('│ Segment                 │ Count  │ Emails  │ Rate   │ Avg Conf  │');
  console.log('├─────────────────────────┼────────┼─────────┼────────┼───────────┤');
  console.log(`│ With website (scraper)  │ ${String(analysis.withWebsite.total).padEnd(6)} │ ${String(analysis.withWebsite.emailsFound).padEnd(7)} │ ${(analysis.withWebsite.rate.toFixed(0) + '%').padEnd(6)} │ ${(analysis.withWebsite.avgConfidence * 100).toFixed(0)}%       │`);
  console.log(`│ Discovered website      │ ${String(analysis.discoveredWebsite.total).padEnd(6)} │ ${String(analysis.discoveredWebsite.emailsFound).padEnd(7)} │ ${(analysis.discoveredWebsite.rate.toFixed(0) + '%').padEnd(6)} │ ${(analysis.discoveredWebsite.avgConfidence * 100).toFixed(0)}%       │`);
  console.log(`│ No website found        │ ${String(analysis.noWebsiteFound.total).padEnd(6)} │ ${String(analysis.noWebsiteFound.emailsFound).padEnd(7)} │ ${(analysis.noWebsiteFound.rate.toFixed(0) + '%').padEnd(6)} │ ${(analysis.noWebsiteFound.avgConfidence * 100).toFixed(0)}%       │`);
  console.log('└─────────────────────────┴────────┴─────────┴────────┴───────────┘');

  // Target checks
  console.log('\n' + '-'.repeat(70));
  console.log('TARGET CHECKS');
  console.log('-'.repeat(70));

  const checkTarget = (name: string, actual: number, target: number) => {
    const met = actual >= target;
    const icon = met ? '✅' : '❌';
    const gap = met ? '' : ` (gap: ${(target - actual).toFixed(1)}%)`;
    console.log(`${icon} ${name}: ${actual.toFixed(1)}% (target: ${target}%)${gap}`);
  };

  checkTarget('With website', analysis.withWebsite.rate, 95);
  checkTarget('Discovered website', analysis.discoveredWebsite.rate, 85);
  checkTarget('No website found', analysis.noWebsiteFound.rate, 30);

  // Website discovery rate
  const discoveryRate = withoutWebsite.length > 0
    ? (discoveredWebsite.length / withoutWebsite.length) * 100
    : 0;

  console.log('\n' + '-'.repeat(70));
  console.log('WEBSITE DISCOVERY');
  console.log('-'.repeat(70));
  console.log(`Businesses without website: ${withoutWebsite.length}`);
  console.log(`Websites discovered: ${discoveredWebsite.length}`);
  console.log(`Discovery rate: ${discoveryRate.toFixed(1)}%`);

  if (discoveryRate < 50) {
    console.log('\n⚠️  IMPROVEMENT OPPORTUNITY: Website discovery rate is low');
    console.log('   Consider enhancing search-engines.ts and directory-scraper.ts');
  }

  // Calculate overall impact
  const totalEmails = results.filter(r => r.email).length;
  const overallRate = (totalEmails / results.length) * 100;

  console.log('\n' + '-'.repeat(70));
  console.log('OVERALL IMPACT');
  console.log('-'.repeat(70));
  console.log(`Total emails found: ${totalEmails}/${results.length} (${overallRate.toFixed(1)}%)`);

  // What-if analysis
  if (analysis.noWebsiteFound.total > 0 && analysis.noWebsiteFound.rate < 85) {
    const potentialGain = analysis.noWebsiteFound.total * 0.85 - analysis.noWebsiteFound.emailsFound;
    const potentialRate = ((totalEmails + potentialGain) / results.length) * 100;
    console.log(`\n📈 If "no website" segment hit 85%:`);
    console.log(`   Potential gain: +${potentialGain.toFixed(0)} emails`);
    console.log(`   New overall rate: ${potentialRate.toFixed(1)}%`);
  }

  console.log(`\n⏱️  Total time: ${formatDuration(Date.now() - startTime)}`);

  return { analysis, results };
}

// Run if executed directly
if (require.main === module) {
  runTest4().catch(console.error);
}
