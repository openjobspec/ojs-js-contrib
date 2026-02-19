import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('@openjobspec/sdk', () => {
  const OJSClient = vi.fn().mockImplementation((opts: { url: string }) => ({
    url: opts.url,
    enqueue: vi.fn(),
    enqueueBatch: vi.fn(),
    getJob: vi.fn(),
    cancelJob: vi.fn(),
  }));

  const OJSWorker = vi.fn().mockImplementation((opts: { url: string; queues?: string[]; concurrency?: number; pollInterval?: number }) => ({
    url: opts.url,
    queues: opts.queues,
    concurrency: opts.concurrency,
    pollInterval: opts.pollInterval,
    register: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  }));

  return { OJSClient, OJSWorker };
});

import { ojsMiddleware, ojsErrorHandler, createOjsClient, OjsWorkerManager, createOjsWorker } from '../src/index.js';
import type { OjsRequest } from '../src/index.js';
import { OJSClient, OJSWorker } from '@openjobspec/sdk';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return { ...overrides } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('ojsMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches OJSClient to req.ojs', () => {
    const middleware = ojsMiddleware({ url: 'http://localhost:8080' });
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    const ojsReq = req as unknown as OjsRequest;
    expect(ojsReq.ojs).toBeDefined();
    expect(ojsReq.ojs.url).toBe('http://localhost:8080');
    expect(next).toHaveBeenCalledOnce();
  });

  it('uses custom client when provided', () => {
    const customClient = new OJSClient({ url: 'http://custom:9090' });
    const middleware = ojsMiddleware({
      url: 'http://localhost:8080',
      client: customClient,
    });
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    middleware(req, res, next);

    const ojsReq = req as unknown as OjsRequest;
    expect(ojsReq.ojs).toBe(customClient);
    expect(OJSClient).toHaveBeenCalledOnce(); // only the custom client constructor
  });

  it('reuses the same client across requests', () => {
    const middleware = ojsMiddleware({ url: 'http://localhost:8080' });
    const req1 = createMockReq();
    const req2 = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    middleware(req1, res, next);
    middleware(req2, res, next);

    const ojsReq1 = req1 as unknown as OjsRequest;
    const ojsReq2 = req2 as unknown as OjsRequest;
    expect(ojsReq1.ojs).toBe(ojsReq2.ojs);
  });
});

describe('ojsErrorHandler', () => {
  it('catches OJSError and returns 500', () => {
    const onError = vi.fn();
    const handler = ojsErrorHandler({ onError });
    const err = new Error('Connection failed');
    err.name = 'OJSError';
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    handler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Job processing error',
      message: 'Connection failed',
    });
    expect(onError).toHaveBeenCalledWith(err);
    expect(next).not.toHaveBeenCalled();
  });

  it('catches OJSValidationError and returns 400', () => {
    const handler = ojsErrorHandler();
    const err = new Error('Invalid job args');
    err.name = 'OJSValidationError';
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    handler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Job processing error',
      message: 'Invalid job args',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('catches OJSTimeoutError and returns 500', () => {
    const handler = ojsErrorHandler();
    const err = new Error('Request timed out');
    err.name = 'OJSTimeoutError';
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    handler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Job processing error',
      message: 'Request timed out',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('catches OJSNetworkError and returns 500', () => {
    const handler = ojsErrorHandler();
    const err = new Error('Network unreachable');
    err.name = 'OJSNetworkError';
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    handler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Job processing error',
      message: 'Network unreachable',
    });
  });

  it('passes non-OJS errors to next', () => {
    const handler = ojsErrorHandler();
    const err = new Error('Something else');
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    handler(err, req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(err);
  });
});

describe('createOjsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new client with url', () => {
    const client = createOjsClient({ url: 'http://localhost:8080' });
    expect(client).toBeDefined();
    expect(client.url).toBe('http://localhost:8080');
  });

  it('returns custom client when provided', () => {
    const customClient = new OJSClient({ url: 'http://custom:9090' });
    const client = createOjsClient({
      url: 'http://localhost:8080',
      client: customClient,
    });
    expect(client).toBe(customClient);
  });
});

