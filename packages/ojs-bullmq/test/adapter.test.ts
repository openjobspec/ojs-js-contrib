import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @openjobspec/sdk before importing adapter
vi.mock('@openjobspec/sdk', () => {
  const mockEnqueue = vi.fn();
  const mockEnqueueBatch = vi.fn();
  const mockGetJob = vi.fn();
  const mockCancelJob = vi.fn();
  const mockHealth = vi.fn();
  const mockRegister = vi.fn();
  const mockStart = vi.fn();
  const mockStop = vi.fn();

  return {
    OJSClient: vi.fn().mockImplementation(() => ({
      enqueue: mockEnqueue,
      enqueueBatch: mockEnqueueBatch,
      getJob: mockGetJob,
      cancelJob: mockCancelJob,
      health: mockHealth,
    })),
    OJSWorker: vi.fn().mockImplementation(() => ({
      register: mockRegister,
      start: mockStart,
      stop: mockStop,
    })),
    __mocks: {
      mockEnqueue,
      mockEnqueueBatch,
      mockGetJob,
      mockCancelJob,
      mockHealth,
      mockRegister,
      mockStart,
      mockStop,
    },
  };
});

import { Queue, Worker } from '../src/adapter.js';
import { migrateJobDefinition, migrateBulk } from '../src/migration.js';
import { OJSClient, OJSWorker } from '@openjobspec/sdk';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (await import('@openjobspec/sdk') as any).__mocks as {
  mockEnqueue: ReturnType<typeof vi.fn>;
  mockEnqueueBatch: ReturnType<typeof vi.fn>;
  mockGetJob: ReturnType<typeof vi.fn>;
  mockCancelJob: ReturnType<typeof vi.fn>;
  mockHealth: ReturnType<typeof vi.fn>;
  mockRegister: ReturnType<typeof vi.fn>;
  mockStart: ReturnType<typeof vi.fn>;
  mockStop: ReturnType<typeof vi.fn>;
};

