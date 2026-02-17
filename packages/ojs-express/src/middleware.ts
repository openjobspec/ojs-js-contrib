import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { OJSClient } from '@openjobspec/sdk';
import type { OjsMiddlewareOptions, OjsRequest } from './types.js';

export function ojsMiddleware(options: OjsMiddlewareOptions): RequestHandler {
  const client = options.client ?? new OJSClient({ url: options.url });

  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as OjsRequest).ojs = client;
    next();
  };
}

export function ojsErrorHandler(options?: { onError?: (error: Error) => void }) {
  return (err: Error, _req: Request, res: Response, next: NextFunction): void => {
    const isOjsError = err.name === 'OJSError' || err.name === 'OJSValidationError'
      || err.name === 'OJSTimeoutError' || err.name === 'OJSNetworkError';
    if (isOjsError) {
      options?.onError?.(err);
      const statusCode = err.name === 'OJSValidationError' ? 400 : 500;
      res.status(statusCode).json({
        error: 'Job processing error',
        message: err.message,
      });
      return;
    }
    next(err);
  };
}

export function createOjsClient(options: OjsMiddlewareOptions): OJSClient {
  return options.client ?? new OJSClient({ url: options.url });
}
