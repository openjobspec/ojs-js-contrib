import { describe, it, expect } from 'vitest';
import {
  mapBackoffToRetry,
  mapRepeatToCron,
  toCompatJob,
} from '../src/types.js';
import type { BullMQBackoffOptions, BullMQRepeatOptions } from '../src/types.js';

describe('mapBackoffToRetry', () => {
  it('maps fixed backoff to OJS retry policy', () => {
    const backoff: BullMQBackoffOptions = { type: 'fixed', delay: 1000 };
    const result = mapBackoffToRetry(backoff, 5);

    expect(result).toEqual({
      maxAttempts: 5,
      backoff: { type: 'fixed', delay: 1000 },
    });
  });

  it('maps exponential backoff to OJS retry policy', () => {
    const backoff: BullMQBackoffOptions = { type: 'exponential', delay: 500 };
    const result = mapBackoffToRetry(backoff, 10);

    expect(result).toEqual({
      maxAttempts: 10,
      backoff: { type: 'exponential', delay: 500 },
    });
  });

  it('maps custom backoff to fixed (fallback)', () => {
    const backoff: BullMQBackoffOptions = { type: 'custom', delay: 2000 };
    const result = mapBackoffToRetry(backoff);

    expect(result).toEqual({
      maxAttempts: 3,
      backoff: { type: 'fixed', delay: 2000 },
    });
  });

  it('defaults maxAttempts to 3 when not specified', () => {
    const backoff: BullMQBackoffOptions = { type: 'fixed', delay: 100 };
    const result = mapBackoffToRetry(backoff);

    expect(result.maxAttempts).toBe(3);
  });
});

describe('mapRepeatToCron', () => {
  it('uses the cron pattern directly when provided', () => {
    const repeat: BullMQRepeatOptions = { pattern: '0 * * * *' };
    const result = mapRepeatToCron(repeat, 'cleanup', 'maintenance');

    expect(result).toEqual({
      type: 'cleanup',
      args: [],
      queue: 'maintenance',
      schedule: '0 * * * *',
    });
  });

  it('converts millisecond interval to a cron schedule (seconds)', () => {
    const repeat: BullMQRepeatOptions = { every: 15000 };
    const result = mapRepeatToCron(repeat, 'ping', 'health');

    expect(result.schedule).toBe('*/15 * * * * *');
  });

  it('converts millisecond interval to a cron schedule (minutes)', () => {
    const repeat: BullMQRepeatOptions = { every: 300000 };
    const result = mapRepeatToCron(repeat, 'sync', 'default');

    expect(result.schedule).toBe('*/5 * * * *');
  });

  it('converts millisecond interval to a cron schedule (hours)', () => {
    const repeat: BullMQRepeatOptions = { every: 7200000 };
    const result = mapRepeatToCron(repeat, 'report', 'analytics');

    expect(result.schedule).toBe('0 */2 * * *');
  });

  it('falls back to every-minute when no pattern or interval', () => {
    const repeat: BullMQRepeatOptions = {};
    const result = mapRepeatToCron(repeat, 'noop', 'q');

    expect(result.schedule).toBe('* * * * *');
  });

  it('pattern takes precedence over every', () => {
    const repeat: BullMQRepeatOptions = { pattern: '*/10 * * * *', every: 1000 };
    const result = mapRepeatToCron(repeat, 'test', 'q');

    expect(result.schedule).toBe('*/10 * * * *');
  });
});

describe('toCompatJob', () => {
  it('converts a minimal OJS job to BullMQ format', () => {
    const ojsJob = {
      specversion: '0.1',
      id: 'job-123',
      type: 'send-email',
      queue: 'emails',
      args: [{ to: 'user@test.com' }],
      state: 'active',
      attempt: 2,
      created_at: '2024-01-01T00:00:00Z',
    };

    const result = toCompatJob(ojsJob);

    expect(result.id).toBe('job-123');
    expect(result.name).toBe('send-email');
    expect(result.data).toEqual({ to: 'user@test.com' });
    expect(result.attemptsMade).toBe(2);
    expect(result.timestamp).toBe(new Date('2024-01-01T00:00:00Z').getTime());
    expect(result.priority).toBe(0);
  });

  it('maps retry policy to opts.attempts', () => {
    const ojsJob = {
      specversion: '0.1',
      id: 'j1',
      type: 't',
      queue: 'q',
      args: [{}],
      retry: { max_attempts: 5 },
    };

    const result = toCompatJob(ojsJob);
    expect(result.opts.attempts).toBe(5);
  });

  it('maps priority to opts and top-level', () => {
    const ojsJob = {
      specversion: '0.1',
      id: 'j2',
      type: 't',
      queue: 'q',
      args: [{}],
      priority: 10,
    };

    const result = toCompatJob(ojsJob);
    expect(result.priority).toBe(10);
    expect(result.opts.priority).toBe(10);
  });

  it('maps error fields', () => {
    const ojsJob = {
      specversion: '0.1',
      id: 'j3',
      type: 't',
      queue: 'q',
      args: [{}],
      error: { code: 'TIMEOUT', message: 'timed out' },
    };

    const result = toCompatJob(ojsJob);
    expect(result.failedReason).toBe('timed out');
    expect(result.stacktrace).toEqual(['timed out']);
  });

  it('defaults data to empty object when args is empty', () => {
    const ojsJob = {
      specversion: '0.1',
      id: 'j4',
      type: 't',
      queue: 'q',
      args: [],
    };

    const result = toCompatJob(ojsJob);
    expect(result.data).toEqual({});
  });

  it('maps result to returnvalue', () => {
    const ojsJob = {
      specversion: '0.1',
      id: 'j5',
      type: 't',
      queue: 'q',
      args: [{}],
      result: { ok: true },
    };

    const result = toCompatJob(ojsJob);
    expect(result.returnvalue).toEqual({ ok: true });
  });

  it('maps timeout to opts.timeout', () => {
    const ojsJob = {
      specversion: '0.1',
      id: 'j6',
      type: 't',
      queue: 'q',
      args: [{}],
      timeout: 30000,
    };

    const result = toCompatJob(ojsJob);
    expect(result.opts.timeout).toBe(30000);
  });
});
