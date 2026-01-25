import { NextRequest, NextResponse } from 'next/server';
import { createJob, initDb } from '@/lib/db';
import { loadConfig, validateConfig } from '@/lib/config';
import { validateJobRequest, generateJobId } from '@/lib/validation';
import { AppError, getErrorMessage } from '@/lib/errors';
import { inngest } from '@/lib/inngest/client';

export async function POST(request: NextRequest) {
  try {
    // Initialize database tables if needed
    await initDb();

    // Load and validate configuration
    const config = loadConfig();
    const configWarnings = validateConfig();

    if (configWarnings.length > 0) {
      console.warn('Configuration warnings:', configWarnings);
    }

    // Log configuration status (only in development)
    if (process.env.NODE_ENV === 'development') {
      if (config.stealth.enabled) {
        console.log('Stealth features enabled:', {
          userAgentRotation: config.stealth.userAgentRotation,
          fingerprintRandomization: config.stealth.fingerprintRandomization,
          humanBehavior: config.stealth.humanBehavior,
          timingRandomization: config.stealth.timingRandomization,
        });
      }
      if (config.proxy.enabled) {
        console.log('Proxy enabled:', config.proxy.provider);
      }
      if (config.rateLimit.enabled) {
        console.log('Rate limiting enabled:', {
          perDomain: config.rateLimit.perDomain,
          minDelay: config.rateLimit.minDelay,
        });
      }
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Validate inputs
    const { query, location, count, priority, b2bTargeting } = validateJobRequest(body);

    // Generate job ID and create job in database
    const jobId = generateJobId();
    await createJob(jobId, query, location, count, priority, {
      industryCategory: b2bTargeting.industryCategory,
      companySizeMin: b2bTargeting.companySizeMin,
      companySizeMax: b2bTargeting.companySizeMax,
      targetState: b2bTargeting.targetState,
    });

    // Send event to Inngest to process the job asynchronously
    await inngest.send({
      name: 'job/created',
      data: {
        jobId,
        query,
        location: location || '',
        count,
        priority,
        b2bTargeting,
      },
    });

    console.log(`[Jobs API] Created job ${jobId} with priority ${priority}, sent to Inngest queue`);

    return NextResponse.json({
      jobId,
      priority,
      message: 'Job queued for processing',
    });
  } catch (error) {
    // Handle known errors
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }

    // Handle unknown errors
    console.error('Unexpected error in POST /api/jobs:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

// Endpoint to cancel a running job
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId parameter' },
        { status: 400 }
      );
    }

    // Send cancel event to Inngest
    await inngest.send({
      name: 'job/cancel',
      data: {
        jobId,
        reason: 'Cancelled by user',
      },
    });

    console.log(`[Jobs API] Sent cancel event for job ${jobId}`);

    return NextResponse.json({
      jobId,
      message: 'Cancel request sent',
    });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/jobs:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
