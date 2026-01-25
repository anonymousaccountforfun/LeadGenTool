import { neon } from '@neondatabase/serverless';

const DATABASE_URL = "postgresql://neondb_owner:npg_HX07WrLKSmEZ@ep-spring-violet-ahb6ki8w-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(DATABASE_URL);

async function fixIdColumn() {
  try {
    // Check current schema
    console.log('Checking current schema...');
    const schema = await sql`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'businesses' AND column_name = 'id'`;
    console.log('Current id column:', schema[0]);

    // Create a sequence if needed and set as default
    console.log('Creating sequence...');
    await sql`CREATE SEQUENCE IF NOT EXISTS businesses_id_seq`;

    console.log('Setting default value...');
    await sql`ALTER TABLE businesses ALTER COLUMN id SET DEFAULT nextval('businesses_id_seq')`;

    console.log('Setting sequence ownership...');
    await sql`ALTER SEQUENCE businesses_id_seq OWNED BY businesses.id`;

    // Get the max id and set the sequence
    console.log('Setting sequence start value...');
    const maxId = await sql`SELECT COALESCE(MAX(id), 0) + 1 as next_val FROM businesses`;
    console.log('Next val:', maxId[0].next_val);
    await sql`SELECT setval('businesses_id_seq', ${maxId[0].next_val}, false)`;

    console.log('ID column fixed!');

    // Test insert
    console.log('Testing insert...');
    await sql`INSERT INTO businesses (job_id, name, source) VALUES ('test', 'Test Business', 'test')`;
    console.log('Insert successful!');

    // Check if it worked
    const test = await sql`SELECT id, name FROM businesses WHERE job_id = 'test'`;
    console.log('Inserted row:', test[0]);

    // Clean up test data
    await sql`DELETE FROM businesses WHERE job_id = 'test'`;
    console.log('Cleaned up test data');

  } catch (e) {
    console.error('Error:', e.message);
    throw e;
  }
}

fixIdColumn();
