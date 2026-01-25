import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { functions } from '@/lib/inngest/functions';

// Inngest webhook handler for Next.js
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
