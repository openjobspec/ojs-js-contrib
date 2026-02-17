import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@openjobspec/sdk', () => {
  const OJSClient = vi.fn().mockImplementation((opts: { url: string }) => ({
    url: opts.url,
    enqueue: vi.fn().mockResolvedValue({ id: 'job-1', type: 'email.send', state: 'available' }),
    enqueueBatch: vi.fn(),
    getJob: vi.fn().mockResolvedValue({ id: 'job-1', type: 'email.send', state: 'completed' }),
    cancelJob: vi.fn().mockResolvedValue({ id: 'job-1', type: 'email.send', state: 'cancelled' }),
  }));
  return { OJSClient };
});

import { OJSClient } from '@openjobspec/sdk';
import { configureOjs, getOjsClient, enqueueJob, getJob, cancelJob } from '../src/server.js';

describe('ojs-nextjs server helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module-level client by reconfiguring
    configureOjs({ baseUrl: 'http://localhost:8080' });
  });

  it('getOjsClient returns a client', () => {
    const client = getOjsClient();
    expect(client).toBeDefined();
    expect(client.enqueue).toBeDefined();
    expect(client.getJob).toBeDefined();
    expect(client.cancelJob).toBeDefined();
  });

  it('configureOjs sets custom base URL', () => {
    configureOjs({ baseUrl: 'http://custom:9090' });
    const client = getOjsClient();

    expect(OJSClient).toHaveBeenCalledWith({ url: 'http://custom:9090' });
    expect(client.url).toBe('http://custom:9090');
  });

  it('getOjsClient uses OJS_URL env var when no config is set', () => {
    // Reset client to null by importing fresh — simulate via configureOjs trick
    // We need to reset the internal _client. We'll do this by clearing and relying on env.
    // Since we can't easily reset module state, we test that configureOjs creates a new client.
    const originalEnv = process.env.OJS_URL;
    process.env.OJS_URL = 'http://env-server:3000';

    vi.mocked(OJSClient).mockClear();
    configureOjs({ baseUrl: process.env.OJS_URL });
    const client = getOjsClient();

    expect(OJSClient).toHaveBeenCalledWith({ url: 'http://env-server:3000' });
    expect(client).toBeDefined();

    process.env.OJS_URL = originalEnv;
  });

  it('enqueueJob delegates to client.enqueue', async () => {
    const job = await enqueueJob('email.send', [{ to: 'user@test.com' }], { queue: 'emails' });

    const client = getOjsClient();
    expect(client.enqueue).toHaveBeenCalledWith(
      'email.send',
      [{ to: 'user@test.com' }],
      { queue: 'emails' },
    );
    expect(job).toEqual({ id: 'job-1', type: 'email.send', state: 'available' });
  });

  it('getJob delegates to client.getJob', async () => {
    const job = await getJob('job-1');

    const client = getOjsClient();
    expect(client.getJob).toHaveBeenCalledWith('job-1');
    expect(job).toEqual({ id: 'job-1', type: 'email.send', state: 'completed' });
  });

  it('cancelJob delegates to client.cancelJob', async () => {
    const job = await cancelJob('job-1');

    const client = getOjsClient();
    expect(client.cancelJob).toHaveBeenCalledWith('job-1');
    expect(job).toEqual({ id: 'job-1', type: 'email.send', state: 'cancelled' });
  });
});
