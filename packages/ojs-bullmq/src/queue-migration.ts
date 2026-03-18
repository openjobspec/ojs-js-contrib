/**
 * Queue-level migration utilities for moving BullMQ workloads to OJS.
 *
 * These helpers operate on **exported** BullMQ job definitions — they do
 * NOT connect to Redis. You are responsible for extracting jobs from your
 * BullMQ queues and passing them in.
 *
 * @example
 * ```ts
 * const jobs = await exportBullMQJobs('emails'); // your custom export
 * const result = await migrateQueue({
 *   sourceQueue: 'emails',
 *   ojsUrl: 'http://localhost:8080',
 *   onProgress: (p) => console.log(`${p.migrated}/${p.total}`),
 * }, jobs);
 * ```
 */

import { OJSClient } from '@openjobspec/sdk';
import type { JsonValue } from '@openjobspec/sdk';
import type { BullMQJobDefinition } from './migration.js';
import { migrateJobDefinition } from './migration.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/** Options for {@link migrateQueue}. */
export interface QueueMigrationOptions {
  /** Source BullMQ queue name. */
  sourceQueue: string;
  /** Target OJS queue name (defaults to `sourceQueue`). */
  targetQueue?: string;
  /** OJS server URL. */
  ojsUrl: string;
  /** Batch size for migration (default: 100). */
  batchSize?: number;
  /** Optional transform applied to every job before conversion. */
  transform?: (job: BullMQJobDefinition) => BullMQJobDefinition;
  /** Whether to include delayed jobs (default: true). */
  includeDelayed?: boolean;
  /** Whether to include repeatable/cron jobs (default: true). */
  includeRepeatable?: boolean;
  /** Callback invoked after each batch to report progress. */
  onProgress?: (progress: MigrationProgress) => void;
}

/** Snapshot of migration progress emitted by the `onProgress` callback. */
export interface MigrationProgress {
  phase: 'scanning' | 'migrating' | 'verifying' | 'complete';
  total: number;
  migrated: number;
  failed: number;
  skipped: number;
}

/** Final result returned by {@link migrateQueue}. */
export interface MigrationResult {
  success: boolean;
  totalJobs: number;
  migrated: number;
  failed: number;
  skipped: number;
  errors: Array<{ jobId: string; error: string }>;
  duration: number;
}

// ---------------------------------------------------------------------------
// Core migration function
// ---------------------------------------------------------------------------

/**
 * Migrate a list of pre-exported BullMQ job definitions into OJS.
 *
 * Jobs are sent to OJS in batches via `OJSClient.enqueueBatch()`.
 * Delayed and repeatable jobs are included by default but can be
 * excluded via options.
 *
 * @param options - Migration configuration.
 * @param jobs - Array of BullMQ job definitions (already exported from Redis).
 * @returns A {@link MigrationResult} summarising the operation.
 */
export async function migrateQueue(
  options: QueueMigrationOptions,
  jobs: BullMQJobDefinition[],
): Promise<MigrationResult> {
  const startTime = Date.now();
  const batchSize = options.batchSize ?? 100;
  const targetQueue = options.targetQueue ?? options.sourceQueue;
  const includeDelayed = options.includeDelayed ?? true;
  const includeRepeatable = options.includeRepeatable ?? true;

  const client = new OJSClient({ url: options.ojsUrl });

  const errors: Array<{ jobId: string; error: string }> = [];
  let migrated = 0;
  let skipped = 0;

  // Phase 1 — Scanning & filtering
  const report = (phase: MigrationProgress['phase']): void => {
    options.onProgress?.({
      phase,
      total: jobs.length,
      migrated,
      failed: errors.length,
      skipped,
    });
  };

  report('scanning');

  const eligible = jobs.filter((job) => {
    if (!includeDelayed && job.opts?.delay !== undefined && job.opts.delay > 0) {
      skipped++;
      return false;
    }
    if (!includeRepeatable && job.opts?.repeat !== undefined) {
      skipped++;
      return false;
    }
    return true;
  });

  report('migrating');

  // Phase 2 — Batch migration
  for (let i = 0; i < eligible.length; i += batchSize) {
    const batch = eligible.slice(i, i + batchSize);

    const specs = batch.map((raw) => {
      const transformed = options.transform ? options.transform(raw) : raw;
      const ojsDef = migrateJobDefinition({
        ...transformed,
        queue: targetQueue,
      });
      return {
        type: ojsDef.type,
        args: ojsDef.args as JsonValue[],
        options: ojsDef.options,
      };
    });

    try {
      await client.enqueueBatch(specs);
      migrated += batch.length;
    } catch (err: unknown) {
      // Fall back to individual enqueue so one bad job doesn't block the batch
      for (let j = 0; j < batch.length; j++) {
        try {
          const spec = specs[j];
          await client.enqueue(spec.type, spec.args, spec.options);
          migrated++;
        } catch (innerErr: unknown) {
          const jobId = (batch[j] as BullMQJobDefinition & { opts?: { jobId?: string } }).opts?.jobId ?? `batch-${i + j}`;
          errors.push({
            jobId: String(jobId),
            error: innerErr instanceof Error ? innerErr.message : String(innerErr),
          });
        }
      }
    }

    report('migrating');
  }

  // Phase 3 — Done
  report('verifying');
  report('complete');

  return {
    success: errors.length === 0,
    totalJobs: jobs.length,
    migrated,
    failed: errors.length,
    skipped,
    errors,
    duration: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

/**
 * Generate a human-readable migration report.
 *
 * @param result - The result returned by {@link migrateQueue}.
 * @returns A multi-line string suitable for logging.
 */
export function generateMigrationReport(result: MigrationResult): string {
  const lines: string[] = [
    '=== OJS Migration Report ===',
    `Status:   ${result.success ? 'SUCCESS' : 'PARTIAL FAILURE'}`,
    `Total:    ${result.totalJobs}`,
    `Migrated: ${result.migrated}`,
    `Skipped:  ${result.skipped}`,
    `Failed:   ${result.failed}`,
    `Duration: ${result.duration}ms`,
  ];

  if (result.errors.length > 0) {
    lines.push('', 'Errors:');
    for (const e of result.errors) {
      lines.push(`  - [${e.jobId}] ${e.error}`);
    }
  }

  return lines.join('\n');
}