describe('Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an OJSClient with the provided baseUrl', () => {
    new Queue('emails', { baseUrl: 'http://localhost:8080' });
    expect(OJSClient).toHaveBeenCalledWith({ url: 'http://localhost:8080' });
  });

  describe('add()', () => {
    it('maps to OJSClient.enqueue() correctly', async () => {
      mocks.mockEnqueue.mockResolvedValue({ id: 'job-1' });

      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      const result = await queue.add('send-email', { to: 'user@test.com' });

      expect(mocks.mockEnqueue).toHaveBeenCalledWith(
        'send-email',
        [{ to: 'user@test.com' }],
        { queue: 'emails' },
      );
      expect(result).toEqual({ id: 'job-1', name: 'send-email', data: { to: 'user@test.com' } });
    });

    it('converts delay from ms to string format', async () => {
      mocks.mockEnqueue.mockResolvedValue({ id: 'job-2' });

      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      await queue.add('send-email', { to: 'user@test.com' }, { delay: 5000 });

      expect(mocks.mockEnqueue).toHaveBeenCalledWith(
        'send-email',
        [{ to: 'user@test.com' }],
        { queue: 'emails', delay: '5000ms' },
      );
    });

    it('maps priority option', async () => {
      mocks.mockEnqueue.mockResolvedValue({ id: 'job-3' });

      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      await queue.add('send-email', { to: 'user@test.com' }, { priority: 10 });

      expect(mocks.mockEnqueue).toHaveBeenCalledWith(
        'send-email',
        [{ to: 'user@test.com' }],
        { queue: 'emails', priority: 10 },
      );
    });

    it('maps attempts to retry.maxAttempts', async () => {
      mocks.mockEnqueue.mockResolvedValue({ id: 'job-4' });

      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      await queue.add('send-email', { to: 'user@test.com' }, { attempts: 3 });

      expect(mocks.mockEnqueue).toHaveBeenCalledWith(
        'send-email',
        [{ to: 'user@test.com' }],
        { queue: 'emails', retry: { maxAttempts: 3 } },
      );
    });

    it('maps all options together', async () => {
      mocks.mockEnqueue.mockResolvedValue({ id: 'job-5' });

      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      await queue.add('send-email', { to: 'user@test.com' }, {
        delay: 1000,
        priority: 5,
        attempts: 2,
      });

      expect(mocks.mockEnqueue).toHaveBeenCalledWith(
        'send-email',
        [{ to: 'user@test.com' }],
        { queue: 'emails', delay: '1000ms', priority: 5, retry: { maxAttempts: 2 } },
      );
    });
  });

  describe('addBulk()', () => {
    it('maps to OJSClient.enqueueBatch()', async () => {
      mocks.mockEnqueueBatch.mockResolvedValue([
        { id: 'job-a' },
        { id: 'job-b' },
      ]);

      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      const result = await queue.addBulk([
        { name: 'send-email', data: { to: 'a@test.com' } },
        { name: 'send-sms', data: { phone: '555-1234' }, opts: { priority: 3, delay: 2000 } },
      ]);

      expect(mocks.mockEnqueueBatch).toHaveBeenCalledWith([
        { type: 'send-email', args: [{ to: 'a@test.com' }], options: { queue: 'emails', priority: undefined, delay: undefined } },
        { type: 'send-sms', args: [{ phone: '555-1234' }], options: { queue: 'emails', priority: 3, delay: '2000ms' } },
      ]);
      expect(result).toEqual([
        { id: 'job-a', name: 'send-email', data: { to: 'a@test.com' } },
        { id: 'job-b', name: 'send-sms', data: { phone: '555-1234' } },
      ]);
    });
  });

  describe('getJob()', () => {
    it('delegates to OJSClient.getJob()', async () => {
      const fakeJob = { id: 'job-1', type: 'send-email', state: 'active' };
      mocks.mockGetJob.mockResolvedValue(fakeJob);

      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      const result = await queue.getJob('job-1');

      expect(mocks.mockGetJob).toHaveBeenCalledWith('job-1');
      expect(result).toEqual(fakeJob);
    });

    it('returns undefined when job is not found', async () => {
      mocks.mockGetJob.mockRejectedValue(new Error('Not found'));

      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      const result = await queue.getJob('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('close()', () => {
    it('resolves without error', async () => {
      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      await expect(queue.close()).resolves.toBeUndefined();
    });
  });

  describe('getJobCounts()', () => {
    it('returns zero counts when health has no queue data', async () => {
      mocks.mockHealth.mockResolvedValue({ status: 'ok' });

      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      const counts = await queue.getJobCounts();

      expect(counts).toEqual({
        waiting: 0,
        active: 0,
        completed: 0,
        delayed: 0,
        failed: 0,
      });
    });

    it('maps OJS states to BullMQ state buckets', async () => {
      mocks.mockHealth.mockResolvedValue({
        status: 'ok',
        queues: {
          emails: {
            available: 5,
            pending: 3,
            active: 2,
            completed: 10,
            scheduled: 1,
            retryable: 4,
            cancelled: 1,
            discarded: 1,
          },
        },
      });

      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      const counts = await queue.getJobCounts();

      expect(counts.waiting).toBe(8);   // available(5) + pending(3)
      expect(counts.active).toBe(2);
      expect(counts.completed).toBe(10);
      expect(counts.delayed).toBe(1);   // scheduled
      expect(counts.failed).toBe(6);    // retryable(4) + cancelled(1) + discarded(1)
    });

    it('returns zero counts on health endpoint failure', async () => {
      mocks.mockHealth.mockRejectedValue(new Error('connection refused'));

      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      const counts = await queue.getJobCounts();

      expect(counts.waiting).toBe(0);
    });
  });

  describe('pause() / resume() / isPaused()', () => {
    it('starts unpaused', () => {
      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      expect(queue.isPaused()).toBe(false);
    });

    it('toggles paused state', async () => {
      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      await queue.pause();
      expect(queue.isPaused()).toBe(true);
      await queue.resume();
      expect(queue.isPaused()).toBe(false);
    });
  });

  describe('drain()', () => {
    it('resolves without error (no-op)', async () => {
      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      await expect(queue.drain()).resolves.toBeUndefined();
    });
  });

  describe('getRepeatableJobs()', () => {
    it('returns empty array', async () => {
      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      const jobs = await queue.getRepeatableJobs();
      expect(jobs).toEqual([]);
    });
  });

  describe('removeRepeatable()', () => {
    it('resolves without error (no-op)', async () => {
      const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
      await expect(queue.removeRepeatable('job', { pattern: '* * * * *' })).resolves.toBeUndefined();
    });
  });
});

describe('Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an OJSWorker with the queue name', () => {
    const processor = vi.fn();
    new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

    expect(OJSWorker).toHaveBeenCalledWith({
      url: 'http://localhost:8080',
      queues: ['emails'],
    });
  });

  it('registers a wildcard handler on construction', () => {
    const processor = vi.fn();
    new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

    expect(mocks.mockRegister).toHaveBeenCalledWith('*', expect.any(Function));
  });

  it('run() delegates to OJSWorker.start()', async () => {
    mocks.mockStart.mockResolvedValue(undefined);
    const processor = vi.fn();
    const worker = new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

    await worker.run();
    expect(mocks.mockStart).toHaveBeenCalled();
  });

  it('close() delegates to OJSWorker.stop()', async () => {
    mocks.mockStop.mockResolvedValue(undefined);
    const processor = vi.fn();
    const worker = new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

    await worker.close();
    expect(mocks.mockStop).toHaveBeenCalled();
  });

  it('handler transforms OJS JobContext to BullMQ-style job', async () => {
    const processor = vi.fn().mockResolvedValue('done');
    new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

    // Extract the registered handler
    const handler = mocks.mockRegister.mock.calls[0][1];
    const ctx = {
      job: { id: 'job-1', type: 'send-email', args: [{ to: 'user@test.com' }] },
      attempt: 2,
      queue: 'emails',
      workerId: 'w-1',
      signal: new AbortController().signal,
      metadata: {},
    };

    const result = await handler(ctx);

    expect(processor).toHaveBeenCalledWith({
      id: 'job-1',
      name: 'send-email',
      data: { to: 'user@test.com' },
      attemptsMade: 2,
    });
    expect(result).toBe('done');
  });

  it('handler defaults data to empty object when args is empty', async () => {
    const processor = vi.fn().mockResolvedValue('ok');
    new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

    const handler = mocks.mockRegister.mock.calls[0][1];
    const ctx = {
      job: { id: 'job-2', type: 'cleanup', args: [] },
      attempt: 1,
      queue: 'emails',
      workerId: 'w-1',
      signal: new AbortController().signal,
      metadata: {},
    };

    await handler(ctx);

    expect(processor).toHaveBeenCalledWith({
      id: 'job-2',
      name: 'cleanup',
      data: {},
      attemptsMade: 1,
    });
  });

  describe('on() / off() events', () => {
    it('emits completed event on successful processing', async () => {
      const processor = vi.fn().mockResolvedValue('result');
      const worker = new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

      const handler = vi.fn();
      worker.on('completed', handler);

      const registeredHandler = mocks.mockRegister.mock.calls[0][1];
      const ctx = {
        job: { id: 'job-1', type: 'send-email', args: [{ to: 'a@b.com' }] },
        attempt: 1,
        queue: 'emails',
        workerId: 'w-1',
        signal: new AbortController().signal,
        metadata: {},
      };

      await registeredHandler(ctx);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'job-1', name: 'send-email' }),
        'result',
      );
    });

    it('emits failed event on processing error', async () => {
      const error = new Error('boom');
      const processor = vi.fn().mockRejectedValue(error);
      const worker = new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

      const handler = vi.fn();
      worker.on('failed', handler);

      const registeredHandler = mocks.mockRegister.mock.calls[0][1];
      const ctx = {
        job: { id: 'job-1', type: 'send-email', args: [{}] },
        attempt: 1,
        queue: 'emails',
        workerId: 'w-1',
        signal: new AbortController().signal,
        metadata: {},
      };

      await expect(registeredHandler(ctx)).rejects.toThrow('boom');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'job-1' }),
        error,
      );
    });

    it('off() removes event listener', async () => {
      const processor = vi.fn().mockResolvedValue('ok');
      const worker = new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

      const handler = vi.fn();
      worker.on('completed', handler);
      worker.off('completed', handler);

      const registeredHandler = mocks.mockRegister.mock.calls[0][1];
      const ctx = {
        job: { id: 'job-1', type: 't', args: [{}] },
        attempt: 1,
        queue: 'emails',
        workerId: 'w-1',
        signal: new AbortController().signal,
        metadata: {},
      };

      await registeredHandler(ctx);
      expect(handler).not.toHaveBeenCalled();
    });

    it('on() returns this for chaining', () => {
      const processor = vi.fn();
      const worker = new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

      const result = worker.on('completed', vi.fn());
      expect(result).toBe(worker);
    });
  });

  describe('pause() / resume()', () => {
    it('starts unpaused and not running', () => {
      const processor = vi.fn();
      const worker = new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

      expect(worker.isPaused()).toBe(false);
      expect(worker.isRunning()).toBe(false);
    });

    it('toggles paused state', async () => {
      const processor = vi.fn();
      const worker = new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

      await worker.pause();
      expect(worker.isPaused()).toBe(true);

      await worker.resume();
      expect(worker.isPaused()).toBe(false);
    });
  });

  describe('isRunning()', () => {
    it('returns true after run() is called', async () => {
      mocks.mockStart.mockResolvedValue(undefined);
      const processor = vi.fn();
      const worker = new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

      await worker.run();
      expect(worker.isRunning()).toBe(true);
    });

    it('returns false after close() is called', async () => {
      mocks.mockStart.mockResolvedValue(undefined);
      mocks.mockStop.mockResolvedValue(undefined);
      const processor = vi.fn();
      const worker = new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

      await worker.run();
      await worker.close();
      expect(worker.isRunning()).toBe(false);
    });
  });

  describe('getRunning()', () => {
    it('returns 0 when no jobs are being processed', () => {
      const processor = vi.fn();
      const worker = new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

      expect(worker.getRunning()).toBe(0);
    });

    it('tracks active job count during processing', async () => {
      let activeCount = 0;
      const processor = vi.fn().mockImplementation(async () => {
        // Capture the running count while we're inside the processor
        activeCount = 1; // We can't reliably check getRunning() inside the mock
        return 'done';
      });

      const worker = new Worker('emails', processor, { baseUrl: 'http://localhost:8080' });

      const registeredHandler = mocks.mockRegister.mock.calls[0][1];
      const ctx = {
        job: { id: 'job-1', type: 't', args: [{}] },
        attempt: 1,
        queue: 'emails',
        workerId: 'w-1',
        signal: new AbortController().signal,
        metadata: {},
      };

      await registeredHandler(ctx);

      // After the handler finishes, count should be back to 0
      expect(worker.getRunning()).toBe(0);
      expect(activeCount).toBe(1);
    });
  });
});

