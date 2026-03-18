export { ojsMiddleware, ojsErrorHandler, createOjsClient } from './middleware.js';
export { OjsWorkerManager, createOjsWorker } from './worker.js';
export { createWorkflowRouter, ojsWorkflowMiddleware } from './workflow.js';
export type { OjsWorkflowHelpers, OjsWorkflowRouterOptions } from './workflow.js';
export { createHealthRouter, ojsHealthCheck } from './health.js';
export type { OjsHealthOptions } from './health.js';
export { createOjsEventEmitter, ojsEventStream } from './events.js';
export type { OjsEventOptions, OjsEventData, OjsEventEmitter } from './events.js';
export type {
  OjsRequest,
  OjsMiddlewareOptions,
  OjsWorkerOptions,
  JobHandlerDefinition,
  JobContext,
  OjsAppOptions,
  WorkflowStep,
} from './types.js';

import { ojsMiddleware } from './middleware.js';
import type { OjsMiddlewareOptions } from './types.js';
import type { RequestHandler } from 'express';

/**
 * Express middleware factory for OJS integration.
 *
 * Creates middleware that attaches an OJS client to `req.ojs`, enabling
 * `req.ojs.enqueue()` in route handlers. Auto-reads `OJS_URL` from
 * environment variables if no serverUrl is provided.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { ojsExpress } from '@openjobspec/express';
 *
 * const app = express();
 * app.use(ojsExpress({ serverUrl: process.env.OJS_URL }));
 *
 * app.post('/orders', async (req, res) => {
 *   const order = await createOrder(req.body);
 *   await req.ojs.enqueue('email.send', [order.userId, 'confirmation']);
 *   res.json(order);
 * });
 * ```
 */
export function ojsExpress(options?: { serverUrl?: string; client?: import('@openjobspec/sdk').OJSClient }): RequestHandler {
  const url = options?.serverUrl || process.env.OJS_URL || 'http://localhost:8080';
  const middlewareOpts: OjsMiddlewareOptions = {
    url,
    client: options?.client,
  };
  return ojsMiddleware(middlewareOpts);
}
