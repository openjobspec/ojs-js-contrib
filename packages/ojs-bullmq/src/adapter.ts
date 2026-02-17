import { OJSClient, OJSWorker } from '@openjobspec/sdk';
import type { Job as OjsJob, JobContext, EnqueueOptions } from '@openjobspec/sdk';

export interface OjsQueueOptions {
  baseUrl: string;
}

/** Drop-in replacement for BullMQ's Queue class, backed by OJS. */
export class Queue {
  public readonly name: string;
  private readonly client: OJSClient;

  constructor(name: string, options: OjsQueueOptions) {
    this.name = name;
    this.client = new OJSClient({ url: options.baseUrl });
  }

  async add(
    jobName: string,
    data: Record<string, unknown>,
    opts?: {
      delay?: number;
      priority?: number;
      attempts?: number;
      backoff?: { type: string; delay: number };
      jobId?: string;
    },
  ): Promise<{ id: string; name: string; data: Record<string, unknown> }> {
    const enqueueOpts: EnqueueOptions = {
      queue: this.name,
    };

    if (opts?.priority !== undefined) enqueueOpts.priority = opts.priority;
    if (opts?.delay !== undefined) enqueueOpts.delay = `${opts.delay}ms`;
    if (opts?.attempts !== undefined) {
      enqueueOpts.retry = { maxAttempts: opts.attempts };
    }

    const job = await this.client.enqueue(jobName, [data], enqueueOpts);
    return { id: job.id, name: jobName, data };
  }

  async addBulk(
    jobs: Array<{
      name: string;
      data: Record<string, unknown>;
      opts?: { delay?: number; priority?: number };
    }>,
  ): Promise<Array<{ id: string; name: string; data: Record<string, unknown> }>> {
    const specs = jobs.map((j) => ({
      type: j.name,
      args: [j.data] as unknown[],
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

  async getJob(id: string): Promise<OjsJob | undefined> {
    try {
      return await this.client.getJob(id);
    } catch {
      return undefined;
    }
  }

  async close(): Promise<void> {
    // No-op — HTTP client has no persistent connection
  }
}

/** Drop-in replacement for BullMQ's Worker class, backed by OJS. */
export class Worker {
  public readonly name: string;
  private readonly worker: OJSWorker;
  private readonly processor: (job: {
    id: string;
    name: string;
    data: Record<string, unknown>;
    attemptsMade: number;
  }) => Promise<unknown>;

  constructor(
    name: string,
    processor: (job: {
      id: string;
      name: string;
      data: Record<string, unknown>;
      attemptsMade: number;
    }) => Promise<unknown>,
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
      const bullJob = {
        id: ctx.job.id,
        name: ctx.job.type,
        data: (ctx.job.args[0] as Record<string, unknown>) ?? {},
        attemptsMade: ctx.attempt,
      };
      return this.processor(bullJob);
    });
  }

  async run(): Promise<void> {
    await this.worker.start();
  }

  async close(): Promise<void> {
    await this.worker.stop();
  }
}