describe('OjsWorkerManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a worker manager with options', () => {
    const manager = new OjsWorkerManager({ url: 'http://localhost:8080' });
    expect(manager).toBeDefined();
    expect(manager.isHealthy()).toBe(false);
  });

  it('registers handlers and returns this for chaining', () => {
    const manager = new OjsWorkerManager({ url: 'http://localhost:8080' });
    const handler = vi.fn();

    const result = manager.register('email.send', handler);
    expect(result).toBe(manager);
    expect(manager.getRegisteredTypes()).toContain('email.send');
  });

  it('registers multiple handler types', () => {
    const manager = new OjsWorkerManager({ url: 'http://localhost:8080' });
    manager
      .register('email.send', vi.fn())
      .register('report.generate', vi.fn())
      .register('cleanup', vi.fn());

    expect(manager.getRegisteredTypes()).toEqual(['email.send', 'report.generate', 'cleanup']);
  });

  it('starts the worker and becomes healthy', async () => {
    const manager = new OjsWorkerManager({ url: 'http://localhost:8080' });
    manager.register('email.send', vi.fn());

    await manager.start();

    expect(OJSWorker).toHaveBeenCalledWith({
      url: 'http://localhost:8080',
      queues: ['default'],
      concurrency: 10,
      pollInterval: 1000,
    });
    expect(manager.isHealthy()).toBe(true);
  });

  it('uses custom queues, concurrency, and pollInterval', async () => {
    const manager = new OjsWorkerManager({
      url: 'http://localhost:8080',
      queues: ['emails', 'reports'],
      concurrency: 5,
      pollInterval: 2000,
    });
    manager.register('email.send', vi.fn());

    await manager.start();

    expect(OJSWorker).toHaveBeenCalledWith({
      url: 'http://localhost:8080',
      queues: ['emails', 'reports'],
      concurrency: 5,
      pollInterval: 2000,
    });
  });

  it('does not start twice', async () => {
    const manager = new OjsWorkerManager({ url: 'http://localhost:8080' });
    manager.register('email.send', vi.fn());

    await manager.start();
    await manager.start();

    expect(OJSWorker).toHaveBeenCalledOnce();
  });

  it('stops the worker and becomes unhealthy', async () => {
    const manager = new OjsWorkerManager({ url: 'http://localhost:8080' });
    manager.register('email.send', vi.fn());

    await manager.start();
    expect(manager.isHealthy()).toBe(true);

    await manager.stop();
    expect(manager.isHealthy()).toBe(false);
  });

  it('stop is a no-op when not running', async () => {
    const manager = new OjsWorkerManager({ url: 'http://localhost:8080' });
    await manager.stop();
    expect(manager.isHealthy()).toBe(false);
  });

  it('registers handlers on the underlying OJSWorker', async () => {
    const manager = new OjsWorkerManager({ url: 'http://localhost:8080' });
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    manager.register('email.send', handler1);
    manager.register('report.generate', handler2);

    await manager.start();

    const mockWorkerInstance = vi.mocked(OJSWorker).mock.results[0].value;
    expect(mockWorkerInstance.register).toHaveBeenCalledTimes(2);
    expect(mockWorkerInstance.register).toHaveBeenCalledWith('email.send', expect.any(Function));
    expect(mockWorkerInstance.register).toHaveBeenCalledWith('report.generate', expect.any(Function));
  });
});

describe('createOjsWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an OjsWorkerManager instance', () => {
    const worker = createOjsWorker({ url: 'http://localhost:8080' });
    expect(worker).toBeInstanceOf(OjsWorkerManager);
  });

  it('returns a chainable manager', () => {
    const worker = createOjsWorker({ url: 'http://localhost:8080' });
    const result = worker
      .register('email.send', vi.fn())
      .register('cleanup', vi.fn());
    expect(result).toBe(worker);
    expect(worker.getRegisteredTypes()).toEqual(['email.send', 'cleanup']);
  });
});
