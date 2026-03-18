import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@openjobspec/sdk', () => {
  const OJSClient = vi.fn().mockImplementation((opts: { url: string }) => ({
    url: opts.url,
    enqueue: vi.fn().mockResolvedValue({ id: 'job-1' }),
    enqueueBatch: vi.fn().mockResolvedValue([{ id: 'job-1' }]),
    getJob: vi.fn().mockResolvedValue({ id: 'job-1', state: 'completed' }),
    cancelJob: vi.fn().mockResolvedValue({ id: 'job-1', state: 'cancelled' }),
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
  }));
  return { OJSClient };
});

import Fastify, { type FastifyInstance } from 'fastify';
import { ojsPlugin } from '../src/index.js';
import ojsRequestContextPlugin from '../src/request-context.js';

describe('ojs-fastify request-context', () => {
  let fastify: FastifyInstance;

  beforeEach(() => {
    fastify = Fastify();
    vi.clearAllMocks();
  });

  it('decorates request with ojsContext', async () => {
    await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
    await fastify.register(ojsRequestContextPlugin);

    let capturedContext: unknown = null;
    fastify.get('/test', async (request) => {
      capturedContext = request.ojsContext;
      return { ok: true };
    });

    await fastify.ready();

    const response = await fastify.inject({ method: 'GET', url: '/test' });
    expect(response.statusCode).toBe(200);
    expect(capturedContext).toBeDefined();
    expect(capturedContext).toHaveProperty('client');
    expect(capturedContext).toHaveProperty('requestId');
    expect(capturedContext).toHaveProperty('enqueue');
    expect(capturedContext).toHaveProperty('enqueueBatch');

    await fastify.close();
  });

  it('uses the shared OJSClient from fastify.ojs', async () => {
    await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
    await fastify.register(ojsRequestContextPlugin);

    let contextClient: unknown = null;
    fastify.get('/test', async (request) => {
      contextClient = request.ojsContext.client;
      return { ok: true };
    });

    await fastify.ready();

    await fastify.inject({ method: 'GET', url: '/test' });
    expect(contextClient).toBe(fastify.ojs);

    await fastify.close();
  });

  it('includes request ID in context', async () => {
    await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
    await fastify.register(ojsRequestContextPlugin);

    let requestId: string | undefined;
    fastify.get('/test', async (request) => {
      requestId = request.ojsContext.requestId;
      return { ok: true };
    });

    await fastify.ready();

    await fastify.inject({ method: 'GET', url: '/test' });
    expect(requestId).toBeDefined();
    expect(typeof requestId).toBe('string');

    await fastify.close();
  });

  it('injects correlation metadata into enqueued jobs', async () => {
    await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
    await fastify.register(ojsRequestContextPlugin);

    fastify.get('/test', async (request) => {
      await request.ojsContext.enqueue('email.send', [{ to: 'user@test.com' }]);
      return { ok: true };
    });

    await fastify.ready();

    await fastify.inject({ method: 'GET', url: '/test' });

    expect(fastify.ojs.enqueue).toHaveBeenCalledWith(
      'email.send',
      [{ to: 'user@test.com' }],
      expect.objectContaining({
        meta: expect.objectContaining({
          _requestId: expect.any(String),
          _correlationId: expect.any(String),
        }),
      }),
    );

    await fastify.close();
  });

  it('uses correlation header when provided', async () => {
    await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
    await fastify.register(ojsRequestContextPlugin, {
      correlationHeader: 'x-trace-id',
    });

    fastify.get('/test', async (request) => {
      await request.ojsContext.enqueue('test.job', ['arg1']);
      return { ok: true };
    });

    await fastify.ready();

    await fastify.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-trace-id': 'trace-abc-123' },
    });

    expect(fastify.ojs.enqueue).toHaveBeenCalledWith(
      'test.job',
      ['arg1'],
      expect.objectContaining({
        meta: expect.objectContaining({
          _correlationId: 'trace-abc-123',
        }),
      }),
    );

    await fastify.close();
  });

  it('injects metadata into batch enqueued jobs', async () => {
    await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
    await fastify.register(ojsRequestContextPlugin);

    fastify.get('/test', async (request) => {
      await request.ojsContext.enqueueBatch([
        { type: 'email.send', args: ['a'] },
        { type: 'sms.send', args: ['b'] },
      ]);
      return { ok: true };
    });

    await fastify.ready();

    await fastify.inject({ method: 'GET', url: '/test' });

    expect(fastify.ojs.enqueueBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'email.send',
        args: ['a'],
        options: expect.objectContaining({
          meta: expect.objectContaining({
            _requestId: expect.any(String),
            _correlationId: expect.any(String),
          }),
        }),
      }),
      expect.objectContaining({
        type: 'sms.send',
        args: ['b'],
        options: expect.objectContaining({
          meta: expect.objectContaining({
            _requestId: expect.any(String),
            _correlationId: expect.any(String),
          }),
        }),
      }),
    ]);

    await fastify.close();
  });

  it('preserves existing options when injecting metadata', async () => {
    await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
    await fastify.register(ojsRequestContextPlugin);

    fastify.get('/test', async (request) => {
      await request.ojsContext.enqueue('email.send', ['arg'], {
        queue: 'high-priority',
        meta: { customField: 'value' },
      });
      return { ok: true };
    });

    await fastify.ready();

    await fastify.inject({ method: 'GET', url: '/test' });

    expect(fastify.ojs.enqueue).toHaveBeenCalledWith(
      'email.send',
      ['arg'],
      expect.objectContaining({
        queue: 'high-priority',
        meta: expect.objectContaining({
          customField: 'value',
          _requestId: expect.any(String),
          _correlationId: expect.any(String),
        }),
      }),
    );

    await fastify.close();
  });
});
