import { describe, it, expect, vi, beforeEach } from 'vitest';

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
});