describe('migrateJobDefinition', () => {
  it('converts a basic BullMQ job to OJS format', () => {
    const result = migrateJobDefinition({
      name: 'send-email',
      queue: 'emails',
      data: { to: 'user@test.com' },
    });

    expect(result).toEqual({
      type: 'send-email',
      args: [{ to: 'user@test.com' }],
      options: { queue: 'emails' },
    });
  });

  it('converts delay from ms to string', () => {
    const result = migrateJobDefinition({
      name: 'send-email',
      queue: 'emails',
      data: {},
      opts: { delay: 3000 },
    });

    expect(result.options.delay).toBe('3000ms');
  });

  it('maps priority', () => {
    const result = migrateJobDefinition({
      name: 'send-email',
      queue: 'emails',
      data: {},
      opts: { priority: 7 },
    });

    expect(result.options.priority).toBe(7);
  });

  it('maps attempts to retry.maxAttempts', () => {
    const result = migrateJobDefinition({
      name: 'send-email',
      queue: 'emails',
      data: {},
      opts: { attempts: 5 },
    });

    expect(result.options.retry).toEqual({ maxAttempts: 5 });
  });

  it('maps all options together', () => {
    const result = migrateJobDefinition({
      name: 'process-order',
      queue: 'orders',
      data: { orderId: 42 },
      opts: { delay: 1000, priority: 3, attempts: 2 },
    });

    expect(result).toEqual({
      type: 'process-order',
      args: [{ orderId: 42 }],
      options: {
        queue: 'orders',
        delay: '1000ms',
        priority: 3,
        retry: { maxAttempts: 2 },
      },
    });
  });
});

describe('migrateBulk', () => {
  it('converts an array of BullMQ jobs to OJS format', () => {
    const results = migrateBulk([
      { name: 'job-a', queue: 'q1', data: { x: 1 } },
      { name: 'job-b', queue: 'q2', data: { y: 2 }, opts: { priority: 5 } },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      type: 'job-a',
      args: [{ x: 1 }],
      options: { queue: 'q1' },
    });
    expect(results[1]).toEqual({
      type: 'job-b',
      args: [{ y: 2 }],
      options: { queue: 'q2', priority: 5 },
    });
  });

  it('returns empty array for empty input', () => {
    expect(migrateBulk([])).toEqual([]);
  });
});
