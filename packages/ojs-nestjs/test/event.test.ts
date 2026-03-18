import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'reflect-metadata';

vi.mock('@openjobspec/sdk', () => {
  const MockOJSClient = vi.fn().mockImplementation((opts: { url: string }) => ({
    url: opts.url,
    enqueue: vi.fn().mockResolvedValue({ id: 'job-1' }),
    enqueueBatch: vi.fn().mockResolvedValue([{ id: 'job-1' }]),
    getJob: vi.fn().mockResolvedValue({ id: 'job-1', state: 'available' }),
    cancelJob: vi.fn().mockResolvedValue(undefined),
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
  }));

  const MockOJSWorker = vi.fn().mockImplementation((opts: { url: string; queues: string[] }) => ({
    url: opts.url,
    queues: opts.queues,
    register: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  }));

  return { OJSClient: MockOJSClient, OJSWorker: MockOJSWorker };
});

import { Test } from '@nestjs/testing';
import { OjsModule } from '../src/ojs.module.js';
import { OjsEventModule } from '../src/ojs-event.module.js';
import { OjsEventService } from '../src/ojs-event.service.js';
import type { OjsEvent, OjsEventHandler } from '../src/ojs-event.service.js';

function createEvent(overrides: Partial<OjsEvent> = {}): OjsEvent {
  return {
    type: 'job.completed',
    jobId: 'job-1',
    jobType: 'email.send',
    queue: 'default',
    timestamp: new Date().toISOString(),
    payload: {},
    ...overrides,
  };
}

describe('OjsEventModule', () => {
  it('registers and exports OjsEventService', () => {
    const result = OjsEventModule.register();
    expect(result.module).toBe(OjsEventModule);
    expect(result.providers).toContain(OjsEventService);
    expect(result.exports).toContain(OjsEventService);
  });
});

describe('OjsEventService', () => {
  let service: OjsEventService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        OjsModule.forRoot({
          baseUrl: 'http://localhost:8080',
          queues: ['default'],
          isGlobal: true,
        }),
        OjsEventModule.register(),
      ],
    }).compile();

    service = moduleRef.get(OjsEventService);
  });

  afterEach(async () => {
    await service.stop();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('on/off', () => {
    it('registers a handler and returns this for chaining', () => {
      const handler: OjsEventHandler = vi.fn();
      const result = service.on('job.completed', handler);
      expect(result).toBe(service);
    });

    it('removes a handler and returns this for chaining', () => {
      const handler: OjsEventHandler = vi.fn();
      service.on('job.completed', handler);
      const result = service.off('job.completed', handler);
      expect(result).toBe(service);
    });

    it('handles removing a handler that was never registered', () => {
      const handler: OjsEventHandler = vi.fn();
      const result = service.off('job.completed', handler);
      expect(result).toBe(service);
    });
  });

  describe('emit', () => {
    it('does not dispatch events when not running', async () => {
      const handler = vi.fn();
      service.on('job.completed', handler);

      await service.emit(createEvent());

      expect(handler).not.toHaveBeenCalled();
    });

    it('dispatches events to type-specific handlers when running', async () => {
      const handler = vi.fn();
      service.on('job.completed', handler);
      await service.start();

      const event = createEvent();
      await service.emit(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('dispatches events to wildcard handlers', async () => {
      const handler = vi.fn();
      service.on('*', handler);
      await service.start();

      const event = createEvent({ type: 'job.failed' });
      await service.emit(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('dispatches to both type-specific and wildcard handlers', async () => {
      const specificHandler = vi.fn();
      const wildcardHandler = vi.fn();
      service.on('job.completed', specificHandler);
      service.on('*', wildcardHandler);
      await service.start();

      const event = createEvent();
      await service.emit(event);

      expect(specificHandler).toHaveBeenCalledWith(event);
      expect(wildcardHandler).toHaveBeenCalledWith(event);
    });

    it('does not dispatch to handlers for different event types', async () => {
      const handler = vi.fn();
      service.on('job.failed', handler);
      await service.start();

      await service.emit(createEvent({ type: 'job.completed' }));

      expect(handler).not.toHaveBeenCalled();
    });

    it('handles async handlers', async () => {
      const order: string[] = [];
      const asyncHandler: OjsEventHandler = async (event) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(`async-${event.type}`);
      };
      const syncHandler: OjsEventHandler = (event) => {
        order.push(`sync-${event.type}`);
      };

      service.on('job.completed', asyncHandler);
      service.on('job.completed', syncHandler);
      await service.start();

      await service.emit(createEvent());

      expect(order).toContain('async-job.completed');
      expect(order).toContain('sync-job.completed');
    });

    it('does not dispatch after handler is removed', async () => {
      const handler = vi.fn();
      service.on('job.completed', handler);
      service.off('job.completed', handler);
      await service.start();

      await service.emit(createEvent());

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('start/stop', () => {
    it('starts the service', async () => {
      const handler = vi.fn();
      service.on('job.completed', handler);

      await service.start();
      await service.emit(createEvent());

      expect(handler).toHaveBeenCalled();
    });

    it('stops the service', async () => {
      const handler = vi.fn();
      service.on('job.completed', handler);

      await service.start();
      await service.stop();
      await service.emit(createEvent());

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('stops the service on module destroy', async () => {
      await service.start();
      await service.onModuleDestroy();

      const handler = vi.fn();
      service.on('job.completed', handler);
      await service.emit(createEvent());

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
