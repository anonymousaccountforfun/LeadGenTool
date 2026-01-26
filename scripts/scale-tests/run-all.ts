/**
 * Scale Test Suite Runner
 *
 * Runs all 5 scale tests and produces a comprehensive report
 * Target: 85%+ email identification rate at scale
 */
import { runTest1 } from './test-1-fashion';
import { runTest2 } from './test-2-industry';
import { runTest3 } from './test-3-volume';
import { runTest4 } from './test-4-website-gap';
import { runTest5 } from './test-5-quality';
import { formatDuration, type TestResult, type TestSummary } from './test-utils';

interface SuiteResults {
  test1: TestSummary | null;
  test2: { summary: TestSummary; industries: any[] } | null;
  test3: { checkpoints: any[]; allResults: TestResult[] } | null;
  test4: { analysis: any; results: TestResult[] } | null;
  test5: any | null;
  overallStats: {
    totalBusinesses: number;
    totalEmails: number;
    overallRate: number;
    targetMet: boolean;
  };
}

async function runAllTests(): Promise<SuiteResults> {
  const suiteStart = Date.now();

  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                    SCALE TEST SUITE                                  ║');
  console.log('║                    Target: 85%+ Email Rate                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`\nStarted at: ${new Date().toISOString()}`);
  console.log('Running 5 tests: Fashion, Industry, Volume, Website Gap, Quality\n');

  const allResults: TestResult[] = [];
  const results: SuiteResults = {
    test1: null,
    test2: null,
    test3: null,
    test4: null,
    test5: null,
    overallStats: {
      totalBusinesses: 0,
      totalEmails: 0,
      overallRate: 0,
      targetMet: false,
    },
  };

  // Test 1: Fashion Deep Dive
  try {
    console.log('\n' + '▓'.repeat(70));
    console.log('STARTING TEST 1 OF 5');
    console.log('▓'.repeat(70));
    results.test1 = await runTest1();
    allResults.push(...results.test1.results);
  } catch (err) {
    console.error(`\n❌ Test 1 failed: ${err}`);
  }

  // Test 2: Industry Diversity
  try {
    console.log('\n' + '▓'.repeat(70));
    console.log('STARTING TEST 2 OF 5');
    console.log('▓'.repeat(70));
    results.test2 = await runTest2();
    allResults.push(...results.test2.summary.results);
  } catch (err) {
    console.error(`\n❌ Test 2 failed: ${err}`);
  }

  // Test 3: Volume Scaling
  try {
    console.log('\n' + '▓'.repeat(70));
    console.log('STARTING TEST 3 OF 5');
    console.log('▓'.repeat(70));
    results.test3 = await runTest3();
    allResults.push(...results.test3.allResults);
  } catch (err) {
    console.error(`\n❌ Test 3 failed: ${err}`);
  }

  // Test 4: Website Gap Analysis
  try {
    console.log('\n' + '▓'.repeat(70));
    console.log('STARTING TEST 4 OF 5');
    console.log('▓'.repeat(70));
    results.test4 = await runTest4();
    allResults.push(...results.test4.results);
  } catch (err) {
    console.error(`\n❌ Test 4 failed: ${err}`);
  }

  // Test 5: Email Quality Audit (uses results from previous tests)
  try {
    console.log('\n' + '▓'.repeat(70));
    console.log('STARTING TEST 5 OF 5');
    console.log('▓'.repeat(70));
    results.test5 = await runTest5(allResults);
  } catch (err) {
    console.error(`\n❌ Test 5 failed: ${err}`);
  }

  // Calculate overall stats
  const totalBusinesses = allResults.length;
  const totalEmails = allResults.filter(r => r.email).length;
  const overallRate = totalBusinesses > 0 ? (totalEmails / totalBusinesses) * 100 : 0;

  results.overallStats = {
    totalBusinesses,
    totalEmails,
    overallRate,
    targetMet: overallRate >= 85,
  };

  // Print final report
  const elapsed = Date.now() - suiteStart;

  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL REPORT                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  console.log('\n📊 TEST RESULTS SUMMARY:');
  console.log('┌──────────────────────────────────┬────────────┬────────────┬────────┐');
  console.log('│ Test                             │ Businesses │ Emails     │ Rate   │');
  console.log('├──────────────────────────────────┼────────────┼────────────┼────────┤');

  if (results.test1) {
    const t = results.test1;
    const icon = t.emailRate >= 90 ? '✅' : '❌';
    console.log(`│ ${icon} 1. Fashion Deep Dive           │ ${String(t.totalBusinesses).padEnd(10)} │ ${String(t.emailsFound).padEnd(10)} │ ${(t.emailRate.toFixed(0) + '%').padEnd(6)} │`);
  }

  if (results.test2) {
    const t = results.test2.summary;
    const icon = t.emailRate >= 85 ? '✅' : '❌';
    console.log(`│ ${icon} 2. Industry Diversity           │ ${String(t.totalBusinesses).padEnd(10)} │ ${String(t.emailsFound).padEnd(10)} │ ${(t.emailRate.toFixed(0) + '%').padEnd(6)} │`);
  }

  if (results.test3 && results.test3.checkpoints.length > 0) {
    const t = results.test3.checkpoints[results.test3.checkpoints.length - 1];
    const icon = t.emailRate >= 85 ? '✅' : '⚠️';
    console.log(`│ ${icon} 3. Volume Scaling               │ ${String(t.actualCount).padEnd(10)} │ ${String(t.emailsFound).padEnd(10)} │ ${(t.emailRate.toFixed(0) + '%').padEnd(6)} │`);
  }

  if (results.test4) {
    const t = results.test4;
    const total = t.results.length;
    const found = t.results.filter((r: TestResult) => r.email).length;
    const rate = (found / total) * 100;
    const icon = rate >= 85 ? '✅' : '❌';
    console.log(`│ ${icon} 4. Website Gap Analysis         │ ${String(total).padEnd(10)} │ ${String(found).padEnd(10)} │ ${(rate.toFixed(0) + '%').padEnd(6)} │`);
  }

  if (results.test5) {
    const t = results.test5;
    const icon = t.overallValidRate >= 80 ? '✅' : '⚠️';
    console.log(`│ ${icon} 5. Quality Audit                │ ${String(t.totalSampled).padEnd(10)} │ N/A        │ ${(t.overallValidRate.toFixed(0) + '%').padEnd(6)} │`);
  }

  console.log('├──────────────────────────────────┼────────────┼────────────┼────────┤');
  const overallIcon = results.overallStats.targetMet ? '🎯' : '❌';
  console.log(`│ ${overallIcon} OVERALL                        │ ${String(results.overallStats.totalBusinesses).padEnd(10)} │ ${String(results.overallStats.totalEmails).padEnd(10)} │ ${(results.overallStats.overallRate.toFixed(0) + '%').padEnd(6)} │`);
  console.log('└──────────────────────────────────┴────────────┴────────────┴────────┘');

  // Target assessment
  console.log('\n' + '─'.repeat(70));
  console.log('TARGET ASSESSMENT');
  console.log('─'.repeat(70));
  console.log(`🎯 Target: 85%`);
  console.log(`📊 Actual: ${results.overallStats.overallRate.toFixed(1)}%`);

  if (results.overallStats.targetMet) {
    console.log('\n✅ ══════════════════════════════════════════════════════════════════');
    console.log('   TARGET MET! System achieves 85%+ email identification at scale.');
    console.log('   ══════════════════════════════════════════════════════════════════');
  } else {
    console.log('\n❌ ══════════════════════════════════════════════════════════════════');
    console.log(`   TARGET NOT MET. Gap: ${(85 - results.overallStats.overallRate).toFixed(1)} percentage points`);
    console.log('   ══════════════════════════════════════════════════════════════════');

    // Identify improvement areas
    console.log('\n📈 IMPROVEMENT OPPORTUNITIES:');

    if (results.test2?.industries) {
      const bottom3 = [...results.test2.industries]
        .sort((a, b) => a.emailRate - b.emailRate)
        .slice(0, 3);
      console.log('\n   Weak Industries:');
      for (const ind of bottom3) {
        console.log(`   - ${ind.industry}: ${ind.emailRate.toFixed(0)}%`);
      }
    }

    if (results.test4?.analysis) {
      const a = results.test4.analysis;
      if (a.noWebsiteFound.rate < 30) {
        console.log('\n   Website Discovery Gap:');
        console.log(`   - Businesses without websites: ${a.noWebsiteFound.total}`);
        console.log(`   - Current email rate: ${a.noWebsiteFound.rate.toFixed(0)}%`);
        console.log(`   - Improving website discovery could add significant emails`);
      }
    }
  }

  console.log(`\n⏱️  Total suite time: ${formatDuration(elapsed)}`);
  console.log(`📅 Completed at: ${new Date().toISOString()}`);

  return results;
}

// Run the suite
runAllTests()
  .then((results) => {
    process.exit(results.overallStats.targetMet ? 0 : 1);
  })
  .catch((err) => {
    console.error('Suite failed:', err);
    process.exit(1);
  });
