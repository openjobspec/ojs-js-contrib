import type { Request } from 'express';
import type { OJSClient, OJSWorker } from '@openjobspec/sdk';

export interface OjsRequest extends Request {
  ojs: OJSClient;
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
