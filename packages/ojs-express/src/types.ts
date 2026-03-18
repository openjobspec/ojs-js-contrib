import type { Request } from 'express';
import type { OJSClient } from '@openjobspec/sdk';
import type { OjsWorkflowHelpers } from './workflow.js';

export interface OjsRequest extends Request {
  ojs: OJSClient;
  ojsWorkflow?: OjsWorkflowHelpers;
}

export interface OjsMiddlewareOptions {
  url: string;
  client?: OJSClient;
  onError?: (error: Error) => void;
}

export interface OjsWorkerOptions {
  url: string;
  queues?: string[];
  concurrency?: number;
  pollInterval?: number;
  shutdownTimeout?: number;
}

export interface JobHandlerDefinition {
  type: string;
  handler: (ctx: JobContext) => Promise<void>;
  queue?: string;
  concurrency?: number;
}

export interface JobContext {
  id: string;
  type: string;
  args: unknown[];
  attempt: number;
  queue: string;
  meta: Record<string, unknown>;
}

export interface OjsAppOptions extends OjsMiddlewareOptions {
  worker?: OjsWorkerOptions;
  handlers?: JobHandlerDefinition[];
}

/** A workflow step definition used by the workflow middleware and router. */
export interface WorkflowStep {
  type: string;
  args: unknown[];
  options?: Record<string, unknown>;
}

/** Options for creating a workflow router. */
export { type OjsWorkflowRouterOptions } from './workflow.js';

/** Health check options. */
export { type OjsHealthOptions } from './health.js';

/** Event emitter options and data types. */
export { type OjsEventOptions, type OjsEventData, type OjsEventEmitter } from './events.js';
