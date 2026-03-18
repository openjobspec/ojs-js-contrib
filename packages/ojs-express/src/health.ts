import { Router } from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { OjsRequest } from './types.js';

/** Options for the OJS health check router/middleware. */
export interface OjsHealthOptions {
  /** Route path (default: '/health/ojs') */
  path?: string;
  /** Include detailed backend info in the response */
  detailed?: boolean;
  /** Custom health check function merged into the response */
  customCheck?: () => Promise<{ status: string; details?: Record<string, unknown> }>;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  client?: { connected: boolean; url?: string; backend?: Record<string, unknown> };
  custom?: { status: string; details?: Record<string, unknown> };
}

async function buildHealthResponse(req: Request, options: OjsHealthOptions): Promise<{ statusCode: number; body: HealthResponse }> {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  const ojsReq = req as OjsRequest;

  if (ojsReq.ojs) {
    try {
      const healthResult = await ojsReq.ojs.health();
      response.client = {
        connected: true,
        ...(options.detailed ? { url: (ojsReq.ojs as unknown as { url?: string }).url, backend: healthResult.backend } : {}),
      };
    } catch {
      response.client = { connected: false };
      response.status = 'degraded';
    }
  }

  if (options.customCheck) {
    try {
      const customResult = await options.customCheck();
      response.custom = customResult;
      if (customResult.status !== 'ok') {
        response.status = 'degraded';
      }
    } catch {
      response.custom = { status: 'error' };
      response.status = 'degraded';
    }
  }

  const statusCode = response.status === 'ok' ? 200 : 503;
  return { statusCode, body: response };
}

/**
 * Creates an Express router with an OJS health check endpoint.
 *
 * Checks OJS server connectivity and optionally runs a custom health check.
 * Requires ojsMiddleware to be mounted first for client health checks.
 *
 * @example
 * ```ts
 * import { ojsMiddleware, createHealthRouter } from '@openjobspec/express';
 *
 * app.use(ojsMiddleware({ url: process.env.OJS_URL }));
 * app.use(createHealthRouter({ detailed: true }));
 * // GET /health/ojs -> { status: 'ok', client: { connected: true }, timestamp: '...' }
 * ```
 */
export function createHealthRouter(options?: OjsHealthOptions): Router {
  const opts = options ?? {};
  const path = opts.path ?? '/health/ojs';
  const router = Router();

  router.get(path, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { statusCode, body } = await buildHealthResponse(req, opts);
      res.status(statusCode).json(body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Simple health check middleware that responds to GET requests on the configured path.
 *
 * For applications that prefer a middleware over a router.
 *
 * @example
 * ```ts
 * import { ojsMiddleware, ojsHealthCheck } from '@openjobspec/express';
 *
 * app.use(ojsMiddleware({ url: process.env.OJS_URL }));
 * app.use(ojsHealthCheck({ path: '/health/ojs', detailed: true }));
 * ```
 */
export function ojsHealthCheck(options?: OjsHealthOptions): RequestHandler {
  const opts = options ?? {};
  const path = opts.path ?? '/health/ojs';

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'GET' || req.path !== path) {
      next();
      return;
    }

    try {
      const { statusCode, body } = await buildHealthResponse(req, opts);
      res.status(statusCode).json(body);
    } catch (err) {
      next(err);
    }
  };
}
