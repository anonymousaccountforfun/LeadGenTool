/**
 * POST /api/jobs/bulk - Create bulk search jobs
 *
 * Body:
 *   - query: business type to search for
 *   - locations: array of { city, state } or CSV string
 *   - count: leads per location (default 25)
 *   - filters: optional advanced filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { createJob, BulkJobGroup, createBulkJobGroup } from '@/lib/db';
import { inngest } from '@/lib/inngest/client';

interface BulkLocation {
  city: string;
  state: string;
}

interface BulkSearchRequest {
  query: string;
  locations: BulkLocation[] | string; // Array or CSV string
  count?: number;
  industryCategory?: string;
  companySizeMin?: number | null;
  companySizeMax?: number | null;
  b2cOnly?: boolean;
}

// Parse CSV input: "Austin, TX\nDallas, TX\nHouston, TX"
function parseCSV(csv: string): BulkLocation[] {
  const lines = csv.trim().split(/[\n\r]+/);
  const locations: BulkLocation[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try to parse "City, State" or "City, ST"
    const match = trimmed.match(/^([^,]+),\s*([A-Za-z]{2,})$/);
    if (match) {
      locations.push({
        city: match[1].trim(),
        state: match[2].trim().toUpperCase(),
      });
    }
  }

  return locations;
}

// Validate US state codes
const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]);

function validateLocations(locations: BulkLocation[]): { valid: BulkLocation[]; invalid: string[] } {
  const valid: BulkLocation[] = [];
  const invalid: string[] = [];

  for (const loc of locations) {
    if (!loc.city || !loc.state) {
      invalid.push(`${loc.city || '(empty)'}, ${loc.state || '(empty)'}`);
      continue;
    }

    const stateCode = loc.state.toUpperCase();
    if (!US_STATE_CODES.has(stateCode)) {
      invalid.push(`${loc.city}, ${loc.state} (invalid state)`);
      continue;
    }

    valid.push({
      city: loc.city.trim(),
      state: stateCode,
    });
  }

  return { valid, invalid };
}

export async function POST(request: NextRequest) {
  try {
    const body: BulkSearchRequest = await request.json();

    // Validate required fields
    if (!body.query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    if (!body.locations) {
      return NextResponse.json({ error: 'Locations are required' }, { status: 400 });
    }

    // Parse locations
    let rawLocations: BulkLocation[];
    if (typeof body.locations === 'string') {
      rawLocations = parseCSV(body.locations);
    } else if (Array.isArray(body.locations)) {
      rawLocations = body.locations;
    } else {
      return NextResponse.json({ error: 'Invalid locations format' }, { status: 400 });
    }

    if (rawLocations.length === 0) {
      return NextResponse.json({ error: 'No valid locations provided' }, { status: 400 });
    }

    // Limit bulk searches to 20 locations max
    if (rawLocations.length > 20) {
      return NextResponse.json({
        error: 'Too many locations',
        message: 'Maximum 20 locations per bulk search',
        provided: rawLocations.length,
      }, { status: 400 });
    }

    // Validate locations
    const { valid, invalid } = validateLocations(rawLocations);

    if (valid.length === 0) {
      return NextResponse.json({
        error: 'No valid locations',
        invalidLocations: invalid,
      }, { status: 400 });
    }

    const count = Math.min(body.count || 25, 100);

    // Create a bulk job group
    const bulkGroup: BulkJobGroup = await createBulkJobGroup({
      query: body.query.trim(),
      totalLocations: valid.length,
      industryCategory: body.industryCategory,
      b2cOnly: body.b2cOnly ?? true,
    });

    // Create individual jobs for each location
    const jobs = await Promise.all(
      valid.map(async (loc) => {
        const locationString = `${loc.city}, ${loc.state}`;
        const job = await createJob({
          query: body.query.trim(),
          location: locationString,
          count,
          industryCategory: body.industryCategory,
          targetState: loc.state,
          companySizeMin: body.companySizeMin ?? null,
          companySizeMax: body.companySizeMax ?? null,
          b2cOnly: body.b2cOnly ?? true,
          bulkGroupId: bulkGroup.id,
        });
        return job;
      })
    );

    // Trigger all jobs in parallel via Inngest
    await Promise.all(
      jobs.map((job) =>
        inngest.send({
          name: 'lead-gen/search.started',
          data: {
            jobId: job.id,
            query: body.query.trim(),
            location: job.location,
            count,
            industryCategory: body.industryCategory,
            targetState: job.location?.split(',')[1]?.trim(),
            companySizeMin: body.companySizeMin,
            companySizeMax: body.companySizeMax,
            b2cOnly: body.b2cOnly ?? true,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      bulkGroupId: bulkGroup.id,
      jobCount: jobs.length,
      jobs: jobs.map((j) => ({
        id: j.id,
        location: j.location,
        status: j.status,
      })),
      warnings: invalid.length > 0 ? { invalidLocations: invalid } : undefined,
    });
  } catch (error) {
    console.error('Bulk job creation error:', error);
    return NextResponse.json({
      error: 'Failed to create bulk jobs',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET /api/jobs/bulk?groupId=xxx - Get status of bulk job group
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('groupId');

  if (!groupId) {
    return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
  }

  try {
    const { getBulkJobGroup, getJobsByBulkGroupId } = await import('@/lib/db');

    const group = await getBulkJobGroup(groupId);
    if (!group) {
      return NextResponse.json({ error: 'Bulk job group not found' }, { status: 404 });
    }

    const jobs = await getJobsByBulkGroupId(groupId);

    const completed = jobs.filter((j) => j.status === 'completed').length;
    const failed = jobs.filter((j) => j.status === 'failed').length;
    const inProgress = jobs.filter((j) => j.status === 'processing').length;
    const pending = jobs.filter((j) => j.status === 'pending').length;

    return NextResponse.json({
      groupId: group.id,
      query: group.query,
      status: completed + failed === jobs.length ? 'completed' : 'processing',
      progress: {
        total: jobs.length,
        completed,
        failed,
        inProgress,
        pending,
        percentage: Math.round((completed / jobs.length) * 100),
      },
      jobs: jobs.map((j) => ({
        id: j.id,
        location: j.location,
        status: j.status,
        resultCount: j.result_count,
      })),
    });
  } catch (error) {
    console.error('Bulk job status error:', error);
    return NextResponse.json({
      error: 'Failed to get bulk job status',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
