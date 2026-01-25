import { inngest } from './client';
import { updateJobStatus, addBusiness, getJob } from '@/lib/db';
import { discover, type ScrapedBusiness } from '@/lib/scraper';
import { getErrorMessage } from '@/lib/errors';
import {
  trackJobStarted,
  trackJobProgress,
  trackJobCompleted,
  trackJobFailed,
  logger,
} from '@/lib/monitoring';

// Configuration for job processing
const JOB_CONFIG = {
  fetchMultiplier: 1.5, // Request 1.5x businesses to account for deduplication
  timeoutMs: 540000, // 9 minutes (under Vercel's 10 min limit for Pro)
};

// Process a lead generation job
export const processLeadGenJob = inngest.createFunction(
  {
    id: 'process-lead-gen-job',
    // Retry configuration with exponential backoff
    retries: 3,
    // Concurrency limit - prevent too many parallel jobs
    concurrency: {
      limit: 5,
      key: 'event.data.priority',
    },
    // Cancel running job if a cancel event is received
    cancelOn: [
      {
        event: 'job/cancel',
        match: 'data.jobId',
      },
    ],
  },
  { event: 'job/created' },
  async ({ event, step }) => {
    const { jobId, query, location, count, priority } = event.data;
    const startTime = Date.now();

    // Track job start
    trackJobStarted(jobId, query, location, count);
    logger.info('Starting job processing', { jobId, query, location, count, priority });

    try {
      // Step 1: Discover businesses using APIs
      const allBusinesses = await step.run('discover-businesses', async () => {
        await updateJobStatus(jobId, 'running', 5, 'Searching for businesses...');

        const needed = Math.ceil(count * JOB_CONFIG.fetchMultiplier);
        const businesses = await discover(query, location, needed, async (message, progress) => {
          await updateJobStatus(jobId, 'running', 5 + Math.round(progress * 0.30), message);
        });

        console.log(`[Inngest] Job ${jobId}: Found ${businesses.length} businesses`);

        if (businesses.length === 0) {
          await updateJobStatus(jobId, 'completed', 100, 'No businesses found');
          return [];
        }

        return businesses;
      });

      // Early exit if no businesses found
      if (allBusinesses.length === 0) {
        return { jobId, status: 'completed', leads: 0, message: 'No businesses found' };
      }

      // Step 3: Deduplicate businesses before processing
      // This is critical because discover() may return duplicates from multiple sources
      const uniqueBusinesses = await step.run('deduplicate-businesses', async () => {
        const seen = new Map<string, ScrapedBusiness>();
        for (const business of allBusinesses) {
          const key = business.name.toLowerCase().trim();
          const existing = seen.get(key);
          if (!existing) {
            seen.set(key, business);
          } else {
            // Merge data - keep the one with more info
            seen.set(key, {
              ...existing,
              website: existing.website || business.website,
              phone: existing.phone || business.phone,
              email: existing.email || business.email,
              address: existing.address || business.address,
              rating: existing.rating ?? business.rating,
              review_count: Math.max(existing.review_count || 0, business.review_count || 0),
            });
          }
        }
        const deduped = Array.from(seen.values());
        console.log(`[Inngest] Deduplicated ${allBusinesses.length} -> ${deduped.length} unique businesses`);
        return deduped;
      });

      // Step 4: Save all unique businesses to database
      const saveResult = await step.run('save-businesses', async () => {
        let savedCount = 0;
        let emailCount = 0;
        const total = Math.min(uniqueBusinesses.length, count);

        await updateJobStatus(jobId, 'running', 40, `Saving ${total} businesses...`);

        for (let i = 0; i < total; i++) {
          const business = uniqueBusinesses[i];

          if (business.email) {
            emailCount++;
          }

          // addBusiness now handles duplicates with ON CONFLICT DO UPDATE
          const saved = await addBusiness({
            job_id: jobId,
            name: business.name,
            website: business.website,
            email: business.email || null,
            email_source: business.email ? 'scraped-listing' : null,
            email_confidence: business.email ? 0.85 : 0,
            phone: business.phone,
            address: business.address,
            instagram: business.instagram,
            rating: business.rating,
            review_count: business.review_count,
            years_in_business: business.years_in_business || null,
            source: business.source,
            employee_count: business.employee_count || null,
            industry_code: business.industry_code || null,
            is_b2b: business.is_b2b ?? false,
          });

          if (saved) savedCount++;

          // Update progress every 10 businesses
          if (i % 10 === 0 || i === total - 1) {
            await updateJobStatus(
              jobId,
              'running',
              40 + Math.round((i / total) * 50),
              `Saved ${i + 1}/${total} businesses...`
            );
          }
        }

        return { savedCount, emailCount, total };
      });

      const { savedCount: totalProcessed, emailCount } = saveResult;

      // Track progress
      trackJobProgress(jobId, totalProcessed, emailCount, {});

      // Step 5: Finalize job
      await step.run('finalize-job', async () => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info('Job completed successfully', {
          jobId,
          emailCount,
          totalProcessed,
          durationSeconds: parseFloat(duration),
        });

        // Track completion
        trackJobCompleted(jobId, totalProcessed, emailCount);

        const message = emailCount > 0
          ? `Found ${totalProcessed} businesses (${emailCount} with emails)`
          : totalProcessed > 0
            ? `Found ${totalProcessed} businesses (no emails found yet)`
            : 'No businesses found';

        await updateJobStatus(
          jobId,
          'completed',
          100,
          message
        );
      });

      return {
        jobId,
        status: 'completed',
        leads: emailCount,
        processed: totalProcessed,
        duration: ((Date.now() - startTime) / 1000).toFixed(1),
      };
    } catch (error) {
      // Mark job as failed
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      // Track failure
      trackJobFailed(jobId, error instanceof Error ? error : String(error));
      logger.error('Job failed', error, { jobId, durationSeconds: parseFloat(duration) });

      await updateJobStatus(jobId, 'failed', 0, `Error: ${getErrorMessage(error)}`);

      // Re-throw to trigger Inngest retry logic
      throw error;
    }
  }
);

// Handle job cancellation
export const handleJobCancel = inngest.createFunction(
  {
    id: 'handle-job-cancel',
  },
  { event: 'job/cancel' },
  async ({ event, step }) => {
    const { jobId, reason } = event.data;

    await step.run('cancel-job', async () => {
      const job = await getJob(jobId);

      if (job && job.status !== 'completed' && job.status !== 'failed') {
        await updateJobStatus(jobId, 'failed', job.progress, `Cancelled: ${reason}`);
        console.log(`[Inngest] Job ${jobId} cancelled: ${reason}`);
      }
    });

    return { jobId, cancelled: true };
  }
);

// Export all functions for the Inngest handler
export const functions = [processLeadGenJob, handleJobCancel];
