import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OjsVercelHandler,
  ojsApiRoute,
  ojsEdgeHandler,
  type JobEvent,
  type JobHandler,
  type PushDeliveryRequest,
  type VercelKVClient,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createJobEvent(overrides: Partial<JobEvent> = {}): JobEvent {
  return {
    id: '01912345-6789-7abc-def0-123456789abc',
    type: 'email.send',
    queue: 'default',
    args: ['user@example.com', 'Hello'],
    attempt: 1,
    ...overrides,
  };
}

function createPushDeliveryRequest(
  overrides: Partial<PushDeliveryRequest> = {},
): PushDeliveryRequest {
  return {
    job: createJobEvent(),
    worker_id: 'worker-1',
    delivery_id: 'delivery-1',
    ...overrides,
  };
}

function jsonRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://example.vercel.app/api/ojs', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createMockKV(): VercelKVClient {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };
}

function silentLogger() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests: OjsVercelHandler
// ---------------------------------------------------------------------------

describe('OjsVercelHandler', () => {
  let ojs: OjsVercelHandler;

  beforeEach(() => {
    ojs = new OjsVercelHandler({
      ojsUrl: 'http://localhost:8080',
      logger: silentLogger(),
    });
  });

  describe('register', () => {
    it('registers a handler and returns this for chaining', () => {
      const handler: JobHandler = vi.fn();
      const result = ojs.register('email.send', handler);
      expect(result).toBe(ojs);
    });
  });

  describe('registerDefault', () => {
    it('registers a default handler and returns this for chaining', () => {
      const handler: JobHandler = vi.fn();
      const result = ojs.registerDefault(handler);
      expect(result).toBe(ojs);
    });
  });

  describe('apiRouteHandler', () => {
    it('returns a function', () => {
      const handler = ojs.apiRouteHandler();
      expect(handler).toBeTypeOf('function');
    });

    it('returns 405 for non-POST methods', async () => {
      const handler = ojs.apiRouteHandler();
      const req = new Request('https://example.vercel.app/api/ojs', { method: 'GET' });

      const resp = await handler(req);

      expect(resp.status).toBe(405);
      const body = await resp.json() as { status: string };
      expect(body.status).toBe('failed');
    });

    it('returns 400 for invalid JSON body', async () => {
      const handler = ojs.apiRouteHandler();
      const req = new Request('https://example.vercel.app/api/ojs', {
        method: 'POST',
        body: 'not json',
      });

      const resp = await handler(req);

      expect(resp.status).toBe(400);
    });

    it('returns completed status on success', async () => {
      const jobHandler = vi.fn().mockResolvedValue(undefined);
      ojs.register('email.send', jobHandler);

      const handler = ojs.apiRouteHandler();
      const delivery = createPushDeliveryRequest();
      const req = jsonRequest(delivery);

      const resp = await handler(req);

      expect(resp.status).toBe(200);
      const body = await resp.json() as { status: string };
      expect(body.status).toBe('completed');
      expect(jobHandler).toHaveBeenCalledOnce();
    });

    it('returns failed status with error on handler failure', async () => {
      ojs.register('email.send', async () => {
        throw new Error('send failed');
      });

      const handler = ojs.apiRouteHandler();
      const delivery = createPushDeliveryRequest();
      const req = jsonRequest(delivery);

      const resp = await handler(req);

      expect(resp.status).toBe(200);
      const body = await resp.json() as { status: string; error?: { message: string; retryable: boolean } };
      expect(body.status).toBe('failed');
      expect(body.error?.message).toBe('send failed');
      expect(body.error?.retryable).toBe(true);
    });

    it('returns no_handler error for unregistered type without default', async () => {
      const handler = ojs.apiRouteHandler();
      const delivery = createPushDeliveryRequest({
        job: createJobEvent({ type: 'unknown.type' }),
      });
      const req = jsonRequest(delivery);

      const resp = await handler(req);

      const body = await resp.json() as { status: string; error?: { code: string; retryable: boolean } };
      expect(body.status).toBe('failed');
      expect(body.error?.code).toBe('no_handler');
      expect(body.error?.retryable).toBe(false);
    });

    it('calls default handler for unregistered types', async () => {
      const defaultHandler = vi.fn().mockResolvedValue(undefined);
      ojs.registerDefault(defaultHandler);

      const handler = ojs.apiRouteHandler();
      const delivery = createPushDeliveryRequest({
        job: createJobEvent({ type: 'unknown.type' }),
      });
      const req = jsonRequest(delivery);

      const resp = await handler(req);

      const body = await resp.json() as { status: string };
      expect(body.status).toBe('completed');
      expect(defaultHandler).toHaveBeenCalledOnce();
    });

    it('passes request context with trigger=api_route', async () => {
      const jobHandler = vi.fn().mockResolvedValue(undefined);
      ojs.register('email.send', jobHandler);

      const handler = ojs.apiRouteHandler();
      const delivery = createPushDeliveryRequest();
      const req = jsonRequest(delivery);

      await handler(req);

      const callCtx = jobHandler.mock.calls[0][1];
      expect(callCtx.trigger).toBe('api_route');
      expect(callCtx.request).toBeDefined();
    });
  });

  describe('edgeHandler', () => {
    it('returns a function', () => {
      const handler = ojs.edgeHandler();
      expect(handler).toBeTypeOf('function');
    });

    it('returns 405 for non-POST methods', async () => {
      const handler = ojs.edgeHandler();
      const req = new Request('https://example.vercel.app/api/ojs', { method: 'GET' });

      const resp = await handler(req);

      expect(resp.status).toBe(405);
    });

    it('returns completed status on success', async () => {
      const jobHandler = vi.fn().mockResolvedValue(undefined);
      ojs.register('email.send', jobHandler);

      const handler = ojs.edgeHandler();
      const delivery = createPushDeliveryRequest();
      const req = jsonRequest(delivery);

      const resp = await handler(req);

      expect(resp.status).toBe(200);
      const body = await resp.json() as { status: string };
      expect(body.status).toBe('completed');
    });

    it('passes request context with trigger=edge', async () => {
      const jobHandler = vi.fn().mockResolvedValue(undefined);
      ojs.register('email.send', jobHandler);

      const handler = ojs.edgeHandler();
      const delivery = createPushDeliveryRequest();
      const req = jsonRequest(delivery);

      await handler(req);

      const callCtx = jobHandler.mock.calls[0][1];
      expect(callCtx.trigger).toBe('edge');
    });
  });

  describe('KV caching', () => {
    it('caches job state to KV on successful completion', async () => {
      const mockKV = createMockKV();
      const ojsWithKV = new OjsVercelHandler({
        ojsUrl: 'http://localhost:8080',
        kv: mockKV,
        kvTtlSeconds: 3600,
        logger: silentLogger(),
      });

      const jobHandler = vi.fn().mockResolvedValue(undefined);
      ojsWithKV.register('email.send', jobHandler);

      const handler = ojsWithKV.apiRouteHandler();
      const delivery = createPushDeliveryRequest();
      const req = jsonRequest(delivery);

      await handler(req);

      expect(mockKV.set).toHaveBeenCalledWith(
        expect.stringContaining('ojs:job:'),
        expect.objectContaining({ state: 'completed' }),
        expect.objectContaining({ ex: 3600 }),
      );
    });

    it('caches failed state on handler error', async () => {
      const mockKV = createMockKV();
      const ojsWithKV = new OjsVercelHandler({
        ojsUrl: 'http://localhost:8080',
        kv: mockKV,
        logger: silentLogger(),
      });

      ojsWithKV.register('email.send', async () => {
        throw new Error('fail');
      });

      const handler = ojsWithKV.apiRouteHandler();
      const delivery = createPushDeliveryRequest();
      const req = jsonRequest(delivery);

      await handler(req);

      expect(mockKV.set).toHaveBeenCalledWith(
        expect.stringContaining('ojs:job:'),
        expect.objectContaining({ state: 'failed' }),
        expect.any(Object),
      );
    });
  });

  describe('getCachedJobState', () => {
    it('returns null when KV is not configured', async () => {
      const result = await ojs.getCachedJobState('job-1');
      expect(result).toBeNull();
    });

    it('returns cached state from KV', async () => {
      const mockKV = createMockKV();
      (mockKV.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        state: 'completed',
        updated_at: '2025-01-01T00:00:00.000Z',
      });

      const ojsWithKV = new OjsVercelHandler({
        ojsUrl: 'http://localhost:8080',
        kv: mockKV,
      });

      const result = await ojsWithKV.getCachedJobState('job-1');
      expect(result).toEqual({
        state: 'completed',
        updated_at: '2025-01-01T00:00:00.000Z',
      });
      expect(mockKV.get).toHaveBeenCalledWith('ojs:job:job-1:state');
    });
  });

  describe('enqueue', () => {
    it('calls the OJS server HTTP API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'new-job-id' }),
      });
      globalThis.fetch = mockFetch;

      const result = await ojs.enqueue('email.send', ['user@example.com'], {
        queue: 'emails',
        priority: 5,
      });

      expect(result.id).toBe('new-job-id');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/v1/jobs',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.type).toBe('email.send');
      expect(callBody.args).toEqual(['user@example.com']);
      expect(callBody.queue).toBe('emails');
      expect(callBody.priority).toBe(5);
    });

    it('throws on non-ok response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(
        ojs.enqueue('email.send', ['user@example.com']),
      ).rejects.toThrow('OJS enqueue failed (500)');
    });

    it('uses default queue when not specified', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'new-job-id' }),
      });
      globalThis.fetch = mockFetch;

      await ojs.enqueue('email.send', ['user@example.com']);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.queue).toBe('default');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Factory functions
