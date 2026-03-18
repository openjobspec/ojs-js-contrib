import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEnqueue = vi.fn().mockResolvedValue({ id: 'job-1', type: 'email.send', state: 'available' });
const mockEnqueueBatch = vi.fn().mockResolvedValue([
  { id: 'job-1', type: 'email.send', state: 'available' },
  { id: 'job-2', type: 'email.send', state: 'available' },
]);
const mockGetJob = vi.fn().mockResolvedValue({ id: 'job-1', type: 'email.send', state: 'completed' });
const mockCancelJob = vi.fn().mockResolvedValue({ id: 'job-1', type: 'email.send', state: 'cancelled' });
const mockHealth = vi.fn().mockResolvedValue({ status: 'ok' });

vi.mock('@openjobspec/sdk', () => {
  const OJSClient = vi.fn().mockImplementation(() => ({
    enqueue: mockEnqueue,
    enqueueBatch: mockEnqueueBatch,
    getJob: mockGetJob,
    cancelJob: mockCancelJob,
    health: mockHealth,
  }));
  return { OJSClient };
});

import { createOjsRouteHandlers } from '../src/routes.js';

function makeRequest(method: string, url: string, body?: unknown): Request {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return new Request(url, init);
}

describe('createOjsRouteHandlers', () => {
  let handlers: ReturnType<typeof createOjsRouteHandlers>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = createOjsRouteHandlers({ baseUrl: 'http://localhost:8080' });
  });

  it('returns GET, POST, DELETE handlers', () => {
    expect(handlers.GET).toBeTypeOf('function');
    expect(handlers.POST).toBeTypeOf('function');
    expect(handlers.DELETE).toBeTypeOf('function');
  });

  describe('GET /api/ojs/health', () => {
    it('returns health status', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/ojs/health');
      const res = await handlers.GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ status: 'ok' });
      expect(mockHealth).toHaveBeenCalled();
    });
  });

  describe('GET /api/ojs/jobs/:id', () => {
    it('returns a job by ID', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/ojs/jobs/job-1');
      const res = await handlers.GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('job-1');
      expect(data.state).toBe('completed');
      expect(mockGetJob).toHaveBeenCalledWith('job-1');
    });
  });

  describe('GET unknown route', () => {
    it('returns 404 for unknown paths', async () => {
      const req = makeRequest('GET', 'http://localhost:3000/api/ojs/unknown');
      const res = await handlers.GET(req);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/ojs/jobs', () => {
    it('enqueues a single job', async () => {
      const req = makeRequest('POST', 'http://localhost:3000/api/ojs/jobs', {
        type: 'email.send',
        args: [{ to: 'user@test.com' }],
        options: { queue: 'emails' },
      });
      const res = await handlers.POST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe('job-1');
      expect(mockEnqueue).toHaveBeenCalledWith(
        'email.send',
        [{ to: 'user@test.com' }],
        { queue: 'emails' },
      );
    });

    it('returns 400 if type is missing', async () => {
      const req = makeRequest('POST', 'http://localhost:3000/api/ojs/jobs', {
        args: [],
      });
      const res = await handlers.POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('type');
    });
  });

  describe('POST /api/ojs/jobs/batch', () => {
    it('enqueues a batch of jobs', async () => {
      const req = makeRequest('POST', 'http://localhost:3000/api/ojs/jobs/batch', {
        jobs: [
          { type: 'email.send', args: [{ to: 'a@b.com' }] },
          { type: 'email.send', args: [{ to: 'c@d.com' }] },
        ],
      });
      const res = await handlers.POST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data).toHaveLength(2);
      expect(mockEnqueueBatch).toHaveBeenCalled();
    });

    it('returns 400 if jobs array is empty', async () => {
      const req = makeRequest('POST', 'http://localhost:3000/api/ojs/jobs/batch', {
        jobs: [],
      });
      const res = await handlers.POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 if jobs is missing', async () => {
      const req = makeRequest('POST', 'http://localhost:3000/api/ojs/jobs/batch', {});
      const res = await handlers.POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ojs/webhooks', () => {
    it('accepts a webhook event', async () => {
      const onWebhook = vi.fn().mockResolvedValue(undefined);
      const wh = createOjsRouteHandlers({ baseUrl: 'http://localhost:8080', onWebhook });

      const event = {
        type: 'job.completed',
        jobId: 'job-1',
        jobType: 'email.send',
        queue: 'default',
        timestamp: new Date().toISOString(),
        payload: { result: 'sent' },
      };

      const req = makeRequest('POST', 'http://localhost:3000/api/ojs/webhooks', event);
      const res = await wh.POST(req);
      expect(res.status).toBe(200);
      expect(onWebhook).toHaveBeenCalledWith(event);
    });

    it('returns 401 if webhook signature is invalid', async () => {
      const wh = createOjsRouteHandlers({
        baseUrl: 'http://localhost:8080',
        webhookSecret: 'my-secret',
      });

      const req = new Request('http://localhost:3000/api/ojs/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ojs-signature': 'sha256=invalidsig',
        },
        body: JSON.stringify({ type: 'job.completed', jobId: 'j1' }),
      });

      const res = await wh.POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/ojs/jobs/:id', () => {
    it('cancels a job by ID', async () => {
      const req = makeRequest('DELETE', 'http://localhost:3000/api/ojs/jobs/job-1');
      const res = await handlers.DELETE(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.state).toBe('cancelled');
      expect(mockCancelJob).toHaveBeenCalledWith('job-1');
    });

    it('returns 404 for unknown delete paths', async () => {
      const req = makeRequest('DELETE', 'http://localhost:3000/api/ojs/unknown');
      const res = await handlers.DELETE(req);
      expect(res.status).toBe(404);
    });
  });

  describe('POST unknown route', () => {
    it('returns 404 for unknown POST paths', async () => {
      const req = makeRequest('POST', 'http://localhost:3000/api/ojs/unknown', {});
      const res = await handlers.POST(req);
      expect(res.status).toBe(404);
    });
  });

  describe('error handling', () => {
    it('returns 500 when getJob throws', async () => {
      mockGetJob.mockRejectedValueOnce(new Error('connection refused'));
      const req = makeRequest('GET', 'http://localhost:3000/api/ojs/jobs/job-1');
      const res = await handlers.GET(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe('connection refused');
    });

    it('returns 500 when enqueue throws', async () => {
      mockEnqueue.mockRejectedValueOnce(new Error('queue full'));
      const req = makeRequest('POST', 'http://localhost:3000/api/ojs/jobs', {
        type: 'email.send',
        args: [],
      });
      const res = await handlers.POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe('queue full');
    });
  });

  describe('custom client', () => {
    it('uses a provided client instance', async () => {
      const customGetJob = vi.fn().mockResolvedValue({ id: 'custom-1', state: 'active' });
      const customHealth = vi.fn().mockResolvedValue({ status: 'ok' });
      const customClient = { getJob: customGetJob, health: customHealth } as never;

      const h = createOjsRouteHandlers({ client: customClient });
      const req = makeRequest('GET', 'http://localhost:3000/api/ojs/jobs/custom-1');
      const res = await h.GET(req);
      expect(res.status).toBe(200);
      expect(customGetJob).toHaveBeenCalledWith('custom-1');
    });
  });
});
