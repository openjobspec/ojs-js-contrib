/**
 * @openjobspec/cloudflare — Cloudflare Workers adapter for OpenJobSpec.
 *
 * Provides fetch event handling, Queue Consumer integration, KV-based
 * job state caching, and Durable Objects for unique job enforcement.
 */

// ─── Core types ──────────────────────────────────────────────────────────────

/** JSON-compatible value type. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** OJS job as received by the worker. */
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

/** Push delivery response returned to the OJS server. */
export interface PushDeliveryResponse {
  status: 'completed' | 'failed';
  result?: JsonValue;
  error?: { code: string; message: string; retryable: boolean };
}

/** Handler function that processes an OJS job. */
export type JobHandler = (job: JobEvent, ctx: JobContext) => Promise<void>;

/** Context passed to job handlers. */
export interface JobContext {
  /** Cloudflare execution context for waitUntil. */
  executionCtx?: ExecutionContext;
  /** AbortSignal tied to the request/consumer lifecycle. */
  signal?: AbortSignal;
  /** KV namespace for job state caching (if configured). */
  kv?: KVNamespace;
  /** Trigger source. */
  trigger: 'fetch' | 'queue' | 'direct';
}

// ─── Configuration ───────────────────────────────────────────────────────────

/** Cloudflare Worker environment bindings. */
export interface OjsEnv {
  /** OJS server URL for callbacks. */
  OJS_URL?: string;
  /** KV namespace for job state caching. */
  OJS_KV?: KVNamespace;
  /** Durable Object namespace for unique job handling. */
  OJS_UNIQUE_JOBS?: DurableObjectNamespace;
  /** Catch-all for additional bindings. */
  [key: string]: unknown;
}

/** Configuration options for OjsCloudflareWorker. */
export interface OjsWorkerConfig {
  /** OJS server URL for callbacks (overrides env.OJS_URL). */
  ojsUrl?: string;
  /** TTL in seconds for KV-cached job state. Default: 3600. */
  kvTtlSeconds?: number;
  /** Logger implementation. Default: console. */
  logger?: Pick<Console, 'log' | 'error' | 'debug' | 'warn'>;
}

// ─── OjsCloudflareWorker ────────────────────────────────────────────────────

/**
 * Main Cloudflare Workers adapter for OpenJobSpec.
 *
 * Handles fetch events (HTTP push delivery), Cloudflare Queue consumers,
 * and provides KV-based caching and Durable Objects unique job support.
 *
 * @example
 * ```ts
 * const ojs = new OjsCloudflareWorker();
 * ojs.register('email.send', async (job) => {
 *   await sendEmail(job.args[0]);
 * });
 * export default ojs.asWorker();
 * ```
 */
export class OjsCloudflareWorker {
  private handlers = new Map<string, JobHandler>();
  private defaultHandler: JobHandler | null = null;
  private config: Required<Pick<OjsWorkerConfig, 'kvTtlSeconds'>> & OjsWorkerConfig;

