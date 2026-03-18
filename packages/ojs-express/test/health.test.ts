import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('@openjobspec/sdk', () => {
  const OJSClient = vi.fn().mockImplementation((opts: { url: string }) => ({
    url: opts.url,
    enqueue: vi.fn(),
    enqueueBatch: vi.fn(),
    getJob: vi.fn(),
    cancelJob: vi.fn(),
    health: vi.fn().mockResolvedValue({ status: 'ok', version: '1.0.0', backend: { type: 'redis', status: 'ok' } }),
  }));

  const OJSWorker = vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  }));

  return { OJSClient, OJSWorker };
});

import { createHealthRouter, ojsHealthCheck, ojsMiddleware } from '../src/index.js';
import type { OjsRequest } from '../src/index.js';
import { OJSClient } from '@openjobspec/sdk';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/health/ojs',
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function attachOjsClient(req: Request, url = 'http://localhost:8080'): void {
  const client = new OJSClient({ url });
  (req as OjsRequest).ojs = client;
}

describe('createHealthRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a router with GET /health/ojs', () => {
    const router = createHealthRouter();
    const routes = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }).stack
      .filter((layer) => layer.route)
      .map((layer) => ({ path: layer.route!.path, method: Object.keys(layer.route!.methods)[0] }));

    expect(routes).toContainEqual({ path: '/health/ojs', method: 'get' });
  });

  it('uses custom path', () => {
    const router = createHealthRouter({ path: '/status/backend' });
    const routes = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }).stack
      .filter((layer) => layer.route)
      .map((layer) => ({ path: layer.route!.path, method: Object.keys(layer.route!.methods)[0] }));

    expect(routes).toContainEqual({ path: '/status/backend', method: 'get' });
  });

  it('returns ok status when OJS client is healthy', async () => {
    const router = createHealthRouter();
    const healthRoute = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack
      .find((layer) => layer.route?.path === '/health/ojs');

    const handler = healthRoute!.route!.stack[0].handle;

    const req = createMockReq();
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        timestamp: expect.any(String),
        client: expect.objectContaining({ connected: true }),
      }),
    );
  });

  it('returns degraded when OJS client health check fails', async () => {
    const router = createHealthRouter();
    const healthRoute = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack
      .find((layer) => layer.route?.path === '/health/ojs');

    const handler = healthRoute!.route!.stack[0].handle;

    const req = createMockReq();
    const client = new OJSClient({ url: 'http://localhost:8080' });
    (client.health as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Connection refused'));
    (req as OjsRequest).ojs = client;

    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'degraded',
        client: { connected: false },
      }),
    );
  });

  it('includes detailed info when detailed=true', async () => {
    const router = createHealthRouter({ detailed: true });
    const healthRoute = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack
      .find((layer) => layer.route?.path === '/health/ojs');

    const handler = healthRoute!.route!.stack[0].handle;

    const req = createMockReq();
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.client.connected).toBe(true);
    expect(body.client.backend).toEqual({ type: 'redis', status: 'ok' });
  });

  it('runs custom health check and merges result', async () => {
    const customCheck = vi.fn().mockResolvedValue({ status: 'ok', details: { db: 'connected' } });
    const router = createHealthRouter({ customCheck });
    const healthRoute = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack
      .find((layer) => layer.route?.path === '/health/ojs');

    const handler = healthRoute!.route!.stack[0].handle;

    const req = createMockReq();
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(customCheck).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.custom).toEqual({ status: 'ok', details: { db: 'connected' } });
  });

  it('returns degraded when custom check reports non-ok', async () => {
    const customCheck = vi.fn().mockResolvedValue({ status: 'warning' });
    const router = createHealthRouter({ customCheck });
    const healthRoute = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack
      .find((layer) => layer.route?.path === '/health/ojs');

    const handler = healthRoute!.route!.stack[0].handle;

    const req = createMockReq();
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.status).toBe('degraded');
  });

  it('still works when no OJS client is attached', async () => {
    const router = createHealthRouter();
    const healthRoute = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack
      .find((layer) => layer.route?.path === '/health/ojs');

    const handler = healthRoute!.route!.stack[0].handle;

    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', timestamp: expect.any(String) }),
    );
  });
});

describe('ojsHealthCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('responds on matching GET path', async () => {
    const middleware = ojsHealthCheck();
    const req = createMockReq({ method: 'GET', path: '/health/ojs' });
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through for non-matching path', async () => {
    const middleware = ojsHealthCheck();
    const req = createMockReq({ method: 'GET', path: '/other' });
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('passes through for non-GET method', async () => {
    const middleware = ojsHealthCheck();
    const req = createMockReq({ method: 'POST', path: '/health/ojs' });
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('uses custom path', async () => {
    const middleware = ojsHealthCheck({ path: '/ready' });
    const req = createMockReq({ method: 'GET', path: '/ready' });
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
