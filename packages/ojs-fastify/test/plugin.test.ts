import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@openjobspec/sdk', () => {
  const OJSClient = vi.fn().mockImplementation((opts: { url: string }) => ({
    url: opts.url,
    enqueue: vi.fn().mockResolvedValue({ id: 'job-1' }),
    enqueueBatch: vi.fn().mockResolvedValue([{ id: 'job-1' }]),
    getJob: vi.fn().mockResolvedValue({ id: 'job-1', state: 'completed' }),
    cancelJob: vi.fn().mockResolvedValue({ id: 'job-1', state: 'cancelled' }),
  }));
  return { OJSClient };
});

import Fastify, { type FastifyInstance } from 'fastify';
import ojsPluginDefault from '../src/plugin.js';
import { ojsPlugin } from '../src/index.js';
import { OJSClient } from '@openjobspec/sdk';

describe('ojs-fastify plugin', () => {
  let fastify: FastifyInstance;

  beforeEach(() => {
    fastify = Fastify();
    vi.clearAllMocks();
  });

  it('decorates fastify instance with ojs client', async () => {
    await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
    await fastify.ready();

    expect(fastify.ojs).toBeDefined();
    expect(OJSClient).toHaveBeenCalledWith({ url: 'http://localhost:8080' });
    expect(fastify.ojs.enqueue).toBeDefined();
    expect(fastify.ojs.enqueueBatch).toBeDefined();
    expect(fastify.ojs.getJob).toBeDefined();
    expect(fastify.ojs.cancelJob).toBeDefined();

    await fastify.close();
  });

  it('uses custom client when provided', async () => {
    const customClient = new OJSClient({ url: 'http://custom:9090' });
    vi.mocked(OJSClient).mockClear();

    await fastify.register(ojsPlugin, {
      url: 'http://localhost:8080',
      client: customClient,
    });
    await fastify.ready();

    expect(fastify.ojs).toBe(customClient);
    expect(OJSClient).not.toHaveBeenCalled();

    await fastify.close();
  });

  it('registers onClose hook', async () => {
    const addHookSpy = vi.spyOn(fastify, 'addHook');

    await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
    await fastify.ready();

    expect(addHookSpy).toHaveBeenCalledWith('onClose', expect.any(Function));

    await fastify.close();
  });

  it('exports plugin via default and named export', () => {
    expect(ojsPlugin).toBeDefined();
    expect(ojsPluginDefault).toBeDefined();
    expect(ojsPlugin).toBe(ojsPluginDefault);
  });

  it('makes ojs client accessible in route handlers', async () => {
    await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });

    let routeOjs: unknown = null;
    fastify.get('/test', async (request, reply) => {
      routeOjs = fastify.ojs;
      return { ok: true };
    });

    await fastify.ready();

    const response = await fastify.inject({ method: 'GET', url: '/test' });

    expect(response.statusCode).toBe(200);
    expect(routeOjs).toBeDefined();
    expect(routeOjs).toBe(fastify.ojs);

    await fastify.close();
  });

  it('can enqueue a job through the decorated client', async () => {
    await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
    await fastify.ready();

    const result = await fastify.ojs.enqueue('email.send', [{ to: 'user@test.com' }]);
    expect(result).toEqual({ id: 'job-1' });

    await fastify.close();
  });

  it('survives close without error', async () => {
    await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
    await fastify.ready();

    await expect(fastify.close()).resolves.toBeUndefined();
  });
});
