import { OJSClient, chain } from '@openjobspec/sdk';
import type { Job, EnqueueOptions, JsonValue, WorkflowStatus } from '@openjobspec/sdk';

let _client: OJSClient | null = null;

export interface OjsServerConfig {
  baseUrl: string;
}

/** A single step in a workflow definition */
export interface WorkflowStep {
  type: string;
  args: JsonValue[];
  options?: EnqueueOptions;
}

/**
 * Configure the global OJS client with a custom base URL.
 *
 * @example
 * ```ts
 * configureOjs({ baseUrl: 'http://localhost:8080' });
 * ```
 */
export function configureOjs(config: OjsServerConfig): void {
  _client = new OJSClient({ url: config.baseUrl });
}

/**
 * Returns the global OJS client instance. Creates one from the `OJS_URL`
 * environment variable if none has been configured.
 *
 * @example
 * ```ts
 * const client = getOjsClient();
 * const job = await client.enqueue('email.send', [{ to: 'a@b.com' }]);
 * ```
 */
export function getOjsClient(): OJSClient {
  if (!_client) {
    const url = process.env.OJS_URL ?? 'http://localhost:8080';
    _client = new OJSClient({ url });
  }
  return _client;
}

/**
 * Enqueue a single job from a Server Action or server component.
 *
 * @example
 * ```ts
 * const job = await enqueueJob('email.send', [{ to: 'user@test.com' }], { queue: 'emails' });
 * ```
 */
export async function enqueueJob(
  type: string,
  args: JsonValue[],
  options?: EnqueueOptions,
): Promise<Job> {
  const client = getOjsClient();
  return client.enqueue(type, args, options);
}

/**
 * Retrieve a job by ID.
 *
 * @example
 * ```ts
 * const job = await getJob('01HX1234...');
 * console.log(job.state); // 'completed'
 * ```
 */
export async function getJob(jobId: string): Promise<Job> {
  const client = getOjsClient();
  return client.getJob(jobId);
}

/**
 * Cancel a job by ID.
 *
 * @example
 * ```ts
 * const cancelled = await cancelJob('01HX1234...');
 * ```
 */
export async function cancelJob(jobId: string): Promise<Job> {
  const client = getOjsClient();
  return client.cancelJob(jobId);
}

/**
 * Enqueue a batch of jobs from a Server Action.
 *
 * @example
 * ```ts
 * const jobs = await enqueueJobBatch([
 *   { type: 'email.send', args: [{ to: 'a@b.com' }] },
 *   { type: 'email.send', args: [{ to: 'c@d.com' }], options: { queue: 'bulk' } },
 * ]);
 * ```
 */
export async function enqueueJobBatch(
  jobs: Array<{ type: string; args: JsonValue[]; options?: EnqueueOptions }>,
): Promise<Job[]> {
  const client = getOjsClient();
  return client.enqueueBatch(
    jobs.map((j) => ({
      type: j.type,
      args: j.args,
      ...j.options,
    })),
  );
}

/**
 * Check OJS server health from a Server Action or server component.
 *
 * @example
 * ```ts
 * const health = await checkHealth();
 * console.log(health.status); // 'ok'
 * ```
 */
export async function checkHealth(): Promise<{ status: string }> {
  const client = getOjsClient();
  const result = await client.health();
  return result as { status: string };
}

/**
 * Create and enqueue a chain workflow from a Server Action.
 * Each step runs sequentially after the previous one completes.
 *
 * @example
 * ```ts
 * const workflow = await createWorkflow([
 *   { type: 'order.validate', args: [orderId] },
 *   { type: 'payment.charge', args: [orderId] },
 *   { type: 'email.receipt', args: [orderId] },
 * ]);
 * ```
 */
export async function createWorkflow(steps: WorkflowStep[]): Promise<WorkflowStatus> {
  const client = getOjsClient();
  const workflow = chain(
    ...steps.map((step) => ({
      type: step.type,
      args: step.args,
      ...step.options,
    })),
  );
  return client.workflow(workflow);
}
