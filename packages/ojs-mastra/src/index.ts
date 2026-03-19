/**
 * @openjobspec/mastra — Mastra adapter for OpenJobSpec
 *
 * Wraps Mastra workflows and agents as durable OJS jobs with attestation,
 * retry, and observability support.
 */

// ---- Configuration types ----

export interface MastraAdapterConfig {
  /** OJS server URL (default: process.env.OJS_URL ?? 'http://localhost:8080'). */
  serverUrl?: string;
  /** Default queue name for Mastra jobs (default: "mastra"). */
  defaultQueue?: string;
  /** Default retry policy for wrapped workflows/agents. */
  retry?: RetryConfig;
  /** Enable attestation for all wrapped items. */
  attestation?: boolean;
}

export interface RetryConfig {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

// ---- Durable wrappers ----

export interface DurableWorkflow {
  /** The OJS job type for this workflow. */
  jobType: string;
  /** Enqueue a workflow execution as a durable OJS job. */
  enqueue(input: Record<string, unknown>): Promise<{ jobId: string }>;
  /** Register the worker handler for this workflow. */
  handler(): WorkflowHandler;
}

export interface DurableAgent {
  /** The OJS job type for this agent. */
  jobType: string;
  /** Enqueue an agent invocation as a durable OJS job. */
  enqueue(input: Record<string, unknown>): Promise<{ jobId: string }>;
  /** Register the worker handler for this agent. */
  handler(): AgentHandler;
}

export type WorkflowHandler = (args: unknown[]) => Promise<unknown>;
export type AgentHandler = (args: unknown[]) => Promise<unknown>;

// ---- Adapter ----

export class MastraAdapter {
  private readonly config: Required<Pick<MastraAdapterConfig, 'serverUrl' | 'defaultQueue'>> & MastraAdapterConfig;

  constructor(config: MastraAdapterConfig = {}) {
    this.config = {
      serverUrl: config.serverUrl ?? process.env.OJS_URL ?? 'http://localhost:8080',
      defaultQueue: config.defaultQueue ?? 'mastra',
      ...config,
    };
  }

  /**
   * Wraps a Mastra workflow as a durable OJS job.
   *
   * @param workflow - A Mastra workflow instance (or any object with an `execute` method).
   * @returns A DurableWorkflow that can be enqueued and processed.
   */
  wrapWorkflow(workflow: { name?: string; execute?: (input: unknown) => Promise<unknown> }): DurableWorkflow {
    const jobType = `mastra.workflow.${workflow.name ?? 'unnamed'}`;
    const serverUrl = this.config.serverUrl;
    const queue = this.config.defaultQueue;

    return {
      jobType,
      async enqueue(input: Record<string, unknown>): Promise<{ jobId: string }> {
        const resp = await fetch(`${serverUrl}/api/v1/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: jobType,
            args: [input],
            queue,
          }),
        });
        if (!resp.ok) {
          throw new Error(`OJS enqueue failed: ${resp.status} ${resp.statusText}`);
        }
        const data = await resp.json() as { job: { id: string } };
        return { jobId: data.job.id };
      },
      handler(): WorkflowHandler {
        return async (args: unknown[]): Promise<unknown> => {
          if (!workflow.execute) {
            throw new Error(`Workflow ${workflow.name} has no execute method`);
          }
          return workflow.execute(args[0]);
        };
      },
    };
  }

  /**
   * Wraps a Mastra agent as a durable OJS job.
   *
   * @param agent - A Mastra agent instance (or any object with a `generate` method).
   * @returns A DurableAgent that can be enqueued and processed.
   */
  wrapAgent(agent: { name?: string; generate?: (input: unknown) => Promise<unknown> }): DurableAgent {
    const jobType = `mastra.agent.${agent.name ?? 'unnamed'}`;
    const serverUrl = this.config.serverUrl;
    const queue = this.config.defaultQueue;

    return {
      jobType,
      async enqueue(input: Record<string, unknown>): Promise<{ jobId: string }> {
        const resp = await fetch(`${serverUrl}/api/v1/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: jobType,
            args: [input],
            queue,
          }),
        });
        if (!resp.ok) {
          throw new Error(`OJS enqueue failed: ${resp.status} ${resp.statusText}`);
        }
        const data = await resp.json() as { job: { id: string } };
        return { jobId: data.job.id };
      },
      handler(): AgentHandler {
        return async (args: unknown[]): Promise<unknown> => {
          if (!agent.generate) {
            throw new Error(`Agent ${agent.name} has no generate method`);
          }
          return agent.generate(args[0]);
        };
      },
    };
  }
}
