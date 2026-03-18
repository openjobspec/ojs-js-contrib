import { describe, it, expect, vi, beforeEach } from 'vitest';
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
import { OjsService } from '../src/ojs.service.js';
import { OjsHealthIndicator } from '../src/ojs.health.js';
import { OJS_MODULE_OPTIONS } from '../src/ojs.interfaces.js';

describe('OjsHealthIndicator', () => {
  let health: OjsHealthIndicator;
  let ojsService: OjsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        OjsModule.forRoot({
          baseUrl: 'http://localhost:8080',
          queues: ['emails', 'reports'],
          isGlobal: true,
        }),
      ],
      providers: [OjsHealthIndicator],
    }).compile();

    health = moduleRef.get(OjsHealthIndicator);
    ojsService = moduleRef.get(OjsService);
  });

  it('is defined', () => {
    expect(health).toBeDefined();
  });

  describe('check', () => {
    it('returns up status when client and worker are healthy', async () => {
      // Simulate worker running
      await ojsService.onModuleInit();

      const result = await health.check();

      expect(result.status).toBe('up');
      expect(result.details.client.status).toBe('up');
      expect(result.details.client.url).toBe('http://localhost:8080');
      expect(result.details.worker.status).toBe('ok');
      expect(result.details.worker.running).toBe(true);
      expect(result.details.worker.queues).toEqual(['emails', 'reports']);
    });

    it('returns down status when worker is not running', async () => {
      const result = await health.check();

      expect(result.status).toBe('down');
      expect(result.details.worker.running).toBe(false);
    });

    it('returns down status when client health check fails', async () => {
      // Simulate worker running
      await ojsService.onModuleInit();

      // Make client health check fail
      (ojsService.client.health as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      const result = await health.check();

      expect(result.status).toBe('down');
      expect(result.details.client.status).toBe('down');
      expect(result.details.worker.running).toBe(true);
    });

    it('returns down status when client health returns non-ok', async () => {
      await ojsService.onModuleInit();

      (ojsService.client.health as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { status: 'degraded' },
      );

      const result = await health.check();

      expect(result.status).toBe('down');
      expect(result.details.client.status).toBe('down');
    });
  });

  describe('isHealthy', () => {
    it('returns true when everything is healthy', async () => {
      await ojsService.onModuleInit();

      const result = await health.isHealthy();
      expect(result).toBe(true);
    });

    it('returns false when worker is not running', async () => {
      const result = await health.isHealthy();
      expect(result).toBe(false);
    });

    it('returns false when client health check throws', async () => {
      await ojsService.onModuleInit();

      (ojsService.client.health as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      const result = await health.isHealthy();
      expect(result).toBe(false);
    });
  });
});
