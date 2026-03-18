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
  const OJSWorker = vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  }));
  return { OJSClient, OJSWorker };
});

import Fastify, { type FastifyInstance } from 'fastify';
import ojsPluginDefault from '../src/plugin.js';
import { ojsPlugin, OjsWorkerManager } from '../src/index.js';
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

  it('exports OjsWorkerManager class', () => {
    expect(OjsWorkerManager).toBeDefined();
    expect(typeof OjsWorkerManager).toBe('function');
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

  describe('prefix option', () => {
    it('uses default /health prefix for worker route', async () => {
      await fastify.register(ojsPlugin, {
        url: 'http://localhost:8080',
        worker: { handlers: { 'test.job': async () => {} } },
      });
      await fastify.ready();

      const response = await fastify.inject({ method: 'GET', url: '/health/worker' });
      expect(response.statusCode).toBe(200);

      await fastify.close();
    });

    it('uses custom prefix for worker route', async () => {
      await fastify.register(ojsPlugin, {
        url: 'http://localhost:8080',
        prefix: '/status',
        worker: { handlers: { 'test.job': async () => {} } },
      });
      await fastify.ready();

      const response = await fastify.inject({ method: 'GET', url: '/status/worker' });
      expect(response.statusCode).toBe(200);

      await fastify.close();
    });
  });

  describe('autoStart option', () => {
    it('auto-starts worker by default', async () => {
      await fastify.register(ojsPlugin, {
        url: 'http://localhost:8080',
        worker: { handlers: { 'test.job': async () => {} } },
      });
      await fastify.ready();

      expect(fastify.ojsWorker).not.toBeNull();
      expect(fastify.ojsWorker!.isHealthy()).toBe(true);

      await fastify.close();
    });

    it('does not start worker when autoStart is false', async () => {
      await fastify.register(ojsPlugin, {
        url: 'http://localhost:8080',
        autoStart: false,
        worker: { handlers: { 'test.job': async () => {} } },
      });
      await fastify.ready();

      expect(fastify.ojsWorker).not.toBeNull();
      expect(fastify.ojsWorker!.isHealthy()).toBe(false);

      // Worker health route should return 503
      const response = await fastify.inject({ method: 'GET', url: '/health/worker' });
      expect(response.statusCode).toBe(503);

      await fastify.close();
    });

    it('can manually start worker after registration', async () => {
      await fastify.register(ojsPlugin, {
        url: 'http://localhost:8080',
        autoStart: false,
        worker: { handlers: { 'test.job': async () => {} } },
      });
      await fastify.ready();

      expect(fastify.ojsWorker!.isHealthy()).toBe(false);

      await fastify.ojsWorker!.start();
      expect(fastify.ojsWorker!.isHealthy()).toBe(true);

      await fastify.close();
    });
  });

  describe('OjsWorkerManager', () => {
    it('tracks registered handler types', async () => {
      await fastify.register(ojsPlugin, {
        url: 'http://localhost:8080',
        worker: {
          handlers: {
            'email.send': async () => {},
            'sms.send': async () => {},
          },
        },
      });
      await fastify.ready();

      const types = fastify.ojsWorker!.getRegisteredTypes();
      expect(types).toContain('email.send');
      expect(types).toContain('sms.send');
      expect(types).toHaveLength(2);

      await fastify.close();
    });

    it('tracks dynamically registered types', async () => {
      await fastify.register(ojsPlugin, {
        url: 'http://localhost:8080',
        worker: {},
      });
      await fastify.ready();

      fastify.ojsWorker!.register('late.job', async () => {});

      const types = fastify.ojsWorker!.getRegisteredTypes();
      expect(types).toContain('late.job');

      await fastify.close();
    });

    it('includes handler count in status', async () => {
      await fastify.register(ojsPlugin, {
        url: 'http://localhost:8080',
        worker: {
          handlers: {
            'email.send': async () => {},
            'sms.send': async () => {},
          },
        },
      });
      await fastify.ready();

      const status = fastify.ojsWorker!.getStatus();
      expect(status.registeredHandlers).toBe(2);
      expect(status.registeredTypes).toEqual(
        expect.arrayContaining(['email.send', 'sms.send']),
      );

      await fastify.close();
    });

    it('returns stopped status for non-running worker', async () => {
      await fastify.register(ojsPlugin, {
        url: 'http://localhost:8080',
        autoStart: false,
        worker: {},
      });
      await fastify.ready();

      const status = fastify.ojsWorker!.getStatus();
      expect(status.status).toBe('stopped');
      expect(status.running).toBe(false);

      await fastify.close();
    });
  });
});
