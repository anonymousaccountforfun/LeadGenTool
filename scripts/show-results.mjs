import { neon } from '@neondatabase/serverless';

const DATABASE_URL = "postgresql://neondb_owner:npg_HX07WrLKSmEZ@ep-spring-violet-ahb6ki8w-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

async function showResults() {
  const jobId = 'job_1769378541774_olac88q';

  // Get count
  const countResult = await sql`SELECT COUNT(*) as total FROM businesses WHERE job_id = ${jobId}`;
  const total = countResult[0].total;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`SEARCH RESULTS: Women's Clothing Boutiques near Manhasset, NY`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Total businesses found: ${total}`);
  console.log();

  // Get sample businesses
  const businesses = await sql`
    SELECT name, phone, address, website, rating, review_count, source
    FROM businesses
    WHERE job_id = ${jobId}
    ORDER BY rating DESC NULLS LAST, review_count DESC NULLS LAST
    LIMIT 20
  `;

  console.log('Top 20 results (sorted by rating):');
  console.log('-'.repeat(80));

  for (const b of businesses) {
    const name = (b.name || '').substring(0, 35).padEnd(35);
    const phone = (b.phone || 'No phone').substring(0, 15).padEnd(15);
    const rating = b.rating ? `${parseFloat(b.rating).toFixed(1)}★` : 'N/A';
    const reviews = b.review_count ? `(${b.review_count} reviews)` : '';
    console.log(`${name} | ${phone} | ${rating} ${reviews}`);
  }

  console.log();
  console.log('Data sources used:');
  const sources = await sql`
    SELECT source, COUNT(*) as count
    FROM businesses
    WHERE job_id = ${jobId}
    GROUP BY source
    ORDER BY count DESC
  `;
  for (const s of sources) {
    console.log(`  - ${s.source}: ${s.count} businesses`);
  }
}

showResults();
