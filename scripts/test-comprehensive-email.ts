/**
 * Direct test of the comprehensive email finding functionality
 * Tests with realistic business names
 */
import { findEmailComprehensive, type BusinessForComprehensiveSearch } from '../lib/email-finder';

async function testEmailFinder() {
  // Test with realistic business names (mix of with/without websites)
  const testBusinesses: BusinessForComprehensiveSearch[] = [
    // Businesses WITH websites - should find emails via website scrape or pattern
    {
      name: "Starbucks",
      location: "Seattle, WA",
      website: "https://www.starbucks.com",
      phone: null,
    },
    {
      name: "McDonald's",
      location: "Chicago, IL",
      website: "https://www.mcdonalds.com",
      phone: null,
    },
    // Businesses WITHOUT websites - should find via search or discover website
    {
      name: "Bob's Plumbing",
      location: "Austin, TX",
      website: null,
      phone: null,
    },
    {
      name: "Maria's Mexican Restaurant",
      location: "Houston, TX",
      website: null,
      phone: null,
    },
    {
      name: "Elite Fitness Gym",
      location: "Dallas, TX",
      website: null,
      phone: null,
    },
    // More realistic small businesses without websites
    {
      name: "Johnson Dental Clinic",
      location: "Phoenix, AZ",
      website: null,
      phone: null,
    },
    {
      name: "Green Thumb Landscaping",
      location: "Denver, CO",
      website: null,
      phone: null,
    },
    {
      name: "City Hair Salon",
      location: "Miami, FL",
      website: null,
      phone: null,
    },
  ];

  console.log("Testing comprehensive email finder with realistic businesses...\n");
  console.log("=" .repeat(60));

  let found = 0;
  let discoveredWebsites = 0;
  const results: Array<{name: string, email: string | null, source: string | null, discovered: boolean}> = [];

  for (const business of testBusinesses) {
    console.log(`\n${business.name} (${business.location})`);
    console.log(`  Initial website: ${business.website || "None"}`);

    try {
      const start = Date.now();
      const result = await findEmailComprehensive(business);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (result) {
        found++;
        const discovered = !!result.discoveredWebsite;
        if (discovered) discoveredWebsites++;

        console.log(`  ✓ Email: ${result.email} (${(result.confidence * 100).toFixed(0)}%)`);
        console.log(`  Source: ${result.source}`);
        if (result.discoveredWebsite) {
          console.log(`  Discovered website: ${result.discoveredWebsite}`);
        }
        console.log(`  Time: ${elapsed}s`);

        results.push({
          name: business.name,
          email: result.email,
          source: result.source,
          discovered
        });
      } else {
        console.log(`  ✗ No email found (${elapsed}s)`);
        results.push({
          name: business.name,
          email: null,
          source: null,
          discovered: false
        });
      }
    } catch (err) {
      console.log(`  ✗ Error: ${err}`);
      results.push({
        name: business.name,
        email: null,
        source: null,
        discovered: false
      });
    }
  }

  // Summary
  const withWebsite = testBusinesses.filter(b => b.website).length;
  const withoutWebsite = testBusinesses.filter(b => !b.website).length;
  const foundWithWebsite = results.filter((r, i) => testBusinesses[i].website && r.email).length;
  const foundWithoutWebsite = results.filter((r, i) => !testBusinesses[i].website && r.email).length;

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total businesses tested: ${testBusinesses.length}`);
  console.log(`Emails found: ${found}/${testBusinesses.length} (${((found/testBusinesses.length)*100).toFixed(0)}%)`);
  console.log(`\nBreakdown:`);
  console.log(`  With website: ${foundWithWebsite}/${withWebsite} emails found`);
  console.log(`  Without website: ${foundWithoutWebsite}/${withoutWebsite} emails found`);
  console.log(`  Websites discovered: ${discoveredWebsites}`);
  console.log("\nResults:");
  for (const r of results) {
    const status = r.email ? '✓' : '✗';
    const details = r.email ? `${r.email} via ${r.source}` : 'Not found';
    console.log(`  ${status} ${r.name}: ${details}`);
  }
}

testEmailFinder().catch(console.error);
