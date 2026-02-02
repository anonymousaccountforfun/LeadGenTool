#!/usr/bin/env npx ts-node
/**
 * CRM Email Enrichment via Apollo.io
 *
 * Uses Apollo's People Search API to find verified emails for CRM leads.
 *
 * Usage:
 *   npm run enrich-apollo
 *   npm run enrich-apollo -- --limit 100
 *   npm run enrich-apollo -- --dry-run
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const DATABASE_URL = process.env.DATABASE_URL;
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

if (!APOLLO_API_KEY) {
  console.error('❌ APOLLO_API_KEY environment variable is required');
  console.error('   Add it to .env.local: APOLLO_API_KEY=your_key_here');
  process.exit(1);
}

interface LeadToEnrich {
  id: string;
  company_name: string;
  website: string | null;
}

interface ApolloPersonResult {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  has_email?: boolean;
  organization?: {
    name: string | null;
  };
}

async function revealPerson(personId: string): Promise<ApolloPersonResult | null> {
  const url = 'https://api.apollo.io/v1/people/match';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY!,
      },
      body: JSON.stringify({
        id: personId,
        reveal_personal_emails: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (process.env.DEBUG) console.log(`      Reveal error: ${errorText}`);
      return null;
    }

    const data = await response.json();
    return data.person || null;
  } catch (error) {
    if (process.env.DEBUG) console.log(`      Reveal request error: ${error}`);
    return null;
  }
}

async function searchApollo(companyName: string, domain: string | null): Promise<ApolloPersonResult | null> {
  const url = 'https://api.apollo.io/v1/mixed_people/api_search';

  const body: Record<string, unknown> = {
    per_page: 1,
    person_titles: ['owner', 'founder', 'ceo', 'president', 'director', 'manager', 'marketing'],
    reveal_personal_emails: true,
    reveal_phone_number: false,
  };

  // Prefer domain search if available, fall back to company name
  if (domain) {
    body.q_organization_domains = domain;
  } else {
    body.q_organization_name = companyName;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY!,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        console.log('   ⏳ Rate limited, waiting 60s...');
        await new Promise(resolve => setTimeout(resolve, 60000));
        return searchApollo(companyName, domain); // Retry
      }
      console.error(`   API error ${response.status}: ${errorText}`);
      return null;
    }

    const data = await response.json();

    // Debug: show what Apollo returned
    if (process.env.DEBUG) {
      console.log(`      Apollo response: ${data.people?.length || 0} people found`);
      if (data.people?.[0]) {
        const p = data.people[0];
        console.log(`      → ${p.first_name} ${p.last_name}, ${p.title}`);
        console.log(`      → email: ${p.email || 'NONE'}, org: ${p.organization?.name || 'N/A'}`);
        console.log(`      → all keys: ${Object.keys(p).join(', ')}`);
      }
    }

    if (data.people && data.people.length > 0) {
      const person = data.people[0];

      // If person has email, reveal it
      if (person.has_email && person.id) {
        if (process.env.DEBUG) console.log(`      Revealing email for ${person.id}...`);
        const revealed = await revealPerson(person.id);
        if (revealed?.email) {
          return revealed;
        }
      }

      return person;
    }

    return null;
  } catch (error) {
    console.error(`   Request error: ${error}`);
    return null;
  }
}

function extractDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    let url = website;
    if (!url.startsWith('http')) url = 'https://' + url;
    const parsed = new URL(url);
    return parsed.hostname.replace('www.', '');
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '100');
  const dryRun = args.includes('--dry-run');

  console.log('🚀 Apollo Email Enrichment');
  console.log('==========================');
  console.log(`   Limit: ${limit} leads`);
  console.log(`   Dry run: ${dryRun}`);
  console.log('');

  const sql = neon(DATABASE_URL!);

  console.log('📊 Fetching leads missing emails...');
  const leadsRaw = await sql`
    SELECT id, company_name, website
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
  }));

  if (leads.length === 0) {
    console.log('✅ No leads need email enrichment!');
    return;
  }

  console.log(`   Found ${leads.length} leads to enrich`);
  console.log('');
  console.log('🔎 Searching Apollo...');
  console.log('');

  let enrichedCount = 0;
  let processedCount = 0;

  for (const lead of leads) {
    processedCount++;
    const domain = extractDomain(lead.website);

    const result = await searchApollo(lead.company_name, domain);

    if (result?.email) {
      const contactName = [result.first_name, result.last_name].filter(Boolean).join(' ');
      const title = result.title || '';

      if (dryRun) {
        console.log(`   [${processedCount}/${leads.length}] ✅ ${lead.company_name}`);
        console.log(`      → ${result.email} (${contactName}${title ? ', ' + title : ''})`);
      } else {
        await sql`
          UPDATE crm_leads
          SET
            email = ${result.email},
            email_confidence = 95,
            updated_at = NOW()
          WHERE id = ${lead.id}
        `;
        console.log(`   [${processedCount}/${leads.length}] ✅ ${lead.company_name}`);
        console.log(`      → ${result.email} (${contactName}${title ? ', ' + title : ''})`);
      }
      enrichedCount++;
    } else {
      console.log(`   [${processedCount}/${leads.length}] ❌ ${lead.company_name}: not found`);
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('');
  console.log('==========================');
  console.log(`✅ Complete!`);
  console.log(`   Processed: ${processedCount} leads`);
  console.log(`   Enriched: ${enrichedCount} leads`);
  console.log(`   Success rate: ${Math.round((enrichedCount / processedCount) * 100)}%`);

  if (dryRun) {
    console.log('');
    console.log('   (Dry run - no changes were made)');
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
