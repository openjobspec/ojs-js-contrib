import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { OJSClient, OJSWorker } from '@openjobspec/sdk';

/** Options for the core OJS Fastify plugin. */
export interface OjsFastifyOptions {
  /** OJS server URL. */
  url: string;
  /** Pre-configured OJSClient instance (overrides url-based creation). */
  client?: OJSClient;
  /** Worker configuration. Omit to run without a worker. */
  worker?: OjsFastifyWorkerOptions;
  /** Route prefix for the built-in health route (default: '/health'). */
  prefix?: string;
  /** Automatically start the worker on plugin registration (default: true). */
  autoStart?: boolean;
}

/** Worker configuration options. */
export interface OjsFastifyWorkerOptions {
  queues?: string[];
  concurrency?: number;
  pollInterval?: number;
  handlers?: Record<string, (ctx: unknown) => Promise<void>>;
}

declare module 'fastify' {
  interface FastifyInstance {
    ojs: OJSClient;
    ojsWorker: OjsWorkerManager | null;
  }
}

/** Lightweight worker manager for Fastify. */
export class OjsWorkerManager {
  private worker: OJSWorker;
  private running = false;
  private shuttingDown = false;
  private registeredTypes: Set<string> = new Set();

  constructor(url: string, options: OjsFastifyWorkerOptions) {
    this.worker = new OJSWorker({
      url,
      queues: options.queues ?? ['default'],
      concurrency: options.concurrency ?? 10,
      pollInterval: options.pollInterval ?? 1000,
    });

    if (options.handlers) {
      for (const [type, handler] of Object.entries(options.handlers)) {
        this.worker.register(type, handler);
        this.registeredTypes.add(type);
      }
    }
  }

  /** Register a handler for the given job type. */
  register(type: string, handler: (ctx: unknown) => Promise<void>): this {
    this.worker.register(type, handler);
    this.registeredTypes.add(type);
    return this;
  }

  /** Start the worker. No-op if already running. */
  async start(): Promise<void> {
    if (this.running) return;
    await this.worker.start();
    this.running = true;
  }

  /** Stop the worker gracefully. No-op if not running. */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.shuttingDown = true;
    await this.worker.stop();
    this.running = false;
    this.shuttingDown = false;
  }

  /** Returns true if the worker is running and not shutting down. */
  isHealthy(): boolean {
    return this.running && !this.shuttingDown;
  }

  /** Returns a list of registered job handler type names. */
  getRegisteredTypes(): string[] {
    return [...this.registeredTypes];
  }

  /** Returns the current worker status including handler count. */
  getStatus(): {
    status: string;
    running: boolean;
    shuttingDown: boolean;
    registeredHandlers: number;
    registeredTypes: string[];
  } {
    return {
      status: this.isHealthy() ? 'ok' : this.shuttingDown ? 'draining' : 'stopped',
      running: this.running,
      shuttingDown: this.shuttingDown,
      registeredHandlers: this.registeredTypes.size,
      registeredTypes: this.getRegisteredTypes(),
    };
  }
}

const ojsPlugin: FastifyPluginAsync<OjsFastifyOptions> = async (
  fastify: FastifyInstance,
  options: OjsFastifyOptions,
) => {
  const client = options.client ?? new OJSClient({ url: options.url });
  const prefix = options.prefix ?? '/health';
  const autoStart = options.autoStart ?? true;

  fastify.decorate('ojs', client);

  // Set up worker if configured
  let workerManager: OjsWorkerManager | null = null;
  if (options.worker) {
    workerManager = new OjsWorkerManager(options.url, options.worker);
    if (autoStart) {
      await workerManager.start();
    }
  }
  fastify.decorate('ojsWorker', workerManager);

  // Health route
  fastify.get(`${prefix}/worker`, async (_request, reply) => {
    if (!workerManager) {
      return reply.status(404).send({ error: 'Worker not configured' });
    }
    const status = workerManager.getStatus();
    return reply.status(status.status === 'ok' ? 200 : 503).send(status);
  });

  // Graceful shutdown on server close
  fastify.addHook('onClose', async () => {
    if (workerManager) {
      await workerManager.stop();
    }
  });
};

export default fp(ojsPlugin, {
  name: '@openjobspec/fastify',
  fastify: '>=4.0.0',
});
