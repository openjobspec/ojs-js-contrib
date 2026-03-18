import { NextRequest, NextResponse } from 'next/server';

/** Configuration for the OJS middleware */
export interface OjsMiddlewareConfig {
  /** Path prefix to match (default: '/api/ojs') */
  pathPrefix?: string;
  /** Custom auth validation function */
  validateAuth?: (request: NextRequest) => boolean | Promise<boolean>;
}

/**
 * Creates a Next.js middleware that injects OJS context into matched requests.
 * Adds OJS-specific headers for request correlation and tracing.
 *
 * Headers added to matching requests:
 * - `x-ojs-request-id` — unique request correlation ID
 * - `x-ojs-timestamp` — ISO 8601 timestamp of when the request was processed
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { createOjsMiddleware } from '@openjobspec/nextjs/middleware';
 *
 * const ojsMiddleware = createOjsMiddleware({
 *   pathPrefix: '/api/ojs',
 *   validateAuth: (req) => {
 *     const token = req.headers.get('authorization');
 *     return token === `Bearer ${process.env.OJS_API_KEY}`;
 *   },
 * });
 *
 * export default ojsMiddleware;
 * export const config = { matcher: '/api/ojs/:path*' };
 * ```
 */
export function createOjsMiddleware(
  config: OjsMiddlewareConfig = {},
): (request: NextRequest) => NextResponse | Promise<NextResponse> {
  const prefix = config.pathPrefix ?? '/api/ojs';

  return async (request: NextRequest): Promise<NextResponse> => {
    const { pathname } = request.nextUrl;

    // Only process requests matching the configured prefix
    if (!pathname.startsWith(prefix)) {
      return NextResponse.next();
    }

    // Run custom auth validation if provided
    if (config.validateAuth) {
      const authorized = await config.validateAuth(request);
      if (!authorized) {
        return new NextResponse(
          JSON.stringify({ error: 'Unauthorized' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
    }

    // Add correlation headers to the request
    const requestId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const headers = new Headers(request.headers);
    headers.set('x-ojs-request-id', requestId);
    headers.set('x-ojs-timestamp', timestamp);

    const response = NextResponse.next({
      request: { headers },
    });

    // Mirror correlation headers in the response for tracing
    response.headers.set('x-ojs-request-id', requestId);
    response.headers.set('x-ojs-timestamp', timestamp);

    return response;
  };
}
