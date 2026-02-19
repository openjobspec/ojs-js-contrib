import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OjsCloudflareWorker,
  type JobEvent,
  type JobHandler,
  type PushDeliveryRequest,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createJobEvent(overrides: Partial<JobEvent> = {}): JobEvent {
  return {
    id: '01912345-6789-7abc-def0-123456789abc',
    type: 'email.send',
    queue: 'default',
    args: ['user@example.com', 'Hello'],
    attempt: 1,
    ...overrides,
  };
}

function createPushDeliveryRequest(
  overrides: Partial<PushDeliveryRequest> = {},
): PushDeliveryRequest {
  return {
    job: createJobEvent(),
    worker_id: 'worker-1',
    delivery_id: 'delivery-1',
    ...overrides,
  };
}

function jsonRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://ojs-worker.example.com/', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Minimal mock for ExecutionContext
function createMockExecutionCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OjsCloudflareWorker', () => {
  let ojs: OjsCloudflareWorker;

  beforeEach(() => {
    ojs = new OjsCloudflareWorker({
      logger: {
        log: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
      },
    });
  });

  describe('register', () => {
    it('registers a handler and returns this for chaining', () => {
      const handler: JobHandler = vi.fn();
      const result = ojs.register('email.send', handler);
      expect(result).toBe(ojs);
    });
  });

  describe('registerDefault', () => {
    it('registers a default handler and returns this for chaining', () => {
      const handler: JobHandler = vi.fn();
      const result = ojs.registerDefault(handler);
      expect(result).toBe(ojs);
    });
  });

  describe('processJobDirect', () => {
    it('calls the registered handler for the job type', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      ojs.register('email.send', handler);

      const job = createJobEvent();
      await ojs.processJobDirect(job);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(job, expect.objectContaining({ trigger: 'direct' }));
    });

    it('calls the default handler for unregistered types', async () => {
      const defaultHandler = vi.fn().mockResolvedValue(undefined);
      ojs.registerDefault(defaultHandler);

      const job = createJobEvent({ type: 'unknown.type' });
      await ojs.processJobDirect(job);

      expect(defaultHandler).toHaveBeenCalledOnce();
    });

    it('throws when no handler is registered for the job type', async () => {
      const job = createJobEvent({ type: 'unknown.type' });
      await expect(ojs.processJobDirect(job)).rejects.toThrow(
        'no handler registered for job type: unknown.type',
      );
    });

    it('propagates handler errors', async () => {
      ojs.register('email.send', async () => {
        throw new Error('send failed');
      });

      const job = createJobEvent();
      await expect(ojs.processJobDirect(job)).rejects.toThrow('send failed');
    });
  });

  describe('handleFetch', () => {
    it('returns 405 for non-POST methods', async () => {
      const req = new Request('https://worker.example.com/', { method: 'GET' });
      const env = {};
      const ctx = createMockExecutionCtx();

      const resp = await ojs.handleFetch(req, env, ctx);

      expect(resp.status).toBe(405);
      const body = await resp.json() as { status: string };
      expect(body.status).toBe('failed');
    });

    it('returns 400 for invalid JSON body', async () => {
      const req = new Request('https://worker.example.com/', {
        method: 'POST',
        body: 'not json',
      });
      const env = {};
      const ctx = createMockExecutionCtx();

      const resp = await ojs.handleFetch(req, env, ctx);

      expect(resp.status).toBe(400);
    });

    it('returns 200 with completed status on success', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      ojs.register('email.send', handler);

      const delivery = createPushDeliveryRequest();
      const req = jsonRequest(delivery);
      const env = {};
      const ctx = createMockExecutionCtx();

      const resp = await ojs.handleFetch(req, env, ctx);

      expect(resp.status).toBe(200);
      const body = await resp.json() as { status: string };
      expect(body.status).toBe('completed');
      expect(handler).toHaveBeenCalledOnce();
    });

    it('returns 200 with failed status on handler error', async () => {
      ojs.register('email.send', async () => {
        throw new Error('handler failed');
      });

      const delivery = createPushDeliveryRequest();
      const req = jsonRequest(delivery);
      const env = {};
      const ctx = createMockExecutionCtx();

      const resp = await ojs.handleFetch(req, env, ctx);

      expect(resp.status).toBe(200);
      const body = await resp.json() as { status: string; error?: { message: string; retryable: boolean } };
      expect(body.status).toBe('failed');
      expect(body.error?.message).toBe('handler failed');
      expect(body.error?.retryable).toBe(true);
    });

    it('caches job state to KV on success', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      ojs.register('email.send', handler);

      const mockPut = vi.fn().mockResolvedValue(undefined);
      const env = { OJS_KV: { put: mockPut } as unknown };
      const ctx = createMockExecutionCtx();

      const delivery = createPushDeliveryRequest();
      const req = jsonRequest(delivery);

      await ojs.handleFetch(req, env, ctx);

      expect(ctx.waitUntil).toHaveBeenCalled();
    });
  });

  describe('handleQueue', () => {
    it('processes and acknowledges queue messages', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      ojs.register('email.send', handler);

      const job = createJobEvent();
      const ack = vi.fn();
      const retry = vi.fn();

      const batch = {
        messages: [
          { id: 'msg-1', body: JSON.stringify(job), ack, retry },
        ],
      } as unknown as MessageBatch<string>;

      const env = {};
      const ctx = createMockExecutionCtx();

      await ojs.handleQueue(batch, env, ctx);

      expect(handler).toHaveBeenCalledOnce();
      expect(ack).toHaveBeenCalledOnce();
      expect(retry).not.toHaveBeenCalled();
    });

    it('retries queue messages on handler failure', async () => {
      ojs.register('email.send', async () => {
        throw new Error('handler failed');
      });

      const job = createJobEvent();
      const ack = vi.fn();
      const retry = vi.fn();

      const batch = {
        messages: [
          { id: 'msg-1', body: JSON.stringify(job), ack, retry },
        ],
      } as unknown as MessageBatch<string>;

      const env = {};
      const ctx = createMockExecutionCtx();

      await ojs.handleQueue(batch, env, ctx);

      expect(ack).not.toHaveBeenCalled();
      expect(retry).toHaveBeenCalledOnce();
    });

    it('acks messages with unparseable bodies', async () => {
      const ack = vi.fn();
      const retry = vi.fn();

      const batch = {
        messages: [
          { id: 'msg-bad', body: 'not json', ack, retry },
        ],
      } as unknown as MessageBatch<string>;

      const env = {};
      const ctx = createMockExecutionCtx();

      await ojs.handleQueue(batch, env, ctx);

      expect(ack).toHaveBeenCalledOnce();
      expect(retry).not.toHaveBeenCalled();
    });

    it('processes multiple messages in a batch', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      ojs.register('email.send', handler);

      const jobs = [
        createJobEvent({ id: 'job-1' }),
        createJobEvent({ id: 'job-2' }),
        createJobEvent({ id: 'job-3' }),
      ];

      const batch = {
        messages: jobs.map((job, i) => ({
          id: `msg-${i}`,
          body: JSON.stringify(job),
          ack: vi.fn(),
          retry: vi.fn(),
        })),
      } as unknown as MessageBatch<string>;

      const env = {};
      const ctx = createMockExecutionCtx();

      await ojs.handleQueue(batch, env, ctx);

      expect(handler).toHaveBeenCalledTimes(3);
      for (const msg of (batch as any).messages) {
        expect(msg.ack).toHaveBeenCalledOnce();
      }
    });
  });

  describe('asWorker', () => {
    it('returns an object with fetch and queue exports', () => {
      const worker = ojs.asWorker();
      expect(worker.fetch).toBeTypeOf('function');
      expect(worker.queue).toBeTypeOf('function');
    });
  });
});
