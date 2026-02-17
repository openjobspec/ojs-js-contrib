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
  return { OJSClient };
});

import { ojsMiddleware, ojsErrorHandler, createOjsClient } from '../src/index.js';
import type { OjsRequest } from '../src/index.js';
import { OJSClient } from '@openjobspec/sdk';

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
