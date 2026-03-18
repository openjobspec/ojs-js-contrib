import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createOjsEventEmitter, ojsEventStream } from '../src/events.js';
import type { OjsEventData } from '../src/events.js';

// We need to mock global fetch for SSE tests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockReq(overrides: Partial<Request> = {}): Request & { on: ReturnType<typeof vi.fn> } {
  return {
    method: 'GET',
    on: vi.fn(),
    ...overrides,
  } as unknown as Request & { on: ReturnType<typeof vi.fn> };
}

function createMockRes(): Response & {
  writeHead: ReturnType<typeof vi.fn>;
  flushHeaders: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
} {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    writeHead: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  } as unknown as Response & {
    writeHead: ReturnType<typeof vi.fn>;
    flushHeaders: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
}

describe('createOjsEventEmitter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an emitter with on/off/start/stop methods', () => {
    const emitter = createOjsEventEmitter({ url: 'http://localhost:8080' });
    expect(typeof emitter.on).toBe('function');
    expect(typeof emitter.off).toBe('function');
    expect(typeof emitter.start).toBe('function');
    expect(typeof emitter.stop).toBe('function');
  });

  it('on() returns the emitter for chaining', () => {
    const emitter = createOjsEventEmitter({ url: 'http://localhost:8080' });
    const handler = vi.fn();
    const result = emitter.on('job.completed', handler);
    expect(result).toBe(emitter);
  });

  it('off() returns the emitter for chaining', () => {
    const emitter = createOjsEventEmitter({ url: 'http://localhost:8080' });
    const handler = vi.fn();
    emitter.on('job.completed', handler);
    const result = emitter.off('job.completed', handler);
    expect(result).toBe(emitter);
  });

  it('throws if SSE connection fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const emitter = createOjsEventEmitter({ url: 'http://localhost:8080' });

    await expect(emitter.start()).rejects.toThrow('Failed to connect to OJS event stream');
  });

  it('throws if response body is null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: null,
    });

    const emitter = createOjsEventEmitter({ url: 'http://localhost:8080' });

    await expect(emitter.start()).rejects.toThrow('Response body is null');
  });

  it('constructs correct URL with event filters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'fail',
    });

    const emitter = createOjsEventEmitter({
      url: 'http://localhost:8080',
      events: ['job.completed', 'job.failed'],
    });

    await expect(emitter.start()).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/events/stream?events=job.completed,job.failed',
      expect.objectContaining({ headers: { Accept: 'text/event-stream' } }),
    );
  });

  it('constructs correct URL without event filters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'fail',
    });

    const emitter = createOjsEventEmitter({ url: 'http://localhost:8080' });

    await expect(emitter.start()).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/events/stream',
      expect.any(Object),
    );
  });

  it('dispatches events to type-specific handlers', async () => {
    const handler = vi.fn();
    const eventData: OjsEventData = {
      type: 'job.completed',
      jobId: 'job_123',
      jobType: 'email.send',
      queue: 'default',
      state: 'completed',
      timestamp: '2024-01-01T00:00:00Z',
    };

    // Create a readable stream that emits one SSE event then closes
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    const emitter = createOjsEventEmitter({ url: 'http://localhost:8080' });
    emitter.on('job.completed', handler);

    await emitter.start();

    // Give the stream processing a tick to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledWith(eventData);
  });

  it('dispatches to wildcard handlers', async () => {
    const allHandler = vi.fn();
    const eventData: OjsEventData = {
      type: 'job.failed',
      jobId: 'job_456',
      jobType: 'report.generate',
      queue: 'default',
      state: 'failed',
      timestamp: '2024-01-01T00:00:00Z',
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    const emitter = createOjsEventEmitter({ url: 'http://localhost:8080' });
    emitter.on('*', allHandler);

    await emitter.start();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(allHandler).toHaveBeenCalledWith(eventData);
  });

  it('does not dispatch after off()', async () => {
    const handler = vi.fn();
    const eventData: OjsEventData = {
      type: 'job.completed',
      jobId: 'job_789',
      jobType: 'cleanup',
      queue: 'default',
      state: 'completed',
      timestamp: '2024-01-01T00:00:00Z',
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    const emitter = createOjsEventEmitter({ url: 'http://localhost:8080' });
    emitter.on('job.completed', handler);
    emitter.off('job.completed', handler);

    await emitter.start();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });

  it('stop() prevents further event processing', () => {
    const emitter = createOjsEventEmitter({ url: 'http://localhost:8080' });
    // Calling stop before start should not throw
    expect(() => emitter.stop()).not.toThrow();
  });

  it('skips malformed SSE data', async () => {
    const handler = vi.fn();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: not-json\n\n'));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'job.completed', jobId: 'j1', jobType: 't', queue: 'q', state: 's', timestamp: 'ts' })}\n\n`));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    const emitter = createOjsEventEmitter({ url: 'http://localhost:8080' });
    emitter.on('job.completed', handler);

    await emitter.start();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not start twice', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      body: stream,
    });

    const emitter = createOjsEventEmitter({ url: 'http://localhost:8080' });
    await emitter.start();
    await emitter.start();

    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

describe('ojsEventStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets SSE headers and forwards upstream data', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"job.completed"}\n\n'));
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    const middleware = ojsEventStream({ url: 'http://localhost:8080' });
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    expect(res.flushHeaders).toHaveBeenCalled();
    expect(res.write).toHaveBeenCalledWith('data: {"type":"job.completed"}\n\n');
    expect(res.end).toHaveBeenCalled();
  });

  it('sends error when upstream connection fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      body: null,
    });

    const middleware = ojsEventStream({ url: 'http://localhost:8080' });
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining('Failed to connect'),
    );
    expect(res.end).toHaveBeenCalled();
  });

  it('includes event filter params in upstream URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      body: null,
    });

    const middleware = ojsEventStream({
      url: 'http://localhost:8080',
      events: ['job.completed'],
    });
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/events/stream?events=job.completed',
      expect.any(Object),
    );
  });

  it('registers close handler on request', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: stream,
    });

    const middleware = ojsEventStream({ url: 'http://localhost:8080' });
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));
  });
});
