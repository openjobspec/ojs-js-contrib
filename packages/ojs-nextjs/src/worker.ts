import { OJSClient } from '@openjobspec/sdk';
import type { Job } from '@openjobspec/sdk';
import { getOjsClient } from './server.js';

/** Options for the Next.js job processor */
export interface OjsNextWorkerOptions {
  /** Base URL for the OJS server */
  baseUrl?: string;
  /** Custom OJSClient instance */
  client?: OJSClient;
  /** Max execution time in ms (for serverless environments) */
  maxDuration?: number;
}

/** A function that handles a single job */
export type JobHandler = (job: {
  id: string;
  type: string;
  args: unknown[];
  attempt: number;
}) => Promise<unknown>;

/** Result returned after processing a job */
export interface JobProcessorResult {
  jobId: string;
  type: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Creates an API route handler that processes OJS jobs pushed via webhooks.
 * Designed for serverless environments where long-polling isn't possible.
 * The OJS server pushes jobs to this endpoint, and registered handlers
 * process them within the request lifecycle.
 *
 * @example
 * ```ts
 * // app/api/ojs/worker/route.ts
 * import { createJobProcessor } from '@openjobspec/nextjs/worker';
 *
 * const processor = createJobProcessor({ baseUrl: process.env.OJS_URL });
 * processor.register('email.send', async (job) => {
 *   await sendEmail(job.args[0], job.args[1]);
 * });
 * processor.register('report.generate', async (job) => {
 *   await generateReport(job.args[0]);
 * });
 *
 * export const POST = processor.handler;
 * ```
 */
export function createJobProcessor(options: OjsNextWorkerOptions = {}): {
  /** Register a handler for a specific job type */
  register: (type: string, handler: JobHandler) => void;
  /** The POST route handler to export from your route file */
  handler: (request: Request) => Promise<Response>;
} {
  const handlers = new Map<string, JobHandler>();

  const resolveClient = (): OJSClient => {
    if (options.client) return options.client;
    if (options.baseUrl) return new OJSClient({ url: options.baseUrl });
    return getOjsClient();
  };

  function register(type: string, handler: JobHandler): void {
    handlers.set(type, handler);
  }

  /**
   * Processes a job pushed by the OJS server.
   * Expects request body: `{ id, type, args, attempt }`
   */
  async function handler(request: Request): Promise<Response> {
    let body: { id: string; type: string; args: unknown[]; attempt: number };

    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!body.id || !body.type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields "id" and "type"' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const jobHandler = handlers.get(body.type);
    if (!jobHandler) {
      return new Response(
        JSON.stringify({ error: `No handler registered for job type "${body.type}"` }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const timeoutMs = options.maxDuration ?? 30_000;
    const client = resolveClient();

    try {
      const resultPromise = jobHandler({
        id: body.id,
        type: body.type,
        args: body.args ?? [],
        attempt: body.attempt ?? 1,
      });

      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error(`Job exceeded max duration of ${timeoutMs}ms`)),
          timeoutMs,
        );
      });

      const result = await Promise.race([resultPromise, timeoutPromise]);

      // Report completion back to the OJS server
      const job: Job = await client.getJob(body.id);

      const response: JobProcessorResult = {
        jobId: body.id,
        type: body.type,
        success: true,
        result: result ?? job.result,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';

      const response: JobProcessorResult = {
        jobId: body.id,
        type: body.type,
        success: false,
        error: message,
      };

      return new Response(JSON.stringify(response), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return { register, handler };
}
