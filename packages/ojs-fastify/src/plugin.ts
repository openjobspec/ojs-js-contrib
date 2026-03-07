import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { OJSClient, OJSWorker } from '@openjobspec/sdk';

export interface OjsFastifyOptions {
  url: string;
  client?: OJSClient;
  worker?: OjsFastifyWorkerOptions;
}

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
class OjsWorkerManager {
  private worker: OJSWorker;
  private running = false;
  private shuttingDown = false;

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
      }
    }
  }

  register(type: string, handler: (ctx: unknown) => Promise<void>): this {
    this.worker.register(type, handler);
    return this;
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.worker.start();
    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.shuttingDown = true;
    await this.worker.stop();
    this.running = false;
    this.shuttingDown = false;
  }

  isHealthy(): boolean {
    return this.running && !this.shuttingDown;
  }

  getStatus(): { status: string; running: boolean; shuttingDown: boolean } {
    return {
      status: this.isHealthy() ? 'ok' : this.shuttingDown ? 'draining' : 'stopped',
      running: this.running,
      shuttingDown: this.shuttingDown,
    };
  }
}

const ojsPlugin: FastifyPluginAsync<OjsFastifyOptions> = async (
  fastify: FastifyInstance,
  options: OjsFastifyOptions,
) => {
  const client = options.client ?? new OJSClient({ url: options.url });

  fastify.decorate('ojs', client);

  // Set up worker if configured
  let workerManager: OjsWorkerManager | null = null;
  if (options.worker) {
    workerManager = new OjsWorkerManager(options.url, options.worker);
    await workerManager.start();
  }
  fastify.decorate('ojsWorker', workerManager);

  // Health route
  fastify.get('/health/worker', async (_request, reply) => {
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

export { OjsWorkerManager };

export default fp(ojsPlugin, {
  name: '@openjobspec/fastify',
  fastify: '>=4.0.0',
});
