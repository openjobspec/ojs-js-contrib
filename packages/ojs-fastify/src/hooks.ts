import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

/** Options for the OJS hooks plugin. */
export interface OjsHooksOptions {
  /** Log job operations (default: true). */
  logging?: boolean;
  /** Track request-to-job correlation (default: false). */
  correlation?: boolean;
  /** Job type used for error notification jobs (default: 'ojs.error_notification'). */
  errorJobType?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    _ojsEnqueuedJobs?: Array<{ type: string; id: unknown }>;
  }
}

/**
 * Creates Fastify hooks for OJS observability:
 *
 * - `onResponse`: log enqueued jobs per request
 * - `onError`: automatically enqueue error notification jobs
 * - `onClose`: graceful worker shutdown
 *
 * Requires the base `ojsPlugin` to be registered first.
 */
export function createOjsHooks(options?: OjsHooksOptions): FastifyPluginAsync {
  const logging = options?.logging ?? true;
  const correlation = options?.correlation ?? false;
  const errorJobType = options?.errorJobType ?? 'ojs.error_notification';

  const plugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    // Decorate request with job tracking array
    fastify.decorateRequest('_ojsEnqueuedJobs', null);

    if (correlation) {
      fastify.addHook('onRequest', async (request: FastifyRequest) => {
        request._ojsEnqueuedJobs = [];
      });
    }

    if (logging) {
      /** onResponse: log enqueued jobs per request. */
      fastify.addHook(
        'onResponse',
        async (request: FastifyRequest, reply: FastifyReply) => {
          const jobs = request._ojsEnqueuedJobs;
          if (jobs && jobs.length > 0) {
            fastify.log.info(
              {
                requestId: request.id,
                statusCode: reply.statusCode,
                enqueuedJobs: jobs.length,
                jobIds: jobs.map((j) => j.id),
              },
              `OJS: ${jobs.length} job(s) enqueued during request ${request.id}`,
            );
          }
        },
      );
    }

    /** onError: enqueue error notification jobs. */
    fastify.addHook(
      'onError',
      async (request: FastifyRequest, _reply: FastifyReply, error: Error) => {
        try {
          await fastify.ojs.enqueue(errorJobType, [
            {
              requestId: request.id,
              url: request.url,
              method: request.method,
              error: {
                message: error.message,
                name: error.name,
              },
              timestamp: new Date().toISOString(),
            },
          ]);
        } catch (enqueueError) {
          fastify.log.error(
            { err: enqueueError },
            'OJS: Failed to enqueue error notification job',
          );
        }
      },
    );

    /** onClose: graceful worker shutdown. */
    fastify.addHook('onClose', async () => {
      if (fastify.ojsWorker) {
        await fastify.ojsWorker.stop();
      }
    });
  };

  return fp(plugin, {
    name: '@openjobspec/fastify-hooks',
    fastify: '>=4.0.0',
    dependencies: ['@openjobspec/fastify'],
  });
}
