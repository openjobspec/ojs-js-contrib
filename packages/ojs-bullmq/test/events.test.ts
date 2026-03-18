import { describe, it, expect } from 'vitest';
import {
  EVENT_MAP,
  mapEventName,
  toCompatEvent,
  isBullMQEvent,
  allMappedOjsEvents,
} from '../src/events.js';

describe('EVENT_MAP', () => {
  it('maps all expected BullMQ event names', () => {
    expect(EVENT_MAP.completed).toBe('job.completed');
    expect(EVENT_MAP.failed).toBe('job.failed');
    expect(EVENT_MAP.error).toBe('job.failed');
    expect(EVENT_MAP.progress).toBe('job.progress');
    expect(EVENT_MAP.active).toBe('job.started');
    expect(EVENT_MAP.waiting).toBe('job.enqueued');
    expect(EVENT_MAP.delayed).toBe('job.scheduled');
    expect(EVENT_MAP.stalled).toBe('job.retrying');
  });
});

describe('mapEventName', () => {
  it('maps completed to job.completed', () => {
    expect(mapEventName('completed')).toBe('job.completed');
  });

  it('maps failed to job.failed', () => {
    expect(mapEventName('failed')).toBe('job.failed');
  });

  it('maps error to job.failed', () => {
    expect(mapEventName('error')).toBe('job.failed');
  });

  it('maps active to job.started', () => {
    expect(mapEventName('active')).toBe('job.started');
  });

  it('maps waiting to job.enqueued', () => {
    expect(mapEventName('waiting')).toBe('job.enqueued');
  });

  it('maps delayed to job.scheduled', () => {
    expect(mapEventName('delayed')).toBe('job.scheduled');
  });

  it('maps progress to job.progress', () => {
    expect(mapEventName('progress')).toBe('job.progress');
  });

  it('maps stalled to job.retrying', () => {
    expect(mapEventName('stalled')).toBe('job.retrying');
  });
});

describe('toCompatEvent', () => {
  const baseEvent = {
    specversion: '0.1',
    id: 'evt-1',
    type: 'job.completed' as const,
    source: 'ojs',
    time: '2024-01-01T00:00:00Z',
  };

  it('converts completed event to BullMQ-shaped job', () => {
    const ojsEvent = {
      ...baseEvent,
      data: {
        specversion: '0.1',
        id: 'job-1',
        type: 'send-email',
        queue: 'emails',
        args: [{ to: 'test@test.com' }],
        state: 'completed',
      },
    };

    const result = toCompatEvent(ojsEvent, 'completed');
    expect(result).toHaveProperty('id', 'job-1');
    expect(result).toHaveProperty('name', 'send-email');
  });

  it('converts progress event to jobId + data payload', () => {
    const ojsEvent = {
      ...baseEvent,
      type: 'job.progress' as const,
      subject: 'job-42',
      data: { job_id: 'job-42', progress: 75 },
    };

    const result = toCompatEvent(ojsEvent, 'progress') as { jobId: string; data: number };
    expect(result.jobId).toBe('job-42');
    expect(result.data).toBe(75);
  });

  it('converts error event to Error object when message is present', () => {
    const ojsEvent = {
      ...baseEvent,
      type: 'job.failed' as const,
      data: { message: 'Something went wrong' },
    };

    const result = toCompatEvent(ojsEvent, 'error');
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('Something went wrong');
  });

  it('passes through data for waiting events', () => {
    const ojsEvent = {
      ...baseEvent,
      type: 'job.enqueued' as const,
      data: { queue: 'emails', job_type: 'send-email' },
    };

    const result = toCompatEvent(ojsEvent, 'waiting');
    expect(result).toEqual({ queue: 'emails', job_type: 'send-email' });
  });

  it('passes through data for delayed events', () => {
    const ojsEvent = {
      ...baseEvent,
      type: 'job.scheduled' as const,
      data: { scheduled_at: '2024-06-01T12:00:00Z' },
    };

    const result = toCompatEvent(ojsEvent, 'delayed');
    expect(result).toEqual({ scheduled_at: '2024-06-01T12:00:00Z' });
  });
});

describe('isBullMQEvent', () => {
  it('returns true for known BullMQ event names', () => {
    expect(isBullMQEvent('completed')).toBe(true);
    expect(isBullMQEvent('failed')).toBe(true);
    expect(isBullMQEvent('progress')).toBe(true);
    expect(isBullMQEvent('active')).toBe(true);
  });

  it('returns false for unknown event names', () => {
    expect(isBullMQEvent('unknown')).toBe(false);
    expect(isBullMQEvent('job.completed')).toBe(false);
  });
});

describe('allMappedOjsEvents', () => {
  it('returns a deduplicated array of OJS event types', () => {
    const events = allMappedOjsEvents();
    expect(events.length).toBeGreaterThan(0);
    // 'job.failed' appears for both 'failed' and 'error' — should be deduped
    const failedCount = events.filter((e) => e === 'job.failed').length;
    expect(failedCount).toBe(1);
  });

  it('includes all mapped OJS event types', () => {
    const events = allMappedOjsEvents();
    expect(events).toContain('job.completed');
    expect(events).toContain('job.failed');
    expect(events).toContain('job.progress');
    expect(events).toContain('job.started');
    expect(events).toContain('job.enqueued');
    expect(events).toContain('job.scheduled');
    expect(events).toContain('job.retrying');
  });
});
