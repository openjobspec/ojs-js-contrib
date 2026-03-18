import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @openjobspec/sdk before importing queue-migration
vi.mock('@openjobspec/sdk', () => {
  const mockEnqueue = vi.fn();
  const mockEnqueueBatch = vi.fn();
  return {
    OJSClient: vi.fn().mockImplementation(() => ({
      enqueue: mockEnqueue,
      enqueueBatch: mockEnqueueBatch,
    })),
    OJSWorker: vi.fn(),
    __mocks: { mockEnqueue, mockEnqueueBatch },
  };
});

import { migrateQueue, generateMigrationReport } from '../src/queue-migration.js';
import type { MigrationResult } from '../src/queue-migration.js';
import type { BullMQJobDefinition } from '../src/migration.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (await import('@openjobspec/sdk') as any).__mocks as {
  mockEnqueue: ReturnType<typeof vi.fn>;
  mockEnqueueBatch: ReturnType<typeof vi.fn>;
};

describe('migrateQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('migrates all jobs successfully via enqueueBatch', async () => {
    mocks.mockEnqueueBatch.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    const jobs: BullMQJobDefinition[] = [
      { name: 'send-email', queue: 'emails', data: { to: 'a@b.com' } },
      { name: 'send-sms', queue: 'emails', data: { phone: '555' } },
    ];

    const result = await migrateQueue(
      { sourceQueue: 'emails', ojsUrl: 'http://localhost:8080' },
      jobs,
    );

    expect(result.success).toBe(true);
    expect(result.migrated).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.totalJobs).toBe(2);
    expect(result.skipped).toBe(0);
    expect(mocks.mockEnqueueBatch).toHaveBeenCalledTimes(1);
  });

  it('uses targetQueue when specified', async () => {
    mocks.mockEnqueueBatch.mockResolvedValue([{ id: 'x' }]);

    const jobs: BullMQJobDefinition[] = [
      { name: 'job-a', queue: 'old-queue', data: {} },
    ];

    await migrateQueue(
      { sourceQueue: 'old-queue', targetQueue: 'new-queue', ojsUrl: 'http://localhost:8080' },
      jobs,
    );

    const batchArg = mocks.mockEnqueueBatch.mock.calls[0][0];
    expect(batchArg[0].options.queue).toBe('new-queue');
  });

  it('respects batchSize option', async () => {
    mocks.mockEnqueueBatch.mockResolvedValue([{ id: '1' }]);

    const jobs: BullMQJobDefinition[] = Array.from({ length: 5 }, (_, i) => ({
      name: `job-${i}`,
      queue: 'q',
      data: {},
    }));

    await migrateQueue(
      { sourceQueue: 'q', ojsUrl: 'http://localhost:8080', batchSize: 2 },
      jobs,
    );

    // 5 jobs / batch 2 = 3 batch calls
    expect(mocks.mockEnqueueBatch).toHaveBeenCalledTimes(3);
  });

  it('skips delayed jobs when includeDelayed is false', async () => {
    mocks.mockEnqueueBatch.mockResolvedValue([{ id: '1' }]);

    const jobs: BullMQJobDefinition[] = [
      { name: 'now-job', queue: 'q', data: {} },
      { name: 'later-job', queue: 'q', data: {}, opts: { delay: 5000 } },
    ];

    const result = await migrateQueue(
      { sourceQueue: 'q', ojsUrl: 'http://localhost:8080', includeDelayed: false },
      jobs,
    );

    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('skips repeatable jobs when includeRepeatable is false', async () => {
    mocks.mockEnqueueBatch.mockResolvedValue([{ id: '1' }]);

    const jobs: BullMQJobDefinition[] = [
      { name: 'one-shot', queue: 'q', data: {} },
      { name: 'cron-job', queue: 'q', data: {}, opts: { repeat: { pattern: '* * * * *' } } },
    ];

    const result = await migrateQueue(
      { sourceQueue: 'q', ojsUrl: 'http://localhost:8080', includeRepeatable: false },
      jobs,
    );

    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('applies transform function to jobs', async () => {
    mocks.mockEnqueueBatch.mockResolvedValue([{ id: '1' }]);

    const jobs: BullMQJobDefinition[] = [
      { name: 'old-name', queue: 'q', data: { key: 'val' } },
    ];

    await migrateQueue(
      {
        sourceQueue: 'q',
        ojsUrl: 'http://localhost:8080',
        transform: (job) => ({ ...job, name: 'new-name' }),
      },
      jobs,
    );

    const batchArg = mocks.mockEnqueueBatch.mock.calls[0][0];
    expect(batchArg[0].type).toBe('new-name');
  });

  it('falls back to individual enqueue on batch failure', async () => {
    mocks.mockEnqueueBatch.mockRejectedValue(new Error('batch failed'));
    mocks.mockEnqueue.mockResolvedValue({ id: 'fallback' });

    const jobs: BullMQJobDefinition[] = [
      { name: 'job-a', queue: 'q', data: {} },
      { name: 'job-b', queue: 'q', data: {} },
    ];

    const result = await migrateQueue(
      { sourceQueue: 'q', ojsUrl: 'http://localhost:8080' },
      jobs,
    );

    expect(result.migrated).toBe(2);
    expect(mocks.mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it('records individual job errors on fallback failures', async () => {
    mocks.mockEnqueueBatch.mockRejectedValue(new Error('batch failed'));
    mocks.mockEnqueue
      .mockResolvedValueOnce({ id: 'ok' })
      .mockRejectedValueOnce(new Error('bad job'));

    const jobs: BullMQJobDefinition[] = [
      { name: 'good', queue: 'q', data: {} },
      { name: 'bad', queue: 'q', data: {} },
    ];

    const result = await migrateQueue(
      { sourceQueue: 'q', ojsUrl: 'http://localhost:8080' },
      jobs,
    );

    expect(result.success).toBe(false);
    expect(result.migrated).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toBe('bad job');
  });

  it('reports progress via onProgress callback', async () => {
    mocks.mockEnqueueBatch.mockResolvedValue([{ id: '1' }]);
    const progressCalls: Array<{ phase: string }> = [];

    const jobs: BullMQJobDefinition[] = [
      { name: 'j', queue: 'q', data: {} },
    ];

    await migrateQueue(
      {
        sourceQueue: 'q',
        ojsUrl: 'http://localhost:8080',
        onProgress: (p) => progressCalls.push({ phase: p.phase }),
      },
      jobs,
    );

    const phases = progressCalls.map((c) => c.phase);
    expect(phases).toContain('scanning');
    expect(phases).toContain('migrating');
    expect(phases).toContain('complete');
  });

  it('returns empty result for empty input', async () => {
    const result = await migrateQueue(
      { sourceQueue: 'q', ojsUrl: 'http://localhost:8080' },
      [],
    );

    expect(result.success).toBe(true);
    expect(result.totalJobs).toBe(0);
    expect(result.migrated).toBe(0);
  });
});

describe('generateMigrationReport', () => {
  it('generates a success report', () => {
    const result: MigrationResult = {
      success: true,
      totalJobs: 100,
      migrated: 100,
      failed: 0,
      skipped: 0,
      errors: [],
      duration: 1234,
    };

    const report = generateMigrationReport(result);
    expect(report).toContain('SUCCESS');
    expect(report).toContain('Total:    100');
    expect(report).toContain('Migrated: 100');
    expect(report).toContain('1234ms');
  });

  it('generates a failure report with errors', () => {
    const result: MigrationResult = {
      success: false,
      totalJobs: 10,
      migrated: 8,
      failed: 2,
      skipped: 0,
      errors: [
        { jobId: 'j1', error: 'timeout' },
        { jobId: 'j2', error: 'invalid data' },
      ],
      duration: 500,
    };

    const report = generateMigrationReport(result);
    expect(report).toContain('PARTIAL FAILURE');
    expect(report).toContain('Failed:   2');
    expect(report).toContain('[j1] timeout');
    expect(report).toContain('[j2] invalid data');
  });

  it('includes skipped count', () => {
    const result: MigrationResult = {
      success: true,
      totalJobs: 20,
      migrated: 15,
      failed: 0,
      skipped: 5,
      errors: [],
      duration: 300,
    };

    const report = generateMigrationReport(result);
    expect(report).toContain('Skipped:  5');
  });
});
