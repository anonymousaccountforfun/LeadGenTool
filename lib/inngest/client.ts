import { Inngest } from 'inngest';

// Create the Inngest client
export const inngest = new Inngest({
  id: 'lead-gen-tool',
  // Event schemas for type safety
});

// Event types for the application
export interface JobCreatedEvent {
  name: 'job/created';
  data: {
    jobId: string;
    query: string;
    location: string;
    count: number;
    priority: 'high' | 'normal' | 'low';
  };
}

export interface JobRetryEvent {
  name: 'job/retry';
  data: {
    jobId: string;
    attempt: number;
    reason: string;
  };
}

export interface JobCancelEvent {
  name: 'job/cancel';
  data: {
    jobId: string;
    reason: string;
  };
}

// Union of all events
export type LeadGenEvents = JobCreatedEvent | JobRetryEvent | JobCancelEvent;
