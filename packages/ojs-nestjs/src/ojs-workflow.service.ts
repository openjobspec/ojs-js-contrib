import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { OjsModuleOptions } from './ojs.interfaces.js';
import { OJS_MODULE_OPTIONS } from './ojs.interfaces.js';
import { OJSClient } from '@openjobspec/sdk';

/** JSON-compatible value type matching the OJS SDK's JsonValue. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface WorkflowStep {
  type: string;
  args: JsonValue[];
  options?: {
    queue?: string;
    priority?: number;
    timeout?: number;
    delay?: string;
    tags?: string[];
    meta?: Record<string, JsonValue>;
  };
}

export interface WorkflowResult {
  id: string;
  steps: Array<{ jobId: string; type: string; state: string }>;
}

/**
 * Service for creating and managing OJS workflows.
 * Provides chain, group, and batch workflow primitives.
 */
@Injectable()
export class OjsWorkflowService {
  private readonly client: OJSClient;

  constructor(@Inject(OJS_MODULE_OPTIONS) options: OjsModuleOptions) {
    this.client = new OJSClient({ url: options.baseUrl });
  }

  /**
   * Execute workflow steps sequentially (each depends on the previous).
   * Jobs are enqueued one at a time in order, forming a dependency chain.
   */
  async chain(steps: WorkflowStep[]): Promise<WorkflowResult> {
    const workflowId = randomUUID();
    if (steps.length === 0) {
      return { id: workflowId, steps: [] };
    }

    const resultSteps: WorkflowResult['steps'] = [];

    for (const step of steps) {
      const job = await this.client.enqueue(step.type, step.args, {
        ...step.options,
        meta: {
          ...step.options?.meta,
          workflowId,
          workflowType: 'chain',
        },
      });
      resultSteps.push({
        jobId: job.id,
        type: step.type,
        state: 'available',
      });
    }

    return { id: workflowId, steps: resultSteps };
  }

  /**
   * Execute workflow steps in parallel (fan-out/fan-in).
   * All jobs are enqueued at once via batch enqueue.
   */
  async group(steps: WorkflowStep[]): Promise<WorkflowResult> {
    const workflowId = randomUUID();
    if (steps.length === 0) {
      return { id: workflowId, steps: [] };
    }

    const jobs = await this.client.enqueueBatch(
      steps.map((step) => ({
        type: step.type,
        args: step.args,
        options: {
          ...step.options,
          meta: {
            ...step.options?.meta,
            workflowId,
            workflowType: 'group',
          },
        },
      })),
    );

    const resultSteps = jobs.map((job: { id: string }, i: number) => ({
      jobId: job.id,
      type: steps[i].type,
      state: 'available',
    }));

    return { id: workflowId, steps: resultSteps };
  }

  /**
   * Execute jobs with a completion callback.
   * All jobs are enqueued in parallel; the callback job is enqueued
   * separately and references the batch via workflow metadata.
   */
  async batch(jobs: WorkflowStep[], callback: WorkflowStep): Promise<WorkflowResult> {
    const workflowId = randomUUID();
    const resultSteps: WorkflowResult['steps'] = [];

    if (jobs.length > 0) {
      const batchJobs = await this.client.enqueueBatch(
        jobs.map((step) => ({
          type: step.type,
          args: step.args,
          options: {
            ...step.options,
            meta: {
              ...step.options?.meta,
              workflowId,
              workflowType: 'batch',
            },
          },
        })),
      );

      for (let i = 0; i < batchJobs.length; i++) {
        resultSteps.push({
          jobId: batchJobs[i].id,
          type: jobs[i].type,
          state: 'available',
        });
      }
    }

    const callbackJob = await this.client.enqueue(callback.type, callback.args, {
      ...callback.options,
      meta: {
        ...callback.options?.meta,
        workflowId,
        workflowType: 'batch',
        isCallback: true,
        batchSize: jobs.length,
      },
    });

    resultSteps.push({
      jobId: callbackJob.id,
      type: callback.type,
      state: 'available',
    });

    return { id: workflowId, steps: resultSteps };
  }
}
