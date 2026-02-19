/**
 * @openjobspec/vercel — Vercel Edge and Serverless adapter for OpenJobSpec.
 *
 * Provides Next.js API route helpers, Edge Function handlers,
 * background job enqueueing, and optional Vercel KV caching.
 */

// ─── Core types ──────────────────────────────────────────────────────────────

/** JSON-compatible value type. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** OJS job event. */
export interface JobEvent {
  id: string;
  type: string;
  queue: string;
  args: JsonValue[];
  attempt: number;
  meta?: Record<string, JsonValue>;
  priority?: number;
}

/** Push delivery request from an OJS server. */
export interface PushDeliveryRequest {
  job: JobEvent;
  worker_id: string;
  delivery_id: string;
}

/** Push delivery response. */
export interface PushDeliveryResponse {
  status: 'completed' | 'failed';
  result?: JsonValue;
  error?: { code: string; message: string; retryable: boolean };
}

/** Handler function for processing an OJS job. */
export type JobHandler = (job: JobEvent, ctx: OjsRequestContext) => Promise<void>;

/** Context passed to job handlers in Vercel environment. */
export interface OjsRequestContext {
  /** The original request (available in both Node and Edge runtimes). */
  request: Request;
  /** Trigger source identifier. */
  trigger: 'api_route' | 'edge' | 'enqueue';
  /** Vercel KV client (if configured). */
  kv?: VercelKVClient;
  /** Abort signal from the request. */
  signal?: AbortSignal;
}

// ─── Vercel KV integration ───────────────────────────────────────────────────

/**
 * Minimal Vercel KV client interface.
 * Compatible with @vercel/kv's default export.
 */
export interface VercelKVClient {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/** Configuration for OJS Vercel adapters. */
export interface OjsVercelConfig {
  /** OJS server base URL for enqueue/callback operations. */
  ojsUrl: string;
  /** Vercel KV client instance for job state caching. */
  kv?: VercelKVClient;
  /** TTL in seconds for KV-cached job state. Default: 3600. */
  kvTtlSeconds?: number;
  /** Logger. Default: console. */
  logger?: Pick<Console, 'log' | 'error' | 'debug' | 'warn'>;
}

// ─── OJS Vercel Handler Registry ─────────────────────────────────────────────

/**
 * Central handler registry used by both API routes and Edge Functions.
 *
 * @example
 * ```ts
 * const ojs = new OjsVercelHandler({ ojsUrl: process.env.OJS_URL! });
 * ojs.register('email.send', async (job) => { ... });
 *
 * // Next.js API Route (pages/api/ojs.ts)
 * export default ojs.apiRouteHandler();
 *
 * // Next.js Edge Route (app/api/ojs/route.ts)
 * export const POST = ojs.edgeHandler();
 * export const runtime = 'edge';
 * ```
 */
export class OjsVercelHandler {
  private handlers = new Map<string, JobHandler>();
  private defaultHandler: JobHandler | null = null;
  private config: OjsVercelConfig & { kvTtlSeconds: number };

  constructor(config: OjsVercelConfig) {
    this.config = {
      kvTtlSeconds: 3600,
      ...config,
      logger: config.logger ?? console,
    };
  }

  /** Register a handler for a specific job type. */
  register(jobType: string, handler: JobHandler): this {
    this.handlers.set(jobType, handler);
    return this;
  }

  /** Register a fallback handler for unregistered job types. */
  registerDefault(handler: JobHandler): this {
    this.defaultHandler = handler;
    return this;
  }

