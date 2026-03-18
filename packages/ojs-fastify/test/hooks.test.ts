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
import { ojsPlugin } from '../src/index.js';
import { createOjsHooks } from '../src/hooks.js';

describe('ojs-fastify hooks', () => {
  let fastify: FastifyInstance;

  beforeEach(() => {
    fastify = Fastify();
    vi.clearAllMocks();
  });

  describe('onError hook', () => {
    it('enqueues an error notification job when a route errors', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(createOjsHooks({ logging: false }));

      fastify.get('/fail', async () => {
        throw new Error('Something broke');
      });

      await fastify.ready();

      const response = await fastify.inject({ method: 'GET', url: '/fail' });
      expect(response.statusCode).toBe(500);

      expect(fastify.ojs.enqueue).toHaveBeenCalledWith(
        'ojs.error_notification',
        [
          expect.objectContaining({
            requestId: expect.any(String),
            url: '/fail',
            method: 'GET',
            error: expect.objectContaining({
              message: 'Something broke',
              name: 'Error',
            }),
            timestamp: expect.any(String),
          }),
        ],
      );

      await fastify.close();
    });

    it('uses custom error job type', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(
        createOjsHooks({ logging: false, errorJobType: 'custom.error' }),
      );

      fastify.get('/fail', async () => {
        throw new Error('Oops');
      });

      await fastify.ready();

      await fastify.inject({ method: 'GET', url: '/fail' });

      expect(fastify.ojs.enqueue).toHaveBeenCalledWith(
        'custom.error',
        expect.any(Array),
      );

      await fastify.close();
    });

    it('does not throw if error notification enqueue fails', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(createOjsHooks({ logging: false }));

      vi.mocked(fastify.ojs.enqueue).mockRejectedValueOnce(
        new Error('Enqueue failed'),
      );

      fastify.get('/fail', async () => {
        throw new Error('Route error');
      });

      await fastify.ready();

      const response = await fastify.inject({ method: 'GET', url: '/fail' });
      expect(response.statusCode).toBe(500);

      await fastify.close();
    });
  });

  describe('onClose hook', () => {
    it('stops worker on close', async () => {
      await fastify.register(ojsPlugin, {
        url: 'http://localhost:8080',
        worker: { handlers: { 'test.job': async () => {} } },
      });
      await fastify.register(createOjsHooks({ logging: false }));
      await fastify.ready();

      expect(fastify.ojsWorker).not.toBeNull();
      expect(fastify.ojsWorker!.isHealthy()).toBe(true);

      await fastify.close();
    });
  });

  describe('correlation tracking', () => {
    it('initializes job tracking array on request when correlation is enabled', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(createOjsHooks({ correlation: true, logging: false }));

      let trackedJobs: unknown = undefined;
      fastify.get('/test', async (request) => {
        trackedJobs = request._ojsEnqueuedJobs;
        return { ok: true };
      });

      await fastify.ready();

      await fastify.inject({ method: 'GET', url: '/test' });
      expect(trackedJobs).toEqual([]);

      await fastify.close();
    });

    it('does not initialize tracking array when correlation is disabled', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(createOjsHooks({ correlation: false, logging: false }));

      let trackedJobs: unknown = 'not-set';
      fastify.get('/test', async (request) => {
        trackedJobs = request._ojsEnqueuedJobs;
        return { ok: true };
      });

      await fastify.ready();

      await fastify.inject({ method: 'GET', url: '/test' });
      expect(trackedJobs).toBeNull();

      await fastify.close();
    });
  });
});
