import { neon } from '@neondatabase/serverless';

const DATABASE_URL = "postgresql://neondb_owner:npg_HX07WrLKSmEZ@ep-spring-violet-ahb6ki8w-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

async function showResults() {
  const jobId = 'job_1769378541774_olac88q';

  // Get unique count
  const countResult = await sql`SELECT COUNT(DISTINCT name) as total FROM businesses WHERE job_id = ${jobId}`;
  const uniqueTotal = countResult[0].total;

  const totalResult = await sql`SELECT COUNT(*) as total FROM businesses WHERE job_id = ${jobId}`;
  const total = totalResult[0].total;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`SEARCH RESULTS: Women's Clothing Boutiques near Manhasset, NY`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Total records: ${total}`);
  console.log(`Unique businesses: ${uniqueTotal}`);
  console.log();

  // Get unique businesses
  const businesses = await sql`
    SELECT DISTINCT ON (LOWER(name))
      name, phone, address, website, rating, review_count, source
    FROM businesses
    WHERE job_id = ${jobId}
    ORDER BY LOWER(name), rating DESC NULLS LAST
  `;

  // Sort by rating for display
  const sorted = businesses.sort((a, b) => {
    const ratingA = parseFloat(a.rating) || 0;
    const ratingB = parseFloat(b.rating) || 0;
    if (ratingB !== ratingA) return ratingB - ratingA;
    return (b.review_count || 0) - (a.review_count || 0);
  });

  console.log('Top 25 unique boutiques (sorted by rating):');
  console.log('-'.repeat(90));

  for (const b of sorted.slice(0, 25)) {
    const name = (b.name || '').substring(0, 32).padEnd(32);
    const phone = (b.phone || 'No phone').substring(0, 14).padEnd(14);
    const rating = b.rating ? `${parseFloat(b.rating).toFixed(1)}★` : 'N/A ';
    const reviews = b.review_count ? `(${b.review_count})`.padEnd(6) : '      ';
    const source = b.source.replace('_api', '').substring(0, 12);
    console.log(`${name} | ${phone} | ${rating} ${reviews} | ${source}`);
  }

  console.log();
  console.log('Data sources used:');
  const sources = await sql`
    SELECT source, COUNT(DISTINCT name) as count
    FROM businesses
    WHERE job_id = ${jobId}
    GROUP BY source
    ORDER BY count DESC
  `;
  for (const s of sources) {
    console.log(`  - ${s.source}: ${s.count} unique businesses`);
  }

  console.log();
  console.log('Sample addresses:');
  const addresses = await sql`
    SELECT DISTINCT ON (address) name, address
    FROM businesses
    WHERE job_id = ${jobId} AND address IS NOT NULL
    LIMIT 5
  `;
  for (const a of addresses) {
    console.log(`  - ${a.name}: ${a.address}`);
  }
}

showResults();
