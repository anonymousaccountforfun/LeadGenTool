import { inngest } from './client';
import { updateJobStatus, addBusiness, getJob } from '@/lib/db';
import { discover, ScrapedBusiness } from '@/lib/scraper';
import { findEmailsParallel, calculateOptimalConcurrency, type BusinessEmailInput } from '@/lib/parallel-email-finder';
import { warmupBrowserPool, getBrowserPoolStats, withPooledBrowser, getBrowserlessStatus } from '@/lib/browser-pool';
import { getErrorMessage } from '@/lib/errors';
import {
  trackJobStarted,
  trackJobProgress,
  trackJobCompleted,
  trackJobFailed,
  trackSourceSuccess,
  logger,
} from '@/lib/monitoring';

// Configuration for job processing
const JOB_CONFIG = {
  fetchMultiplier: 2, // Request 2x businesses to account for missing emails
  maxAttempts: 3, // Maximum discovery attempts
  batchSize: 25, // Process emails in batches for better step granularity
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
      // Step 1: Initialize browser pool
      await step.run('warmup-browser-pool', async () => {
        await warmupBrowserPool();
        const poolStats = getBrowserPoolStats();
        const browserlessStatus = getBrowserlessStatus();
        console.log('Browser pool warmed up:', poolStats);
        console.log('Browserless status:', browserlessStatus);
        await updateJobStatus(jobId, 'running', 5, 'Browser pool ready...');
      });

      // Step 2: Discover businesses (can retry independently)
      const allBusinesses = await step.run('discover-businesses', async () => {
        await updateJobStatus(jobId, 'running', 10, 'Searching for businesses...');

        const needed = Math.ceil(count * JOB_CONFIG.fetchMultiplier);
        const businesses = await discover(query, location, needed, async (message, progress) => {
          await updateJobStatus(jobId, 'running', 10 + Math.round(progress * 0.25), message);
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

      // Step 3: Process businesses in batches for email finding
      let emailCount = 0;
      let totalProcessed = 0;
      const processedNames = new Set<string>();

      // Calculate number of batches
      const batches: ScrapedBusiness[][] = [];
      for (let i = 0; i < allBusinesses.length; i += JOB_CONFIG.batchSize) {
        batches.push(allBusinesses.slice(i, i + JOB_CONFIG.batchSize));
      }

      // Process each batch as a separate step (allows retry per batch)
      for (let batchIndex = 0; batchIndex < batches.length && emailCount < count; batchIndex++) {
        const batchResult = await step.run(`process-batch-${batchIndex}`, async () => {
          const batch = batches[batchIndex];
          let batchEmailCount = 0;
          let batchProcessed = 0;

          await updateJobStatus(
            jobId,
            'running',
            35 + Math.round((batchIndex / batches.length) * 55),
            `Processing batch ${batchIndex + 1}/${batches.length} (parallel)...`
          );

          // Filter out already processed businesses
          const toProcess: (ScrapedBusiness & { id: number })[] = [];
          let idCounter = 0;
          for (const business of batch) {
            if (processedNames.has(business.name.toLowerCase())) continue;
            if (emailCount + toProcess.length >= count) break;
            processedNames.add(business.name.toLowerCase());
            toProcess.push({ ...business, id: idCounter++ });
          }

          if (toProcess.length === 0) {
            return { emailCount: 0, processed: 0 };
          }

          // Use parallel email finding
          await withPooledBrowser(async (browser) => {
            const concurrency = calculateOptimalConcurrency(toProcess.length, true);
            const emailInputs: BusinessEmailInput[] = toProcess.map(b => ({
              id: b.id,
              name: b.name,
              website: b.website,
              email: b.email,
            }));

            const emailResults = await findEmailsParallel(emailInputs, browser, {
              concurrency,
              onProgress: async (completed, total, result) => {
                if (result.email) {
                  await updateJobStatus(
                    jobId,
                    'running',
                    35 + Math.round(((batchIndex + completed / total) / batches.length) * 55),
                    `Found email for ${result.name.substring(0, 30)}...`
                  );
                }
              },
            });

            // Save results to database
            for (let i = 0; i < emailResults.length; i++) {
              const result = emailResults[i];
              const business = toProcess[i];
              batchProcessed++;

              if (result.email) {
                batchEmailCount++;
                await addBusiness({
                  job_id: jobId,
                  name: business.name,
                  website: business.website,
                  email: result.email,
                  email_source: result.emailSource,
                  email_confidence: result.emailConfidence,
                  phone: business.phone,
                  address: business.address,
                  instagram: business.instagram,
                  rating: business.rating,
                  review_count: business.review_count,
                  years_in_business: business.years_in_business || null,
                  source: business.source,
                  employee_count: null,
                  industry_code: null,
                  is_b2b: false,
                });
              }
            }
          });

          return { emailCount: batchEmailCount, processed: batchProcessed };
        });

        emailCount += batchResult.emailCount;
        totalProcessed += batchResult.processed;

        // Track progress
        trackJobProgress(jobId, totalProcessed, emailCount, {});

        // Check if we need more businesses
        if (emailCount < count && batchIndex === batches.length - 1) {
          // Try to discover more businesses
          const additionalBusinesses = await step.run(`discover-more-${batchIndex}`, async () => {
            const needed = Math.ceil((count - emailCount) * JOB_CONFIG.fetchMultiplier);
            await updateJobStatus(jobId, 'running', 90, `Finding more businesses (${emailCount}/${count} emails)...`);

            const newBusinesses = await discover(query, location, needed);
            return newBusinesses.filter((b) => !processedNames.has(b.name.toLowerCase()));
          });

          if (additionalBusinesses.length > 0) {
            // Add new batches to process
            for (let i = 0; i < additionalBusinesses.length; i += JOB_CONFIG.batchSize) {
              batches.push(additionalBusinesses.slice(i, i + JOB_CONFIG.batchSize));
            }
          }
        }
      }

      // Step 4: Finalize job
      await step.run('finalize-job', async () => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info('Job completed successfully', {
          jobId,
          emailCount,
          totalProcessed,
          durationSeconds: parseFloat(duration),
        });

        // Track completion
        trackJobCompleted(jobId, emailCount, emailCount);

        await updateJobStatus(
          jobId,
          'completed',
          100,
          `Found ${emailCount} leads with emails! (searched ${totalProcessed} businesses)`
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