// ---------------------------------------------------------------------------

describe('ojsApiRoute', () => {
  it('creates a handler with registered handlers', async () => {
    const jobHandler = vi.fn().mockResolvedValue(undefined);

    const handler = ojsApiRoute({
      ojsUrl: 'http://localhost:8080',
      handlers: { 'email.send': jobHandler },
      logger: silentLogger(),
    });

    const delivery = createPushDeliveryRequest();
    const req = jsonRequest(delivery);

    const resp = await handler(req);
    const body = await resp.json() as { status: string };

    expect(body.status).toBe('completed');
    expect(jobHandler).toHaveBeenCalledOnce();
  });

  it('uses the default handler for unregistered types', async () => {
    const defaultHandler = vi.fn().mockResolvedValue(undefined);

    const handler = ojsApiRoute({
      ojsUrl: 'http://localhost:8080',
      handlers: {},
      defaultHandler,
      logger: silentLogger(),
    });

    const delivery = createPushDeliveryRequest({
      job: createJobEvent({ type: 'unknown.type' }),
    });
    const req = jsonRequest(delivery);

    const resp = await handler(req);
    const body = await resp.json() as { status: string };

    expect(body.status).toBe('completed');
    expect(defaultHandler).toHaveBeenCalledOnce();
  });
});

describe('ojsEdgeHandler', () => {
  it('creates an edge handler with registered handlers', async () => {
    const jobHandler = vi.fn().mockResolvedValue(undefined);

    const handler = ojsEdgeHandler({
      ojsUrl: 'http://localhost:8080',
      handlers: { 'email.send': jobHandler },
      logger: silentLogger(),
    });

    const delivery = createPushDeliveryRequest();
    const req = jsonRequest(delivery);

    const resp = await handler(req);
    const body = await resp.json() as { status: string };

    expect(body.status).toBe('completed');
    expect(jobHandler).toHaveBeenCalledOnce();
  });
});
