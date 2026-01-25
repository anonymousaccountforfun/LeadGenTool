/**
 * Edge Metrics Module
 *
 * Tracks latency and performance metrics for edge functions.
 * Uses Upstash Redis for distributed storage (edge-compatible).
 */

// Latency tracking buckets (in ms)
const LATENCY_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

interface LatencyMetric {
  endpoint: string;
  region: string;
  latencyMs: number;
  timestamp: number;
  cached: boolean;
}

interface LatencySummary {
  endpoint: string;
  region: string;
  count: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  cacheHitRate: number;
}

// In-memory buffer for batching metrics
const metricsBuffer: LatencyMetric[] = [];
const MAX_BUFFER_SIZE = 100;

// Regional latency summaries
const regionalSummaries: Map<string, LatencyMetric[]> = new Map();
const MAX_SAMPLES_PER_REGION = 1000;

/**
 * Get the current region from environment
 */
export function getCurrentRegion(): string {
  // Vercel provides VERCEL_REGION for edge functions
  return process.env.VERCEL_REGION || process.env.AWS_REGION || 'unknown';
}

/**
 * Record a latency measurement
 */
export function recordLatency(
  endpoint: string,
  latencyMs: number,
  cached: boolean = false
): void {
  const metric: LatencyMetric = {
    endpoint,
    region: getCurrentRegion(),
    latencyMs,
    timestamp: Date.now(),
    cached,
  };

  metricsBuffer.push(metric);

  // Update regional summary
  const regionKey = `${endpoint}:${metric.region}`;
  const samples = regionalSummaries.get(regionKey) || [];
  samples.push(metric);

  // Keep only recent samples
  if (samples.length > MAX_SAMPLES_PER_REGION) {
    samples.shift();
  }
  regionalSummaries.set(regionKey, samples);

  // Flush buffer if full (would send to external service in production)
  if (metricsBuffer.length >= MAX_BUFFER_SIZE) {
    flushMetrics();
  }
}

/**
 * Flush metrics buffer
 */
function flushMetrics(): void {
  // In production, this would send to a metrics service like Datadog, etc.
  // For now, just clear the buffer and log summary
  if (metricsBuffer.length > 0) {
    const avgLatency = metricsBuffer.reduce((sum, m) => sum + m.latencyMs, 0) / metricsBuffer.length;
    console.log(`[EdgeMetrics] Flushed ${metricsBuffer.length} metrics, avg latency: ${avgLatency.toFixed(1)}ms`);
    metricsBuffer.length = 0;
  }
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

/**
 * Get latency summary for an endpoint/region
 */
export function getLatencySummary(endpoint: string, region?: string): LatencySummary | null {
  const regionKey = region ? `${endpoint}:${region}` : null;

  // If specific region requested, get that; otherwise aggregate all regions
  let samples: LatencyMetric[];

  if (regionKey) {
    samples = regionalSummaries.get(regionKey) || [];
  } else {
    // Aggregate all regions for this endpoint
    samples = [];
    for (const [key, regionSamples] of regionalSummaries) {
      if (key.startsWith(`${endpoint}:`)) {
        samples.push(...regionSamples);
      }
    }
  }

  if (samples.length === 0) return null;

  const latencies = samples.map(s => s.latencyMs).sort((a, b) => a - b);
  const cachedCount = samples.filter(s => s.cached).length;

  return {
    endpoint,
    region: region || 'all',
    count: samples.length,
    avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    p99LatencyMs: percentile(latencies, 99),
    minLatencyMs: latencies[0],
    maxLatencyMs: latencies[latencies.length - 1],
    cacheHitRate: Math.round((cachedCount / samples.length) * 100),
  };
}

/**
 * Get all regional summaries
 */
export function getAllLatencySummaries(): LatencySummary[] {
  const summaries: LatencySummary[] = [];
  const endpoints = new Set<string>();

  for (const key of regionalSummaries.keys()) {
    const [endpoint] = key.split(':');
    endpoints.add(endpoint);
  }

  for (const endpoint of endpoints) {
    const summary = getLatencySummary(endpoint);
    if (summary) summaries.push(summary);
  }

  return summaries;
}

/**
 * Get latency histogram for an endpoint
 */
export function getLatencyHistogram(endpoint: string): Record<string, number> {
  const samples: LatencyMetric[] = [];

  for (const [key, regionSamples] of regionalSummaries) {
    if (key.startsWith(`${endpoint}:`)) {
      samples.push(...regionSamples);
    }
  }

  const histogram: Record<string, number> = {};

  // Initialize buckets
  for (let i = 0; i < LATENCY_BUCKETS.length; i++) {
    const label = i === 0
      ? `<${LATENCY_BUCKETS[0]}ms`
      : `${LATENCY_BUCKETS[i - 1]}-${LATENCY_BUCKETS[i]}ms`;
    histogram[label] = 0;
  }
  histogram[`>${LATENCY_BUCKETS[LATENCY_BUCKETS.length - 1]}ms`] = 0;

  // Count samples into buckets
  for (const sample of samples) {
    let placed = false;
    for (let i = 0; i < LATENCY_BUCKETS.length; i++) {
      if (sample.latencyMs < LATENCY_BUCKETS[i]) {
        const label = i === 0
          ? `<${LATENCY_BUCKETS[0]}ms`
          : `${LATENCY_BUCKETS[i - 1]}-${LATENCY_BUCKETS[i]}ms`;
        histogram[label]++;
        placed = true;
        break;
      }
    }
    if (!placed) {
      histogram[`>${LATENCY_BUCKETS[LATENCY_BUCKETS.length - 1]}ms`]++;
    }
  }

  return histogram;
}

/**
 * Create a timing wrapper for edge functions
 */
export function withLatencyTracking<T>(
  endpoint: string,
  fn: () => Promise<T>,
  isCached: boolean = false
): Promise<T> {
  const startTime = Date.now();

  return fn().finally(() => {
    const latencyMs = Date.now() - startTime;
    recordLatency(endpoint, latencyMs, isCached);
  });
}