  constructor(config: OjsWorkerConfig = {}) {
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
   * Returns a Cloudflare Worker module with `fetch` and `queue` exports.
   * Use as `export default ojs.asWorker()`.
   */
  asWorker(): ExportedHandler<OjsEnv> {
    return {
      fetch: (request: Request, env: OjsEnv, ctx: ExecutionContext) =>
        this.handleFetch(request, env, ctx),
      queue: (batch: MessageBatch<string>, env: OjsEnv, ctx: ExecutionContext) =>
        this.handleQueue(batch, env, ctx),
    };
  }

  /**
   * Handle an incoming HTTP request (fetch event).
   * Expects POST with a PushDeliveryRequest JSON body.
   */
  async handleFetch(
    request: Request,
    env: OjsEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method !== 'POST') {
      return jsonResponse(405, {
        status: 'failed',
        error: { code: 'method_not_allowed', message: 'only POST is accepted', retryable: false },
      });
    }

    let req: PushDeliveryRequest;
    try {
      req = await request.json() as PushDeliveryRequest;
    } catch {
      return jsonResponse(400, {
        status: 'failed',
        error: { code: 'invalid_request', message: 'failed to parse request body', retryable: false },
      });
    }

    const jobCtx: JobContext = {
      executionCtx: ctx,
      kv: env.OJS_KV,
      trigger: 'fetch',
    };

    try {
      await this.processJob(req.job, jobCtx, env);
      this.cacheJobState(env, req.job.id, 'completed', ctx);
      return jsonResponse(200, { status: 'completed' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.config.logger?.error(`[ojs] job ${req.job.id} failed: ${message}`);
      this.cacheJobState(env, req.job.id, 'failed', ctx);
      return jsonResponse(200, {
        status: 'failed',
        error: { code: 'handler_error', message, retryable: true },
      });
    }
  }

  /**
   * Handle a Cloudflare Queue batch of messages.
   * Each message body should be a JSON-serialized JobEvent.
   */
  async handleQueue(
    batch: MessageBatch<string>,
    env: OjsEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    const jobCtx: JobContext = {
      executionCtx: ctx,
      kv: env.OJS_KV,
      trigger: 'queue',
    };

    for (const message of batch.messages) {
      let job: JobEvent;
      try {
        job = typeof message.body === 'string'
          ? JSON.parse(message.body) as JobEvent
          : message.body as unknown as JobEvent;
      } catch {
        this.config.logger?.error(`[ojs] failed to parse queue message ${message.id}`);
        message.ack();
        continue;
      }

      try {
        await this.processJob(job, jobCtx, env);
        message.ack();
        this.cacheJobState(env, job.id, 'completed', ctx);
        this.config.logger?.log(`[ojs] job ${job.id} completed`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.config.logger?.error(`[ojs] job ${job.id} failed: ${msg}`);
        message.retry();
      }
    }
  }

  /**
   * Process a job directly (useful for testing or internal routing).
   */
  async processJobDirect(job: JobEvent, env?: OjsEnv): Promise<void> {
    const jobCtx: JobContext = { trigger: 'direct', kv: env?.OJS_KV };
    return this.processJob(job, jobCtx, env);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async processJob(
    job: JobEvent,
    jobCtx: JobContext,
    env?: OjsEnv,
  ): Promise<void> {
    // Unique job check via Durable Objects.
    if (env?.OJS_UNIQUE_JOBS) {
      const acquired = await this.acquireUniqueLock(env.OJS_UNIQUE_JOBS, job);
      if (!acquired) {
        this.config.logger?.debug?.(`[ojs] duplicate job skipped: ${job.id}`);
        return;
      }
    }

    const handler = this.handlers.get(job.type) ?? this.defaultHandler;
    if (!handler) {
      throw new Error(`no handler registered for job type: ${job.type}`);
    }

    await handler(job, jobCtx);
  }

  /** Cache job state in KV (fire-and-forget via waitUntil). */
  private cacheJobState(
    env: OjsEnv,
    jobId: string,
    state: string,
    ctx?: ExecutionContext,
  ): void {
    if (!env.OJS_KV) return;
    const put = env.OJS_KV.put(
      `ojs:job:${jobId}:state`,
      JSON.stringify({ state, updated_at: new Date().toISOString() }),
      { expirationTtl: this.config.kvTtlSeconds },
    );
    if (ctx) {
      ctx.waitUntil(put);
    }
  }

  /**
   * Attempt to acquire a unique lock via Durable Objects.
   * Returns true if this invocation should process the job.
   */
  private async acquireUniqueLock(
    ns: DurableObjectNamespace,
    job: JobEvent,
  ): Promise<boolean> {
    try {
      const id = ns.idFromName(`ojs-unique:${job.type}:${job.id}`);
      const stub = ns.get(id);
      const resp = await stub.fetch('https://ojs-internal/acquire', {
        method: 'POST',
        body: JSON.stringify({ job_id: job.id, job_type: job.type }),
      });
      const data = await resp.json() as { acquired: boolean };
      return data.acquired;
    } catch (err) {
      // On failure, allow processing (graceful degradation).
      this.config.logger?.warn?.(`[ojs] unique lock check failed, proceeding: ${err}`);
      return true;
    }
  }
}

// ─── Durable Object for unique jobs ──────────────────────────────────────────

/**
 * Durable Object class for enforcing unique job processing.
 * Bind this in your wrangler.toml as a Durable Object class.
 *
 * @example wrangler.toml
 * ```toml
 * [durable_objects]
 * bindings = [{ name = "OJS_UNIQUE_JOBS", class_name = "OjsUniqueJobDO" }]
 * ```
 */
export class OjsUniqueJobDO implements DurableObject {
  private state: DurableObjectState;
  private processing = false;

  constructor(state: DurableObjectState, _env: OjsEnv) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/acquire' && request.method === 'POST') {
      if (this.processing) {
        return Response.json({ acquired: false });
      }
      this.processing = true;
      await this.state.storage.put('processing', true);

      // Auto-release after 5 minutes to prevent stale locks.
      this.state.storage.setAlarm(Date.now() + 5 * 60 * 1000);

      return Response.json({ acquired: true });
    }

    if (url.pathname === '/release' && request.method === 'POST') {
      this.processing = false;
      await this.state.storage.delete('processing');
      return Response.json({ released: true });
    }

    if (url.pathname === '/status') {
      return Response.json({ processing: this.processing });
    }

    return new Response('Not Found', { status: 404 });
  }

  async alarm(): Promise<void> {
    // Auto-release stale lock.
    this.processing = false;
    await this.state.storage.delete('processing');
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export type {
  KVNamespace,
  DurableObjectNamespace,
  DurableObjectState,
  DurableObject,
  ExecutionContext,
  MessageBatch,
  ExportedHandler,
} from '@cloudflare/workers-types';
