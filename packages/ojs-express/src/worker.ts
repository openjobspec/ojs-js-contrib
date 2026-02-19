import { OJSClient, OJSWorker } from '@openjobspec/sdk';
import type { OjsWorkerOptions, JobHandlerDefinition, JobContext } from './types.js';

/**
 * OjsWorkerManager manages the lifecycle of an OJS worker within an Express app.
 * Provides handler registration, graceful startup/shutdown, and health status.
 */
export class OjsWorkerManager {
  private worker: OJSWorker | null = null;
  private client: OJSClient;
  private options: OjsWorkerOptions;
  private handlers: Map<string, JobHandlerDefinition> = new Map();
  private running = false;

  constructor(options: OjsWorkerOptions) {
    this.options = options;
    this.client = new OJSClient({ url: options.url });
  }

  /**
   * Register a job handler for a specific job type.
   */
  register(type: string, handler: (ctx: JobContext) => Promise<void>, opts?: { queue?: string; concurrency?: number }): this {
    this.handlers.set(type, {
      type,
      handler,
      queue: opts?.queue,
      concurrency: opts?.concurrency,
    });
    return this;
  }

  /**
   * Start the worker. Call this after registering all handlers.
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.worker = new OJSWorker({
      url: this.options.url,
      queues: this.options.queues ?? ['default'],
      concurrency: this.options.concurrency ?? 10,
      pollInterval: this.options.pollInterval ?? 1000,
    });

    for (const [type, def] of this.handlers) {
      this.worker.register(type, async (jobCtx: unknown) => {
        const ctx = jobCtx as JobContext;
        await def.handler(ctx);
      });
    }

    await this.worker.start();
    this.running = true;
  }

  /**
   * Gracefully stop the worker, draining active jobs.
   */
  async stop(): Promise<void> {
    if (!this.running || !this.worker) return;
    await this.worker.stop();
    this.running = false;
  }

  /**
   * Returns true if the worker is running and processing jobs.
   */
  isHealthy(): boolean {
    return this.running;
  }

  /**
   * Get registered job type names.
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Create and configure a worker manager for use with Express.
 * 
 * @example
 * ```ts
 * const worker = createOjsWorker({ url: 'http://localhost:8080' });
 * worker.register('email.send', async (ctx) => { ... });
 * worker.register('report.generate', async (ctx) => { ... });
 * 
 * // Start with your Express server
 * app.listen(3000, () => worker.start());
 * 
 * // Graceful shutdown
 * process.on('SIGTERM', () => worker.stop());
 * ```
 */
export function createOjsWorker(options: OjsWorkerOptions): OjsWorkerManager {
  return new OjsWorkerManager(options);
}
