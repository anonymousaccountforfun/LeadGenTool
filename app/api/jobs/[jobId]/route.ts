import { NextRequest, NextResponse } from 'next/server';
import { getJob, getBusinessesByJobId, getEmailCountByJobId, getBusinessCount } from '@/lib/db';
import { JobNotFoundError, AppError, getErrorMessage } from '@/lib/errors';

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;

    // Validate jobId format
    if (!jobId || typeof jobId !== 'string' || !jobId.startsWith('job_')) {
      throw new JobNotFoundError(jobId || 'undefined');
    }

    const job = await getJob(jobId);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    const response: Record<string, unknown> = {
      id: job.id,
      status: job.status,
      progress: job.progress,
      message: job.message,
      query: job.query,
      location: job.location,
      targetCount: job.target_count,
    };

    // Always return current business count for progress tracking
    const currentCount = await getBusinessCount(job.id);
    response.currentCount = currentCount;

    // Return full results for completed jobs, partial for running
    if (job.status === 'completed' || job.status === 'running') {
      const stats = await getEmailCountByJobId(job.id);
      const businesses = await getBusinessesByJobId(job.id);

      response.results = {
        total: stats.total,
        withEmail: stats.withEmail,
        verified: stats.verified,
        businesses: businesses,
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }

    console.error('Unexpected error in GET /api/jobs/[jobId]:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
