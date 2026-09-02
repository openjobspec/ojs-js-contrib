import { NextRequest, NextResponse } from 'next/server';

/** Configuration for the OJS middleware */
export interface OjsMiddlewareConfig {
  /** Path prefix to match (default: '/api/ojs') */
  pathPrefix?: string;
  /** Custom auth validation function */
  validateAuth?: (request: NextRequest) => boolean | Promise<boolean>;
}

/**
 * Generate a request-correlation id. Prefers the Web Crypto global, which is
 * available in the Edge runtime (where Next.js middleware runs) and in
 * Node >= 20; falls back to a self-contained RFC 4122 v4 generator on bare
 * Node 18 runtimes that do not expose `globalThis.crypto`. Intentionally does
 * not import `node:crypto` so the Edge bundle boundary is preserved.
 */
function generateRequestId(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
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
    const requestId = generateRequestId();
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
