import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createOjsMiddleware } from '../src/middleware.js';

describe('createOjsMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a function', () => {
    const middleware = createOjsMiddleware();
    expect(middleware).toBeTypeOf('function');
  });

  it('passes through non-OJS requests unchanged', async () => {
    const middleware = createOjsMiddleware();
    const req = new NextRequest('http://localhost:3000/api/other');
    const res = await middleware(req);

    // NextResponse.next() returns a response that passes through
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
    // Should NOT have OJS headers since it doesn't match prefix
    expect(res.headers.get('x-ojs-request-id')).toBeNull();
  });

  it('adds correlation headers to matching OJS requests', async () => {
    const middleware = createOjsMiddleware();
    const req = new NextRequest('http://localhost:3000/api/ojs/jobs/123');
    const res = await middleware(req);

    expect(res.headers.get('x-ojs-request-id')).toBeTruthy();
    expect(res.headers.get('x-ojs-timestamp')).toBeTruthy();
    // Validate timestamp is ISO format
    const ts = res.headers.get('x-ojs-timestamp')!;
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it('uses custom path prefix', async () => {
    const middleware = createOjsMiddleware({ pathPrefix: '/jobs' });

    const req1 = new NextRequest('http://localhost:3000/jobs/enqueue');
    const res1 = await middleware(req1);
    expect(res1.headers.get('x-ojs-request-id')).toBeTruthy();

    const req2 = new NextRequest('http://localhost:3000/api/ojs/health');
    const res2 = await middleware(req2);
    expect(res2.headers.get('x-ojs-request-id')).toBeNull();
  });

  it('returns 401 when auth validation fails', async () => {
    const middleware = createOjsMiddleware({
      validateAuth: () => false,
    });

    const req = new NextRequest('http://localhost:3000/api/ojs/jobs');
    const res = await middleware(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('allows request when auth validation passes', async () => {
    const middleware = createOjsMiddleware({
      validateAuth: (req) => req.headers.get('authorization') === 'Bearer valid-token',
    });

    const req = new NextRequest('http://localhost:3000/api/ojs/jobs', {
      headers: { authorization: 'Bearer valid-token' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ojs-request-id')).toBeTruthy();
  });

  it('supports async auth validation', async () => {
    const middleware = createOjsMiddleware({
      validateAuth: async (req) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return req.headers.get('x-api-key') === 'secret';
      },
    });

    const req = new NextRequest('http://localhost:3000/api/ojs/jobs', {
      headers: { 'x-api-key': 'secret' },
    });

    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it('generates unique request IDs for each request', async () => {
    const middleware = createOjsMiddleware();

    const req1 = new NextRequest('http://localhost:3000/api/ojs/jobs');
    const res1 = await middleware(req1);

    const req2 = new NextRequest('http://localhost:3000/api/ojs/jobs');
    const res2 = await middleware(req2);

    const id1 = res1.headers.get('x-ojs-request-id');
    const id2 = res2.headers.get('x-ojs-request-id');
    expect(id1).not.toBe(id2);
  });
});
