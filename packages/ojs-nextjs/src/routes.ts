import { OJSClient } from '@openjobspec/sdk';
import type { Job, EnqueueOptions, JsonValue } from '@openjobspec/sdk';
import { getOjsClient } from './server.js';

/** Options for createOjsRouteHandlers */
export interface OjsRouteHandlerOptions {
  /** Custom OJSClient instance */
  client?: OJSClient;
  /** Base URL for the OJS server */
  baseUrl?: string;
  /** Callback invoked for each webhook event */
  onWebhook?: (event: OjsWebhookEvent) => Promise<void>;
  /** Secret for validating webhook signatures */
  webhookSecret?: string;
}

/** Webhook event delivered by the OJS server */
export interface OjsWebhookEvent {
  type:
    | 'job.completed'
    | 'job.failed'
    | 'job.cancelled'
    | 'job.retrying'
    | 'job.progress';
  jobId: string;
  jobType: string;
  queue: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

/** Request body for enqueueing a single job */
interface EnqueueJobBody {
  type: string;
  args: JsonValue[];
  options?: EnqueueOptions;
}

/** Request body for enqueueing a batch of jobs */
interface EnqueueBatchBody {
  jobs: Array<{ type: string; args: JsonValue[]; options?: EnqueueOptions }>;
}

/**
 * Extracts the OJS sub-path from a full URL.
 * Looks for `/api/ojs/` in the pathname and returns everything after it.
 */
function extractSlug(url: string): string[] {
  const { pathname } = new URL(url);
  const marker = '/api/ojs/';
  const idx = pathname.indexOf(marker);
  if (idx === -1) return [];
  const rest = pathname.slice(idx + marker.length);
  return rest.split('/').filter(Boolean);
}

/**
 * Validates a webhook signature using HMAC-SHA256 with constant-time comparison.
 * Returns true if the signature matches, false otherwise.
 */
async function validateWebhookSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const crypto = await import('node:crypto');
    const expected = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    const sig = signature.replace(/^sha256=/, '');
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Creates Next.js App Router route handlers for OJS operations.
 *
 * Supports the following routes (relative to the mount point):
 * - `GET  .../health`       — OJS server health check
 * - `GET  .../jobs/:id`     — retrieve a job by ID
 * - `POST .../jobs`         — enqueue a single job
 * - `POST .../jobs/batch`   — enqueue a batch of jobs
 * - `POST .../webhooks`     — receive webhook callbacks
 * - `DELETE .../jobs/:id`   — cancel a job
 *
 * @example
 * ```ts
 * // app/api/ojs/[...slug]/route.ts
 * import { createOjsRouteHandlers } from '@openjobspec/nextjs/routes';
 *
 * export const { GET, POST, DELETE } = createOjsRouteHandlers({
 *   baseUrl: process.env.OJS_URL,
 * });
 * ```
 */
export function createOjsRouteHandlers(options: OjsRouteHandlerOptions = {}): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
  DELETE: (request: Request) => Promise<Response>;
} {
  const resolveClient = (): OJSClient => {
    if (options.client) return options.client;
    if (options.baseUrl) return new OJSClient({ url: options.baseUrl });
    return getOjsClient();
  };

  /**
   * GET handler: health check or retrieve a job.
   *
   * - `GET /api/ojs/health`     → `{ status: 'ok', ... }`
   * - `GET /api/ojs/jobs/:id`   → Job object
   */
  async function GET(request: Request): Promise<Response> {
    const slug = extractSlug(request.url);

    try {
      // GET /api/ojs/health
      if (slug[0] === 'health') {
        const client = resolveClient();
        const health = await client.health();
        return jsonResponse(health);
      }

      // GET /api/ojs/jobs/:id
      if (slug[0] === 'jobs' && slug[1]) {
        const client = resolveClient();
        const job: Job = await client.getJob(slug[1]);
        return jsonResponse(job);
      }

      return errorResponse('Not found', 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return errorResponse(message, 500);
    }
  }

  /**
   * POST handler: enqueue a job, enqueue a batch, or process a webhook.
   *
   * - `POST /api/ojs/jobs`          → enqueue single job
   * - `POST /api/ojs/jobs/batch`    → enqueue batch
   * - `POST /api/ojs/webhooks`      → webhook callback
   */
  async function POST(request: Request): Promise<Response> {
    const slug = extractSlug(request.url);

    try {
      // POST /api/ojs/webhooks
      if (slug[0] === 'webhooks') {
        const rawBody = await request.text();

        if (options.webhookSecret) {
          const signature = request.headers.get('x-ojs-signature') ?? '';
          const valid = await validateWebhookSignature(
            rawBody,
            signature,
            options.webhookSecret,
          );
          if (!valid) {
            return errorResponse('Invalid webhook signature', 401);
          }
        }

        const event = JSON.parse(rawBody) as OjsWebhookEvent;
        if (options.onWebhook) {
          await options.onWebhook(event);
        }
        return jsonResponse({ received: true });
      }

      // POST /api/ojs/jobs/batch
      if (slug[0] === 'jobs' && slug[1] === 'batch') {
        const body = (await request.json()) as EnqueueBatchBody;
        if (!Array.isArray(body.jobs) || body.jobs.length === 0) {
          return errorResponse('Request body must contain a non-empty "jobs" array', 400);
        }
        const client = resolveClient();
        const jobs: Job[] = await client.enqueueBatch(
          body.jobs.map((j) => ({
            type: j.type,
            args: j.args,
            ...j.options,
          })),
        );
        return jsonResponse(jobs, 201);
      }

      // POST /api/ojs/jobs
      if (slug[0] === 'jobs' && !slug[1]) {
        const body = (await request.json()) as EnqueueJobBody;
        if (!body.type) {
          return errorResponse('Missing required field "type"', 400);
        }
        const client = resolveClient();
        const job: Job = await client.enqueue(body.type, body.args ?? [], body.options);
        return jsonResponse(job, 201);
      }

      return errorResponse('Not found', 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return errorResponse(message, 500);
    }
  }

  /**
   * DELETE handler: cancel a job.
   *
   * - `DELETE /api/ojs/jobs/:id` → cancelled Job object
   */
  async function DELETE(request: Request): Promise<Response> {
    const slug = extractSlug(request.url);

    try {
      // DELETE /api/ojs/jobs/:id
      if (slug[0] === 'jobs' && slug[1]) {
        const client = resolveClient();
        const job: Job = await client.cancelJob(slug[1]);
        return jsonResponse(job);
      }

      return errorResponse('Not found', 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      return errorResponse(message, 500);
    }
  }

  return { GET, POST, DELETE };
}
