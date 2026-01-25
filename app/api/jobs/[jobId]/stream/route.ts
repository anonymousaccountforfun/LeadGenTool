import { NextRequest } from 'next/server';
import { getJob, getBusinessesSince, getBusinessCount } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // Verify job exists
  const job = await getJob(jobId);
  if (!job) {
    return new Response('Job not found', { status: 404 });
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  let lastId = 0;
  let isActive = true;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send initial status
      sendEvent('status', {
        status: job.status,
        progress: job.progress,
        message: job.message,
      });

      // Send any existing businesses
      const existingBusinesses = await getBusinessesSince(jobId, 0);
      if (existingBusinesses.length > 0) {
        sendEvent('businesses', existingBusinesses);
        lastId = existingBusinesses[existingBusinesses.length - 1].id;
      }

      // If job is already completed or failed, send final event and close
      if (job.status === 'completed' || job.status === 'failed') {
        sendEvent('done', { status: job.status, total: existingBusinesses.length });
        controller.close();
        return;
      }

      // Poll for updates
      const pollInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(pollInterval);
          return;
        }

        try {
          // Get latest job status
          const currentJob = await getJob(jobId);
          if (!currentJob) {
            clearInterval(pollInterval);
            controller.close();
            return;
          }

          // Send status update
          sendEvent('status', {
            status: currentJob.status,
            progress: currentJob.progress,
            message: currentJob.message,
          });

          // Get new businesses since last check
          const newBusinesses = await getBusinessesSince(jobId, lastId);
          if (newBusinesses.length > 0) {
            sendEvent('businesses', newBusinesses);
            lastId = newBusinesses[newBusinesses.length - 1].id;
          }

          // Check if job is done
          if (currentJob.status === 'completed' || currentJob.status === 'failed') {
            const totalCount = await getBusinessCount(jobId);
            sendEvent('done', { status: currentJob.status, total: totalCount });
            clearInterval(pollInterval);
            controller.close();
          }
        } catch (error) {
          console.error('Stream poll error:', error);
          // Don't close on transient errors, keep trying
        }
      }, 1000); // Poll every second for responsive updates

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        isActive = false;
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },

    cancel() {
      isActive = false;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
