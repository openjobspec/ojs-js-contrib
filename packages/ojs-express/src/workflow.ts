import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { chain, group, batch } from '@openjobspec/sdk';
import type { OJSClient, JobSpec, BatchCallbacks } from '@openjobspec/sdk';
import type { OjsRequest, WorkflowStep } from './types.js';

/** Options for creating a workflow router. */
export interface OjsWorkflowRouterOptions {
  /** Route prefix (default: '/ojs/workflows') */
  prefix?: string;
}

/** Workflow helpers attached to req.ojsWorkflow by the middleware. */
export interface OjsWorkflowHelpers {
  /**
   * Execute jobs sequentially. The result of step N feeds step N+1.
   *
   * @param steps - Array of workflow step definitions.
   * @returns The workflow status from the server.
   */
  chain(steps: WorkflowStep[]): Promise<unknown>;

  /**
   * Execute jobs in parallel (fan-out/fan-in).
   *
   * @param steps - Array of workflow step definitions.
   * @returns The workflow status from the server.
   */
  group(steps: WorkflowStep[]): Promise<unknown>;

  /**
   * Execute jobs with a completion callback.
   *
   * @param steps - Array of workflow step definitions.
   * @param callbacks - Callback job specs for on_complete, on_success, on_failure.
   * @returns The workflow status from the server.
   */
  batch(steps: WorkflowStep[], callbacks: {
    on_complete?: WorkflowStep;
    on_success?: WorkflowStep;
    on_failure?: WorkflowStep;
  }): Promise<unknown>;
}

function stepsToJobSpecs(steps: WorkflowStep[]): JobSpec[] {
  return steps.map((step) => ({
    type: step.type,
    args: step.args,
    options: step.options,
  } as JobSpec));
}

function stepToJobSpec(step: WorkflowStep): JobSpec {
  return { type: step.type, args: step.args, options: step.options } as JobSpec;
}

function getClient(req: Request): OJSClient {
  const ojsReq = req as OjsRequest;
  if (!ojsReq.ojs) {
    throw new Error('OJS client not found on request. Mount ojsMiddleware() before workflow routes.');
  }
  return ojsReq.ojs;
}

function buildWorkflowHelpers(client: OJSClient): OjsWorkflowHelpers {
  return {
    async chain(steps: WorkflowStep[]) {
      const definition = chain(...stepsToJobSpecs(steps));
      return client.workflow(definition);
    },
    async group(steps: WorkflowStep[]) {
      const definition = group(...stepsToJobSpecs(steps));
      return client.workflow(definition);
    },
    async batch(steps: WorkflowStep[], callbacks: {
      on_complete?: WorkflowStep;
      on_success?: WorkflowStep;
      on_failure?: WorkflowStep;
    }) {
      const batchCallbacks: BatchCallbacks = {};
      if (callbacks.on_complete) batchCallbacks.on_complete = stepToJobSpec(callbacks.on_complete);
      if (callbacks.on_success) batchCallbacks.on_success = stepToJobSpec(callbacks.on_success);
      if (callbacks.on_failure) batchCallbacks.on_failure = stepToJobSpec(callbacks.on_failure);
      const definition = batch(stepsToJobSpecs(steps), batchCallbacks);
      return client.workflow(definition);
    },
  };
}

/**
 * Creates an Express router with workflow management endpoints:
 * - POST /chain — Execute jobs sequentially
 * - POST /group — Execute jobs in parallel (fan-out/fan-in)
 * - POST /batch — Execute jobs with completion callback
 *
 * Requires ojsMiddleware to be mounted first.
 *
 * @example
 * ```ts
 * import { createWorkflowRouter, ojsMiddleware } from '@openjobspec/express';
 *
 * app.use(ojsMiddleware({ url: process.env.OJS_URL }));
 * app.use(createWorkflowRouter());
 * // POST /ojs/workflows/chain  { steps: [...] }
 * // POST /ojs/workflows/group  { steps: [...] }
 * // POST /ojs/workflows/batch  { steps: [...], callbacks: {...} }
 * ```
 */
export function createWorkflowRouter(options?: OjsWorkflowRouterOptions): Router {
  const prefix = options?.prefix ?? '/ojs/workflows';
  const router = Router();

  router.post(`${prefix}/chain`, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getClient(req);
      const { steps } = req.body as { steps: WorkflowStep[] };
      if (!Array.isArray(steps) || steps.length === 0) {
        res.status(400).json({ error: 'steps must be a non-empty array' });
        return;
      }
      const definition = chain(...stepsToJobSpecs(steps));
      const result = await client.workflow(definition);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post(`${prefix}/group`, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getClient(req);
      const { steps } = req.body as { steps: WorkflowStep[] };
      if (!Array.isArray(steps) || steps.length === 0) {
        res.status(400).json({ error: 'steps must be a non-empty array' });
        return;
      }
      const definition = group(...stepsToJobSpecs(steps));
      const result = await client.workflow(definition);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post(`${prefix}/batch`, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const client = getClient(req);
      const { steps, callbacks } = req.body as { steps: WorkflowStep[]; callbacks: Record<string, WorkflowStep> };
      if (!Array.isArray(steps) || steps.length === 0) {
        res.status(400).json({ error: 'steps must be a non-empty array' });
        return;
      }
      if (!callbacks || typeof callbacks !== 'object') {
        res.status(400).json({ error: 'callbacks must be an object with on_complete, on_success, or on_failure' });
        return;
      }
      const batchCallbacks: BatchCallbacks = {};
      if (callbacks.on_complete) batchCallbacks.on_complete = stepToJobSpec(callbacks.on_complete);
      if (callbacks.on_success) batchCallbacks.on_success = stepToJobSpec(callbacks.on_success);
      if (callbacks.on_failure) batchCallbacks.on_failure = stepToJobSpec(callbacks.on_failure);
      const definition = batch(stepsToJobSpecs(steps), batchCallbacks);
      const result = await client.workflow(definition);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Express middleware that adds workflow helpers to req.ojsWorkflow.
 *
 * Requires ojsMiddleware to be mounted first so that req.ojs is available.
 *
 * @example
 * ```ts
 * app.use(ojsMiddleware({ url: process.env.OJS_URL }));
 * app.use(ojsWorkflowMiddleware());
 *
 * app.post('/orders/:id/fulfill', async (req, res) => {
 *   const result = await req.ojsWorkflow.chain([
 *     { type: 'order.validate', args: [req.params.id] },
 *     { type: 'payment.charge', args: [req.params.id] },
 *     { type: 'email.send', args: [req.params.id, 'confirmation'] },
 *   ]);
 *   res.json(result);
 * });
 * ```
 */
export function ojsWorkflowMiddleware(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const client = getClient(req);
    (req as OjsRequest & { ojsWorkflow: OjsWorkflowHelpers }).ojsWorkflow = buildWorkflowHelpers(client);
    next();
  };
}
