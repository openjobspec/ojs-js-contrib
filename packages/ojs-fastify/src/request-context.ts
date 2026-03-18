import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { OJSClient, JsonValue, EnqueueOptions, Job, JobSpec } from '@openjobspec/sdk';

/** Per-request OJS context with correlation tracking. */
export interface OjsRequestContext {
  /** The shared OJS client. */
  readonly client: OJSClient;
  /** Unique request ID for job correlation. */
  readonly requestId: string;

  /** Enqueue a job correlated with this request. */
  enqueue(
    type: string,
    args: JsonValue | JsonValue[],
    options?: EnqueueOptions,
  ): Promise<Job>;

  /** Enqueue multiple jobs correlated with this request. */
  enqueueBatch(
    jobs: JobSpec[],
  ): Promise<Job[]>;
}

declare module 'fastify' {
  interface FastifyRequest {
    ojsContext: OjsRequestContext;
  }
}

/** Options for the OJS request context plugin. */
export interface OjsRequestContextOptions {
  /** Custom correlation ID header name (default: 'x-correlation-id'). */
  correlationHeader?: string;
}

/**
 * Creates a per-request OJS context with correlation metadata.
 *
 * Requires the base `ojsPlugin` to be registered first so `fastify.ojs` is available.
 * Decorates each request with `request.ojsContext` containing an `enqueue` and
 * `enqueueBatch` that automatically inject `_requestId` and `_correlationId` metadata.
 */
const ojsRequestContextPlugin: FastifyPluginAsync<OjsRequestContextOptions> = async (
  fastify: FastifyInstance,
  options: OjsRequestContextOptions,
) => {
  const correlationHeader = options.correlationHeader ?? 'x-correlation-id';

  // Decorate request with a placeholder so Fastify knows the shape
  fastify.decorateRequest('ojsContext', null);

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const client = fastify.ojs;
    const requestId = request.id;
    const correlationId =
      (request.headers[correlationHeader] as string | undefined) ?? requestId;

    const context: OjsRequestContext = {
      client,
      requestId,

      async enqueue(
        type: string,
        args: JsonValue | JsonValue[],
        opts?: EnqueueOptions,
      ): Promise<Job> {
        const merged: EnqueueOptions = {
          ...opts,
          meta: {
            ...(opts?.meta ?? {}),
            _requestId: requestId,
            _correlationId: correlationId,
          },
        };
        return client.enqueue(type, args, merged);
      },

      async enqueueBatch(jobs: JobSpec[]): Promise<Job[]> {
        const enriched: JobSpec[] = jobs.map((job) => ({
          ...job,
          options: {
            ...job.options,
            meta: {
              ...(job.options?.meta ?? {}),
              _requestId: requestId,
              _correlationId: correlationId,
            },
          },
        }));
        return client.enqueueBatch(enriched);
      },
    };

    request.ojsContext = context;
  });
};

export default fp(ojsRequestContextPlugin, {
  name: '@openjobspec/fastify-request-context',
  fastify: '>=4.0.0',
  dependencies: ['@openjobspec/fastify'],
});
