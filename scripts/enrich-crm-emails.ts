#!/usr/bin/env npx ts-node
/**
 * CRM Email Enrichment Script
 *
 * Run this locally to enrich CRM leads with emails using the full lead-gen-tool.
 *
 * Usage:
 *   npm run enrich-crm
 *   npm run enrich-crm -- --limit 100
 *   npm run enrich-crm -- --dry-run
 */

import { neon } from '@neondatabase/serverless';
import { findEmailsComprehensiveBatch, type BusinessForComprehensiveSearch } from '../lib';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('   Set it in .env.local or .env file');
  console.error('   Example: DATABASE_URL=postgres://user:pass@host/db');
  process.exit(1);
}

interface LeadToEnrich {
  id: string;
  company_name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '50');
  const dryRun = args.includes('--dry-run');
  const concurrency = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3');

  console.log('🔍 CRM Email Enrichment');
  console.log('========================');
  console.log(`   Limit: ${limit} leads`);
  console.log(`   Concurrency: ${concurrency}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log('');

  const sql = neon(DATABASE_URL!);

  // Fetch leads missing emails
  console.log('📊 Fetching leads missing emails...');
  const leadsRaw = await sql`
    SELECT id, company_name, website, phone, address
    FROM crm_leads
    WHERE (email IS NULL OR email = '')
    AND company_name IS NOT NULL
    ORDER BY score DESC, created_at DESC
    LIMIT ${limit}
  `;

  const leads: LeadToEnrich[] = leadsRaw.map(l => ({
    id: l.id as string,
    company_name: l.company_name as string,
    website: l.website as string | null,
    phone: l.phone as string | null,
    address: l.address as string | null,
  }));

  if (leads.length === 0) {
    console.log('✅ No leads need email enrichment!');
    return;
  }

  console.log(`   Found ${leads.length} leads to enrich`);
  console.log('');

  // Prepare businesses for email search
  const businesses: BusinessForComprehensiveSearch[] = leads.map(lead => ({
    name: lead.company_name,
    location: lead.address || '',
    website: lead.website || undefined,
    phone: lead.phone || undefined,
  }));

  // Find emails
  console.log('🔎 Finding emails...');
  console.log('');

  let enrichedCount = 0;
  let processedCount = 0;

  const emailResults = await findEmailsComprehensiveBatch(businesses, {
    concurrency,
    onProgress: (completed, total, result) => {
      processedCount = completed;
      const status = result.email ? '✅' : '❌';
      const email = result.email || 'not found';
      console.log(`   [${completed}/${total}] ${status} ${result.name}: ${email}`);
    },
  });

  console.log('');
  console.log('💾 Updating database...');

  // Update leads with found emails
  for (const lead of leads) {
    const result = emailResults.get(lead.company_name);
    if (result?.email) {
      if (dryRun) {
        const confidenceInt = Math.round((result.confidence || 0) * 100);
        console.log(`   [DRY RUN] Would update ${lead.company_name}: ${result.email} (${confidenceInt}%)`);
      } else {
        // Convert confidence from decimal (0-1) to integer percentage (0-100)
        const confidenceInt = Math.round((result.confidence || 0) * 100);
        await sql`
          UPDATE crm_leads
          SET
            email = ${result.email},
            email_confidence = ${confidenceInt},
            updated_at = NOW()
          WHERE id = ${lead.id}
        `;
        console.log(`   ✅ Updated ${lead.company_name}: ${result.email} (${confidenceInt}%)`);
      }
      enrichedCount++;
    }
  }

  console.log('');
  console.log('========================');
  console.log(`✅ Complete!`);
  console.log(`   Processed: ${processedCount} leads`);
  console.log(`   Enriched: ${enrichedCount} leads`);
  console.log(`   Success rate: ${Math.round((enrichedCount / processedCount) * 100)}%`);

  if (dryRun) {
    console.log('');
    console.log('   (Dry run - no changes were made to the database)');
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
