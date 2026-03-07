import { OJSClient, OJSWorker } from '@openjobspec/sdk';
import type { OjsWorkerOptions, JobHandlerDefinition, JobContext } from './types.js';
import type { Request, Response, RequestHandler } from 'express';

/**
 * OjsWorkerManager manages the lifecycle of an OJS worker within an Express app.
 * Provides handler registration, graceful startup/shutdown, health status,
 * and automatic signal handling for SIGTERM/SIGINT.
 */
export class OjsWorkerManager {
  private worker: OJSWorker | null = null;
  private client: OJSClient;
  private options: OjsWorkerOptions;
  private handlers: Map<string, JobHandlerDefinition> = new Map();
  private running = false;
  private shuttingDown = false;
  private signalsBound = false;

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
   * Start the worker without blocking. Returns immediately.
   * Errors during startup are logged to console.
   */
  startAsync(): void {
    this.start().catch((err) => {
      console.error('[ojs-express] Worker startup failed:', err);
    });
  }

  /**
   * Gracefully stop the worker, draining active jobs.
   */
  async stop(): Promise<void> {
    if (!this.running || !this.worker) return;
    this.shuttingDown = true;
    await this.worker.stop();
    this.running = false;
    this.shuttingDown = false;
  }

  /**
   * Bind SIGTERM and SIGINT handlers for graceful shutdown.
   * On signal, stops the worker and optionally calls the provided callback.
   */
  bindSignals(onShutdown?: () => void): this {
    if (this.signalsBound) return this;
    this.signalsBound = true;

    const handler = async (signal: string) => {
      console.log(`[ojs-express] Received ${signal}, shutting down worker...`);
      await this.stop();
      onShutdown?.();
    };

    process.on('SIGTERM', () => handler('SIGTERM'));
    process.on('SIGINT', () => handler('SIGINT'));
    return this;
  }

  /**
   * Returns true if the worker is running and processing jobs.
   */
  isHealthy(): boolean {
    return this.running && !this.shuttingDown;
  }

  /**
   * Returns an Express route handler for health checks.
   *
   * @example
   * ```ts
   * app.get('/health/worker', worker.healthHandler());
   * ```
   */
  healthHandler(): RequestHandler {
    return (_req: Request, res: Response): void => {
      const status = this.isHealthy() ? 'ok' : this.shuttingDown ? 'draining' : 'stopped';
      const code = this.isHealthy() ? 200 : 503;
      res.status(code).json({
        status,
        worker: {
          running: this.running,
          shuttingDown: this.shuttingDown,
          registeredTypes: this.getRegisteredTypes(),
          queues: this.options.queues ?? ['default'],
        },
      });
    };
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
