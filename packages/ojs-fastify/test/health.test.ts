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
import ojsHealthPlugin from '../src/health.js';

describe('ojs-fastify health plugin', () => {
  let fastify: FastifyInstance;

  beforeEach(() => {
    fastify = Fastify();
    vi.clearAllMocks();
  });

  describe('GET /health/ojs (overall)', () => {
    it('returns 200 when client is healthy', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(ojsHealthPlugin);
      await fastify.ready();

      const response = await fastify.inject({ method: 'GET', url: '/health/ojs' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.client.status).toBe('ok');

      await fastify.close();
    });

    it('returns 503 when client is unhealthy', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(ojsHealthPlugin);
      await fastify.ready();

      vi.mocked(fastify.ojs.health).mockRejectedValueOnce(new Error('Connection refused'));

      const response = await fastify.inject({ method: 'GET', url: '/health/ojs' });
      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
      expect(body.client.status).toBe('error');

      await fastify.close();
    });

    it('includes worker status when worker is configured', async () => {
      await fastify.register(ojsPlugin, {
        url: 'http://localhost:8080',
        worker: { handlers: { 'test.job': async () => {} } },
      });
      await fastify.register(ojsHealthPlugin);
      await fastify.ready();

      const response = await fastify.inject({ method: 'GET', url: '/health/ojs' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.worker).toBeDefined();
      expect(body.worker.status).toBe('ok');

      await fastify.close();
    });

    it('supports custom prefix', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(ojsHealthPlugin, { prefix: '/status' });
      await fastify.ready();

      const response = await fastify.inject({ method: 'GET', url: '/status/ojs' });
      expect(response.statusCode).toBe(200);

      await fastify.close();
    });

    it('includes details when detailed option is true', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(ojsHealthPlugin, { detailed: true });
      await fastify.ready();

      const response = await fastify.inject({ method: 'GET', url: '/health/ojs' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.client.details).toBeDefined();

      await fastify.close();
    });
  });

  describe('GET /health/ojs/client', () => {
    it('returns 200 when client is healthy', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(ojsHealthPlugin);
      await fastify.ready();

      const response = await fastify.inject({ method: 'GET', url: '/health/ojs/client' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');

      await fastify.close();
    });

    it('returns 503 when client is unhealthy', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(ojsHealthPlugin);
      await fastify.ready();

      vi.mocked(fastify.ojs.health).mockRejectedValueOnce(new Error('Connection refused'));

      const response = await fastify.inject({ method: 'GET', url: '/health/ojs/client' });
      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('error');

      await fastify.close();
    });

    it('includes details in detailed mode', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(ojsHealthPlugin, { detailed: true });
      await fastify.ready();

      const response = await fastify.inject({ method: 'GET', url: '/health/ojs/client' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.details).toEqual({ status: 'ok' });

      await fastify.close();
    });
  });

  describe('GET /health/ojs/worker', () => {
    it('returns 404 when no worker is configured', async () => {
      await fastify.register(ojsPlugin, { url: 'http://localhost:8080' });
      await fastify.register(ojsHealthPlugin);
      await fastify.ready();

      const response = await fastify.inject({ method: 'GET', url: '/health/ojs/worker' });
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Worker not configured');

      await fastify.close();
    });

    it('returns 200 when worker is healthy', async () => {
      await fastify.register(ojsPlugin, {
        url: 'http://localhost:8080',
        worker: { handlers: { 'test.job': async () => {} } },
      });
      await fastify.register(ojsHealthPlugin);
      await fastify.ready();

      const response = await fastify.inject({ method: 'GET', url: '/health/ojs/worker' });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.running).toBe(true);

      await fastify.close();
    });
  });
});
