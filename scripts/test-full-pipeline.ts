/**
 * Full pipeline test - Discover businesses via APIs, then find emails
 * This tests actual performance with real business data
 */
import { discover } from '../lib/scraper';
import { findEmailComprehensive, type BusinessForComprehensiveSearch } from '../lib/email-finder';

async function testFullPipeline() {
  const testCases = [
    { query: 'florist', location: 'Houston, TX', count: 10 },
    { query: 'dentist', location: 'Austin, TX', count: 10 },
  ];

  console.log('='.repeat(70));
  console.log('FULL PIPELINE TEST - Real Business Discovery + Email Finding');
  console.log('='.repeat(70));

  let totalBusinesses = 0;
  let totalWithWebsite = 0;
  let totalWithoutWebsite = 0;
  let totalEmailsFound = 0;
  let emailsFoundWithWebsite = 0;
  let emailsFoundWithoutWebsite = 0;
  let websitesDiscovered = 0;

  for (const test of testCases) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`TEST: ${test.query} in ${test.location} (${test.count} businesses)`);
    console.log('─'.repeat(70));

    // Step 1: Discover businesses via APIs
    console.log('\n📍 Step 1: Discovering businesses via APIs...');
    const startDiscover = Date.now();

    let businesses;
    try {
      businesses = await discover(test.query, test.location, test.count, (msg, progress) => {
        process.stdout.write(`\r  ${msg} (${(progress * 100).toFixed(0)}%)`);
      });
      console.log(`\n  ✓ Found ${businesses.length} businesses in ${((Date.now() - startDiscover) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.log(`\n  ✗ Discovery failed: ${err}`);
      continue;
    }

    if (businesses.length === 0) {
      console.log('  No businesses found, skipping...');
      continue;
    }

    // Show sample of discovered businesses
    console.log('\n  Sample businesses:');
    for (const b of businesses.slice(0, 5)) {
      const hasWeb = b.website ? '🌐' : '  ';
      const hasEmail = b.email ? '📧' : '  ';
      console.log(`    ${hasWeb}${hasEmail} ${b.name.slice(0, 40).padEnd(40)} | ${b.source}`);
    }

    // Count businesses with/without websites
    const withWebsite = businesses.filter(b => b.website);
    const withoutWebsite = businesses.filter(b => !b.website);
    const alreadyHasEmail = businesses.filter(b => b.email);

    console.log(`\n  Summary:`);
    console.log(`    With website: ${withWebsite.length}/${businesses.length}`);
    console.log(`    Without website: ${withoutWebsite.length}/${businesses.length}`);
    console.log(`    Already has email: ${alreadyHasEmail.length}/${businesses.length}`);

    totalBusinesses += businesses.length;
    totalWithWebsite += withWebsite.length;
    totalWithoutWebsite += withoutWebsite.length;

    // Step 2: Find emails for businesses that don't have them
    const needEmail = businesses.filter(b => !b.email);
    console.log(`\n📧 Step 2: Finding emails for ${needEmail.length} businesses...`);

    let foundInTest = alreadyHasEmail.length; // Start with already found
    let foundWithWebsiteInTest = alreadyHasEmail.filter(b => b.website).length;
    let foundWithoutWebsiteInTest = alreadyHasEmail.filter(b => !b.website).length;
    let discoveredInTest = 0;

    for (let i = 0; i < needEmail.length; i++) {
      const b = needEmail[i];
      process.stdout.write(`\r  Processing ${i + 1}/${needEmail.length}: ${b.name.slice(0, 30).padEnd(30)}`);

      const searchParams: BusinessForComprehensiveSearch = {
        name: b.name,
        location: b.address || test.location,
        website: b.website,
        phone: b.phone,
        instagram: b.instagram,
        facebook_url: null,
      };

      try {
        const result = await findEmailComprehensive(searchParams);
        if (result && result.email) {
          foundInTest++;
          if (b.website) {
            foundWithWebsiteInTest++;
            emailsFoundWithWebsite++;
          } else {
            foundWithoutWebsiteInTest++;
            emailsFoundWithoutWebsite++;
          }
          if (result.discoveredWebsite) {
            discoveredInTest++;
            websitesDiscovered++;
          }
        }
      } catch (err) {
        // Continue on error
      }
    }

    console.log(`\n\n  Results for ${test.query}:`);
    console.log(`    Emails found: ${foundInTest}/${businesses.length} (${((foundInTest/businesses.length)*100).toFixed(0)}%)`);
    console.log(`    - With website: ${foundWithWebsiteInTest}/${withWebsite.length}`);
    console.log(`    - Without website: ${foundWithoutWebsiteInTest}/${withoutWebsite.length}`);
    console.log(`    Websites discovered: ${discoveredInTest}`);

    totalEmailsFound += foundInTest;
  }

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('FINAL RESULTS');
  console.log('='.repeat(70));
  console.log(`Total businesses tested: ${totalBusinesses}`);
  console.log(`Total emails found: ${totalEmailsFound}/${totalBusinesses} (${((totalEmailsFound/totalBusinesses)*100).toFixed(0)}%)`);
  console.log(`\nBreakdown:`);
  console.log(`  Businesses with website: ${totalWithWebsite}`);
  console.log(`    Emails found: ${emailsFoundWithWebsite} (${totalWithWebsite > 0 ? ((emailsFoundWithWebsite/totalWithWebsite)*100).toFixed(0) : 0}%)`);
  console.log(`  Businesses without website: ${totalWithoutWebsite}`);
  console.log(`    Emails found: ${emailsFoundWithoutWebsite} (${totalWithoutWebsite > 0 ? ((emailsFoundWithoutWebsite/totalWithoutWebsite)*100).toFixed(0) : 0}%)`);
  console.log(`  Websites discovered: ${websitesDiscovered}`);
  console.log('='.repeat(70));

  // Performance vs target
  const overallRate = (totalEmailsFound / totalBusinesses) * 100;
  const target = 65;
  console.log(`\n🎯 TARGET: ${target}%`);
  console.log(`📊 ACTUAL: ${overallRate.toFixed(0)}%`);
  if (overallRate >= target) {
    console.log(`✅ TARGET MET!`);
  } else {
    console.log(`❌ Gap: ${(target - overallRate).toFixed(0)} percentage points`);
  }
}

testFullPipeline().catch(console.error);
