import { neon } from '@neondatabase/serverless';

const DATABASE_URL = "postgresql://neondb_owner:npg_HX07WrLKSmEZ@ep-spring-violet-ahb6ki8w-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

async function addColumns() {
  try {
    console.log('Adding email_source column...');
    await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS email_source TEXT`;

    console.log('Adding email_confidence column...');
    await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS email_confidence NUMERIC DEFAULT 0`;

    console.log('Adding years_in_business column...');
    await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS years_in_business INTEGER`;

    console.log('Adding employee_count column...');
    await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS employee_count INTEGER`;

    console.log('Adding industry_code column...');
    await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry_code TEXT`;

    console.log('Adding is_b2b column...');
    await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_b2b BOOLEAN DEFAULT true`;

    console.log('All columns added successfully!');

    // Verify
    const columns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'businesses'`;
    console.log('Current columns:', columns.map(c => c.column_name).join(', '));
  } catch (e) {
    console.error('Error:', e.message);
    throw e;
  }
}

addColumns();
