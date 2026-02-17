import type { Request } from 'express';
import type { OJSClient } from '@openjobspec/sdk';

export interface OjsRequest extends Request {
  ojs: OJSClient;
}

export interface OjsMiddlewareOptions {
  url: string;
  client?: OJSClient;
  onError?: (error: Error) => void;
}