  /**
   * Process a push delivery request body and return a response payload.
   * Shared by both API route and Edge handlers.
   */
  private async processRequest(
    body: PushDeliveryRequest,
    ctx: OjsRequestContext,
  ): Promise<PushDeliveryResponse> {
    const handler = this.handlers.get(body.job.type) ?? this.defaultHandler;
    if (!handler) {
      return {
        status: 'failed',
        error: {
          code: 'no_handler',
          message: `no handler registered for job type: ${body.job.type}`,
          retryable: false,
        },
      };
    }

    try {
      await handler(body.job, ctx);
      this.cacheJobState(body.job.id, 'completed');
      return { status: 'completed' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.config.logger?.error?.(`[ojs] job ${body.job.id} failed: ${message}`);
      this.cacheJobState(body.job.id, 'failed');
      return {
        status: 'failed',
        error: { code: 'handler_error', message, retryable: true },
      };
    }
  }

  /** Cache job state in Vercel KV (fire-and-forget). */
  private cacheJobState(jobId: string, state: string): void {
    if (!this.config.kv) return;
    this.config.kv
      .set(
        `ojs:job:${jobId}:state`,
        { state, updated_at: new Date().toISOString() },
        { ex: this.config.kvTtlSeconds },
      )
      .catch((err: unknown) => {
        this.config.logger?.warn?.(`[ojs] KV cache write failed: ${err}`);
      });
  }

  // ─── API Route Handler (Next.js Pages Router / Node runtime) ─────────────

  /**
   * Returns a handler for Next.js API routes (Pages Router).
   * The returned function uses the Web API Request/Response types
   * compatible with Next.js 13+ App Router API routes.
   *
   * @example
   * ```ts
   * // app/api/ojs/route.ts
   * const ojs = new OjsVercelHandler({ ojsUrl: process.env.OJS_URL! });
   * ojs.register('email.send', handleEmail);
   * export const POST = ojs.apiRouteHandler();
   * ```
   */
  apiRouteHandler(): (request: Request) => Promise<Response> {
    return async (request: Request): Promise<Response> => {
      if (request.method !== 'POST') {
        return jsonResponse(405, {
          status: 'failed',
          error: { code: 'method_not_allowed', message: 'only POST is accepted', retryable: false },
        });
      }

      let body: PushDeliveryRequest;
      try {
        body = (await request.json()) as PushDeliveryRequest;
      } catch {
        return jsonResponse(400, {
          status: 'failed',
          error: { code: 'invalid_request', message: 'failed to parse request body', retryable: false },
        });
      }

      const ctx: OjsRequestContext = {
        request,
        trigger: 'api_route',
        kv: this.config.kv,
        signal: request.signal,
      };

      const result = await this.processRequest(body, ctx);
      return jsonResponse(result.status === 'completed' ? 200 : 200, result);
    };
  }

  // ─── Edge Function Handler ───────────────────────────────────────────────

  /**
   * Returns a handler for Vercel Edge Functions.
   * Optimized for the Edge runtime with minimal cold start.
   *
   * @example
   * ```ts
   * // app/api/ojs/route.ts
   * export const runtime = 'edge';
   * const ojs = new OjsVercelHandler({ ojsUrl: process.env.OJS_URL! });
   * ojs.register('email.send', handleEmail);
   * export const POST = ojs.edgeHandler();
   * ```
   */
  edgeHandler(): (request: Request) => Promise<Response> {
    return async (request: Request): Promise<Response> => {
      if (request.method !== 'POST') {
        return jsonResponse(405, {
          status: 'failed',
          error: { code: 'method_not_allowed', message: 'only POST is accepted', retryable: false },
        });
      }

      let body: PushDeliveryRequest;
      try {
        body = (await request.json()) as PushDeliveryRequest;
      } catch {
        return jsonResponse(400, {
          status: 'failed',
          error: { code: 'invalid_request', message: 'failed to parse request body', retryable: false },
        });
      }

      const ctx: OjsRequestContext = {
        request,
        trigger: 'edge',
        kv: this.config.kv,
        signal: request.signal,
      };

      const result = await this.processRequest(body, ctx);
      return jsonResponse(200, result);
    };
  }

  // ─── Background Enqueueing ─────────────────────────────────────────────

  /**
   * Enqueue a job to the OJS server from a Vercel function.
   * Calls the OJS HTTP API to submit a new job.
   */
  async enqueue(
    jobType: string,
    args: JsonValue[] = [],
    options?: {
      queue?: string;
      priority?: number;
      meta?: Record<string, JsonValue>;
      scheduled_at?: string;
    },
  ): Promise<{ id: string }> {
    const resp = await fetch(`${this.config.ojsUrl}/api/v1/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: jobType,
        args,
        queue: options?.queue ?? 'default',
        priority: options?.priority,
        meta: options?.meta,
        scheduled_at: options?.scheduled_at,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => 'unknown error');
      throw new Error(`OJS enqueue failed (${resp.status}): ${text}`);
    }

    return (await resp.json()) as { id: string };
  }

  /**
   * Get cached job state from Vercel KV.
   * Returns null if KV is not configured or key doesn't exist.
   */
  async getCachedJobState(
    jobId: string,
  ): Promise<{ state: string; updated_at: string } | null> {
    if (!this.config.kv) return null;
    const data = await this.config.kv.get(`ojs:job:${jobId}:state`);
    return data as { state: string; updated_at: string } | null;
  }
}

// ─── Convenience factory functions ───────────────────────────────────────────

/**
 * Create a Next.js API route handler for OJS push delivery.
 *
 * @example
 * ```ts
 * // app/api/ojs/route.ts
 * import { ojsApiRoute } from '@openjobspec/vercel';
 *
 * const handlers = { 'email.send': async (job) => { ... } };
 * export const POST = ojsApiRoute({ ojsUrl: process.env.OJS_URL!, handlers });
 * ```
 */
export function ojsApiRoute(config: OjsVercelConfig & {
  handlers: Record<string, JobHandler>;
  defaultHandler?: JobHandler;
}): (request: Request) => Promise<Response> {
  const ojs = new OjsVercelHandler(config);
  for (const [type, handler] of Object.entries(config.handlers)) {
    ojs.register(type, handler);
  }
  if (config.defaultHandler) {
    ojs.registerDefault(config.defaultHandler);
  }
  return ojs.apiRouteHandler();
}

/**
 * Create a Vercel Edge Function handler for OJS push delivery.
 *
 * @example
 * ```ts
 * // app/api/ojs/route.ts
 * import { ojsEdgeHandler } from '@openjobspec/vercel';
 *
 * export const runtime = 'edge';
 * const handlers = { 'email.send': async (job) => { ... } };
 * export const POST = ojsEdgeHandler({ ojsUrl: process.env.OJS_URL!, handlers });
 * ```
 */
export function ojsEdgeHandler(config: OjsVercelConfig & {
  handlers: Record<string, JobHandler>;
  defaultHandler?: JobHandler;
}): (request: Request) => Promise<Response> {
  const ojs = new OjsVercelHandler(config);
  for (const [type, handler] of Object.entries(config.handlers)) {
    ojs.register(type, handler);
  }
  if (config.defaultHandler) {
    ojs.registerDefault(config.defaultHandler);
  }
  return ojs.edgeHandler();
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
