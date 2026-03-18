/**
 * Enhanced type mappings between BullMQ and OJS.
 *
 * Provides full BullMQ-compatible job types, options, and conversion
 * utilities so existing BullMQ code can migrate to OJS with minimal changes.
 */

import type { Job as OjsJob } from '@openjobspec/sdk';

// ---------------------------------------------------------------------------
// BullMQ-compatible interfaces
// ---------------------------------------------------------------------------

/** BullMQ backoff configuration for retry strategies. */
export interface BullMQBackoffOptions {
  type: 'fixed' | 'exponential' | 'custom';
  delay: number;
}

/** BullMQ repeat/cron configuration. */
export interface BullMQRepeatOptions {
  /** Cron expression (e.g. "0 * * * *"). */
  pattern?: string;
  /** Repeat every N milliseconds. */
  every?: number;
  /** Maximum number of times to repeat. */
  limit?: number;
}

/** BullMQ job options that control scheduling, retry, and lifecycle. */
export interface BullMQJobOptions {
  delay?: number;
  priority?: number;
  attempts?: number;
  backoff?: BullMQBackoffOptions;
  lifo?: boolean;
  timeout?: number;
  jobId?: string;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  repeat?: BullMQRepeatOptions;
}

/** BullMQ Job representation with full OJS mapping. */
export interface BullMQJob<T = Record<string, unknown>> {
  id: string;
  name: string;
  data: T;
  opts: BullMQJobOptions;
  attemptsMade: number;
  timestamp: number;
  returnvalue?: unknown;
  failedReason?: string;
  stacktrace?: string[];
  progress: number | object;
  delay: number;
  priority: number;
}

// ---------------------------------------------------------------------------
// OJS-side interfaces
// ---------------------------------------------------------------------------

/** OJS retry policy derived from BullMQ backoff settings. */
export interface OjsRetryPolicy {
  maxAttempts: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

/** OJS cron definition derived from BullMQ repeat settings. */
export interface OjsCronDefinition {
  type: string;
  args: unknown[];
  queue: string;
  schedule: string;
}

// ---------------------------------------------------------------------------
// Mapping functions
// ---------------------------------------------------------------------------

/**
 * Map a BullMQ backoff configuration to an OJS retry policy.
 *
 * `custom` backoff types fall back to `fixed` because OJS only supports
 * `fixed` and `exponential`.
 *
 * @param backoff - BullMQ backoff options.
 * @param attempts - Maximum number of retry attempts (defaults to 3).
 * @returns An OJS-compatible retry policy.
 */
export function mapBackoffToRetry(
  backoff: BullMQBackoffOptions,
  attempts?: number,
): OjsRetryPolicy {
  const backoffType =
    backoff.type === 'exponential' ? 'exponential' : 'fixed';

  return {
    maxAttempts: attempts ?? 3,
    backoff: {
      type: backoffType,
      delay: backoff.delay,
    },
  };
}

/**
 * Map a BullMQ repeat configuration to an OJS cron definition.
 *
 * If a cron `pattern` is provided it is used directly. Otherwise a
 * millisecond `every` interval is converted to a cron expression where
 * the interval fits neatly into seconds/minutes/hours; all other values
 * fall back to a per-second schedule.
 *
 * @param repeat - BullMQ repeat options.
 * @param jobName - The job type name.
 * @param queue - Target OJS queue.
 * @returns An OJS cron definition.
 */
export function mapRepeatToCron(
  repeat: BullMQRepeatOptions,
  jobName: string,
  queue: string,
): OjsCronDefinition {
  let schedule: string;

  if (repeat.pattern) {
    schedule = repeat.pattern;
  } else if (repeat.every) {
    schedule = msToSimpleCron(repeat.every);
  } else {
    schedule = '* * * * *';
  }

  return {
    type: jobName,
    args: [],
    queue,
    schedule,
  };
}

/**
 * Convert an OJS Job object to a BullMQ-compatible job representation.
 *
 * Useful for presenting OJS jobs through BullMQ-compatible APIs and
 * event payloads.
 *
 * @param ojsJob - An OJS job (typically from `OJSClient.getJob()`).
 * @returns A BullMQ-shaped job object.
 */
export function toCompatJob<T = Record<string, unknown>>(
  ojsJob: unknown,
): BullMQJob<T> {
  const job = ojsJob as OjsJob;

  const opts: BullMQJobOptions = {};
  if (job.retry?.max_attempts) {
    opts.attempts = job.retry.max_attempts;
  }
  if (job.priority !== undefined) {
    opts.priority = job.priority;
  }
  if (job.timeout !== undefined) {
    opts.timeout = job.timeout;
  }

  const delay = job.scheduled_at
    ? Math.max(0, new Date(job.scheduled_at).getTime() - Date.now())
    : 0;

  return {
    id: job.id,
    name: job.type,
    data: ((job.args[0] as T) ?? {}) as T,
    opts,
    attemptsMade: job.attempt ?? 0,
    timestamp: job.created_at ? new Date(job.created_at).getTime() : Date.now(),
    returnvalue: job.result ?? undefined,
    failedReason: job.error?.message,
    stacktrace: job.error ? [job.error.message] : [],
    progress: 0,
    delay,
    priority: job.priority ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert a millisecond interval to a simple cron expression. */
function msToSimpleCron(ms: number): string {
  const seconds = Math.round(ms / 1000);

  if (seconds <= 0) {
    return '* * * * * *'; // every second (non-standard 6-field)
  }
  if (seconds < 60) {
    return `*/${seconds} * * * * *`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `*/${minutes} * * * *`;
  }

  const hours = Math.round(minutes / 60);
  return `0 */${hours} * * *`;
}
