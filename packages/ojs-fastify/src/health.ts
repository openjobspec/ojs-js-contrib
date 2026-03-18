import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/** Options for the OJS health check plugin. */
export interface OjsHealthOptions {
  /** Route prefix (default: '/health'). */
  prefix?: string;
  /** Include detailed worker info (default: false). */
  detailed?: boolean;
}

/**
 * Registers comprehensive health check routes for OJS:
 *
 * - `GET {prefix}/ojs` — Overall OJS health (client + optional worker)
 * - `GET {prefix}/ojs/client` — Client connectivity check
 * - `GET {prefix}/ojs/worker` — Worker status (if configured)
 *
 * Requires the base `ojsPlugin` to be registered first.
 */
const ojsHealthPlugin: FastifyPluginAsync<OjsHealthOptions> = async (
  fastify: FastifyInstance,
  options: OjsHealthOptions,
) => {
  const prefix = options.prefix ?? '/health';
  const detailed = options.detailed ?? false;

  /** GET {prefix}/ojs — Overall health combining client and worker status. */
  fastify.get(`${prefix}/ojs`, async (_request, reply) => {
    const result: Record<string, unknown> = {};
    let healthy = true;

    // Client health
    try {
      const clientHealth = await fastify.ojs.health();
      result.client = { status: 'ok', ...( detailed ? { details: clientHealth } : {}) };
    } catch {
      healthy = false;
      result.client = { status: 'error' };
    }

    // Worker health (optional)
    if (fastify.ojsWorker) {
      const workerStatus = fastify.ojsWorker.getStatus();
      result.worker = detailed ? workerStatus : { status: workerStatus.status };
      if (workerStatus.status !== 'ok') {
        healthy = false;
      }
    }

    result.status = healthy ? 'ok' : 'degraded';
    return reply.status(healthy ? 200 : 503).send(result);
  });

  /** GET {prefix}/ojs/client — Client connectivity check. */
  fastify.get(`${prefix}/ojs/client`, async (_request, reply) => {
    try {
      const clientHealth = await fastify.ojs.health();
      const body: Record<string, unknown> = { status: 'ok' };
      if (detailed) {
        body.details = clientHealth;
      }
      return reply.status(200).send(body);
    } catch {
      return reply.status(503).send({ status: 'error' });
    }
  });

  /** GET {prefix}/ojs/worker — Worker status. */
  fastify.get(`${prefix}/ojs/worker`, async (_request, reply) => {
    if (!fastify.ojsWorker) {
      return reply.status(404).send({ error: 'Worker not configured' });
    }
    const workerStatus = fastify.ojsWorker.getStatus();
    const healthy = workerStatus.status === 'ok';
    return reply.status(healthy ? 200 : 503).send(workerStatus);
  });
};

export default fp(ojsHealthPlugin, {
  name: '@openjobspec/fastify-health',
  fastify: '>=4.0.0',
  dependencies: ['@openjobspec/fastify'],
});
