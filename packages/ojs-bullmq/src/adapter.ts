import { OJSClient, OJSWorker } from '@openjobspec/sdk';
import type { Job as OjsJob, JobContext, EnqueueOptions, JsonValue } from '@openjobspec/sdk';
import type { BullMQEventName } from './events.js';
import type { BullMQJobOptions } from './types.js';

export interface OjsQueueOptions {
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// OJS → BullMQ state mapping
// ---------------------------------------------------------------------------

/** Map OJS 8-state model to BullMQ-style state buckets. */
const OJS_TO_BULLMQ_STATE: Record<string, string> = {
  scheduled: 'delayed',
  available: 'waiting',
  pending: 'waiting',
  active: 'active',
  completed: 'completed',
  retryable: 'failed',
  cancelled: 'failed',
  discarded: 'failed',
};

/** Map an OJS state string to the BullMQ bucket name. */
function toBullMQState(ojsState: string): string {
  return OJS_TO_BULLMQ_STATE[ojsState] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

/** Drop-in replacement for BullMQ's Queue class, backed by OJS. */
export class Queue {
  public readonly name: string;
  private readonly client: OJSClient;
  private _paused = false;

  constructor(name: string, options: OjsQueueOptions) {
    this.name = name;
    this.client = new OJSClient({ url: options.baseUrl });
  }

  /**
   * Add a single job to the queue.
   *
   * Maps BullMQ-style options (delay in ms, priority, attempts, backoff)
   * to their OJS equivalents.
   */
  async add(
    jobName: string,
    data: Record<string, unknown>,
    opts?: BullMQJobOptions,
  ): Promise<{ id: string; name: string; data: Record<string, unknown> }> {
    const enqueueOpts: EnqueueOptions = {
      queue: this.name,
    };

    if (opts?.priority !== undefined) enqueueOpts.priority = opts.priority;
    if (opts?.delay !== undefined) enqueueOpts.delay = `${opts.delay}ms`;
    if (opts?.attempts !== undefined) {
      enqueueOpts.retry = { maxAttempts: opts.attempts };
    }
    if (opts?.backoff) {
      const backoffType =
        opts.backoff.type === 'exponential' ? 'exponential' : 'none';
      enqueueOpts.retry = {
        ...enqueueOpts.retry,
        maxAttempts: opts.attempts ?? 3,
        backoff: backoffType,
        initialInterval: `${opts.backoff.delay}ms`,
      };
    }
    if (opts?.timeout !== undefined) {
      enqueueOpts.timeout = opts.timeout;
    }

    const job = await this.client.enqueue(jobName, [data as JsonValue], enqueueOpts);
    return { id: job.id, name: jobName, data };
  }

  /**
   * Add multiple jobs to the queue in a single batch call.
   */
  async addBulk(
    jobs: Array<{
      name: string;
      data: Record<string, unknown>;
      opts?: { delay?: number; priority?: number };
    }>,
  ): Promise<Array<{ id: string; name: string; data: Record<string, unknown> }>> {
    const specs = jobs.map((j) => ({
      type: j.name,
      args: [j.data as JsonValue] as JsonValue[],
      options: {
        queue: this.name,
        priority: j.opts?.priority,
        delay: j.opts?.delay ? `${j.opts.delay}ms` : undefined,
      },
    }));

    const results = await this.client.enqueueBatch(specs);
    return results.map((r, i) => ({
      id: r.id,
      name: jobs[i].name,
      data: jobs[i].data,
    }));
  }

  /**
   * Retrieve a job by its ID.
   *
   * Returns `undefined` when the job cannot be found — matching BullMQ's
   * behaviour of returning `undefined` instead of throwing.
   */
  async getJob(id: string): Promise<OjsJob | undefined> {
    try {
      return await this.client.getJob(id);
    } catch {
      return undefined;
    }
  }

  /**
   * Get job counts grouped by BullMQ-style state names.
   *
   * OJS states are collapsed into BullMQ buckets:
   * - `waiting` ← available, pending
   * - `active` ← active
   * - `completed` ← completed
   * - `delayed` ← scheduled
   * - `failed` ← retryable, cancelled, discarded
   */
  async getJobCounts(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {
      waiting: 0,
      active: 0,
      completed: 0,
      delayed: 0,
      failed: 0,
    };

    try {
      const health = await this.client.health();
      const queues = (health as Record<string, unknown>).queues as
        | Record<string, Record<string, number>>
        | undefined;
      if (queues && queues[this.name]) {
        const queueStats = queues[this.name];
        for (const [ojsState, count] of Object.entries(queueStats)) {
          const bullState = toBullMQState(ojsState);
          if (bullState in counts) {
            counts[bullState] += count;
          }
        }
      }
    } catch {
      // Server may not support per-queue stats — return zeroes
    }

    return counts;
  }

  /** Whether the queue is currently paused. */
  isPaused(): boolean {
    return this._paused;
  }

  /**
   * Pause the queue.
   *
   * Note: OJS does not have a native queue-pause API, so this is tracked
   * locally. Use it as a coordination flag with workers.
   */
  async pause(): Promise<void> {
    this._paused = true;
  }

  /**
   * Resume a previously paused queue.
   */
  async resume(): Promise<void> {
    this._paused = false;
  }

  /**
   * Remove all waiting jobs from the queue.
   *
   * This is a best-effort operation — OJS does not expose a bulk-delete
   * for waiting jobs, so the method resolves as a no-op. Use it to
   * maintain API compatibility.
   */
  async drain(): Promise<void> {
    // No-op — OJS has no bulk-drain endpoint
  }

  /**
   * List repeatable (cron) jobs associated with this queue.
   *
   * Returns an empty array when the server does not support the cron
   * extension.
   */
  async getRepeatableJobs(): Promise<
    Array<{ name: string; id?: string; endDate?: number; cron: string; next: number }>
  > {
    // OJS cron jobs are managed server-side; no list endpoint available yet
    return [];
  }

  /**
   * Remove a repeatable job.
   *
   * No-op in the current implementation since OJS manages cron jobs
   * server-side.
   */
  async removeRepeatable(
    _name: string,
    _opts?: { pattern?: string; every?: number },
  ): Promise<void> {
    // No-op — cron removal not yet exposed
  }

  /** Close the queue. No-op for the HTTP-based client. */
  async close(): Promise<void> {
    // No-op — HTTP client has no persistent connection
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/** Processor function signature matching BullMQ's worker callback. */
export type BullMQProcessor = (job: {
  id: string;
  name: string;
  data: Record<string, unknown>;
  attemptsMade: number;
}) => Promise<unknown>;

type EventHandler = (...args: unknown[]) => void;

/** Drop-in replacement for BullMQ's Worker class, backed by OJS. */
export class Worker {
  public readonly name: string;
  private readonly worker: OJSWorker;
  private readonly processor: BullMQProcessor;
  private readonly _listeners = new Map<string, Set<EventHandler>>();
  private _running = false;
  private _paused = false;
  private _activeCount = 0;

  constructor(
    name: string,
    processor: BullMQProcessor,
    options: OjsQueueOptions & { concurrency?: number },
  ) {
    this.name = name;
    this.processor = processor;
    this.worker = new OJSWorker({
      url: options.baseUrl,
      queues: [name],
    });

    // Register a wildcard handler that delegates to the BullMQ-style processor
    this.worker.register('*', async (ctx: JobContext) => {
      if (this._paused) {
        throw new Error('Worker is paused');
      }

      this._activeCount++;
      const bullJob = {
        id: ctx.job.id,
        name: ctx.job.type,
        data: (ctx.job.args[0] as Record<string, unknown>) ?? {},
        attemptsMade: ctx.attempt,
      };

      try {
        const result = await this.processor(bullJob);
        this._emit('completed', bullJob, result);
        return result;
      } catch (err: unknown) {
        this._emit('failed', bullJob, err);
        throw err;
      } finally {
        this._activeCount--;
      }
    });
  }

  /**
   * Register a BullMQ-compatible event listener.
   *
   * Supported events: `completed`, `failed`, `error`, `progress`,
   * `active`, `waiting`, `delayed`, `stalled`.
   */
  on(event: BullMQEventName | string, handler: EventHandler): this {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(handler);
    return this;
  }

  /**
   * Remove a previously registered event listener.
   */
  off(event: BullMQEventName | string, handler: EventHandler): this {
    this._listeners.get(event)?.delete(handler);
    return this;
  }

  /** Start the worker (begin polling for jobs). */
  async run(): Promise<void> {
    this._running = true;
    this._paused = false;
    await this.worker.start();
  }

  /** Stop the worker gracefully. */
  async close(): Promise<void> {
    this._running = false;
    this._paused = false;
    await this.worker.stop();
  }

  /**
   * Pause the worker — it will stop accepting new jobs but finish
   * any in-flight work.
   */
  async pause(): Promise<void> {
    this._paused = true;
  }

  /**
   * Resume a paused worker.
   */
  async resume(): Promise<void> {
    this._paused = false;
  }

  /** `true` if {@link run} has been called and {@link close} has not. */
  isRunning(): boolean {
    return this._running;
  }

  /** `true` if the worker is paused. */
  isPaused(): boolean {
    return this._paused;
  }

  /** Number of jobs currently being processed. */
  getRunning(): number {
    return this._activeCount;
  }

  // ---- internal helpers ----

  /** Emit an event to all registered listeners. */
  private _emit(event: string, ...args: unknown[]): void {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch {
        // Listener errors must not break the worker
      }
    }
  }
}

