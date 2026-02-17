import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'reflect-metadata';

// Mock @openjobspec/sdk before importing modules that use it
vi.mock('@openjobspec/sdk', () => {
  const MockOJSClient = vi.fn().mockImplementation((opts: { url: string }) => ({
    url: opts.url,
    enqueue: vi.fn().mockResolvedValue({ id: 'job-1' }),
    enqueueBatch: vi.fn().mockResolvedValue([{ id: 'job-1' }]),
    getJob: vi.fn().mockResolvedValue({ id: 'job-1', state: 'available' }),
    cancelJob: vi.fn().mockResolvedValue(undefined),
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
import { Injectable, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OjsModule } from '../src/ojs.module.js';
import { OjsService } from '../src/ojs.service.js';
import { OjsJob } from '../src/ojs.decorator.js';
import { OJS_MODULE_OPTIONS, OJS_JOB_METADATA } from '../src/ojs.interfaces.js';

describe('OjsModule', () => {
  describe('forRoot', () => {
    it('creates a module with OjsService provider', () => {
      const result = OjsModule.forRoot({ baseUrl: 'http://localhost:8080' });

      expect(result.module).toBe(OjsModule);
      expect(result.exports).toContain(OjsService);
      expect(result.providers).toBeDefined();
      expect(result.providers!.length).toBe(2);
    });

    it('sets global flag when isGlobal is true', () => {
      const result = OjsModule.forRoot({
        baseUrl: 'http://localhost:8080',
        isGlobal: true,
      });

      expect(result.global).toBe(true);
    });

    it('does not set global flag by default', () => {
      const result = OjsModule.forRoot({ baseUrl: 'http://localhost:8080' });

      expect(result.global).toBeUndefined();
    });

    it('provides OJS_MODULE_OPTIONS with the given options', () => {
      const options = { baseUrl: 'http://localhost:8080', queues: ['emails'] };
      const result = OjsModule.forRoot(options);

      const optionsProvider = result.providers!.find(
        (p: any) => p.provide === OJS_MODULE_OPTIONS,
      ) as any;
      expect(optionsProvider).toBeDefined();
      expect(optionsProvider.useValue).toEqual(options);
    });
  });

  describe('forRootAsync', () => {
    it('creates a module with async factory provider', () => {
      const result = OjsModule.forRootAsync({
        useFactory: () => ({ baseUrl: 'http://localhost:8080' }),
      });

      expect(result.module).toBe(OjsModule);
      expect(result.exports).toContain(OjsService);
      expect(result.providers).toBeDefined();
      expect(result.providers!.length).toBe(2);
    });

    it('sets global flag when isGlobal is true', () => {
      const result = OjsModule.forRootAsync({
        isGlobal: true,
        useFactory: () => ({ baseUrl: 'http://localhost:8080' }),
      });

      expect(result.global).toBe(true);
    });

    it('includes imports when provided', () => {
      const mockModule = class MockModule {};
      const result = OjsModule.forRootAsync({
        imports: [mockModule as any],
        useFactory: () => ({ baseUrl: 'http://localhost:8080' }),
      });

      expect(result.imports).toContain(mockModule);
    });

    it('provides OJS_MODULE_OPTIONS via useFactory', () => {
      const factory = () => ({ baseUrl: 'http://localhost:8080' });
      const result = OjsModule.forRootAsync({
        useFactory: factory,
        inject: ['CONFIG_SERVICE'],
      });

      const optionsProvider = result.providers!.find(
        (p: any) => p.provide === OJS_MODULE_OPTIONS,
      ) as any;
      expect(optionsProvider).toBeDefined();
      expect(optionsProvider.useFactory).toBe(factory);
      expect(optionsProvider.inject).toContain('CONFIG_SERVICE');
    });
  });
});

describe('OjsService', () => {
  let service: OjsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        OjsModule.forRoot({
          baseUrl: 'http://localhost:8080',
          queues: ['emails', 'reports'],
        }),
      ],
    }).compile();

    service = moduleRef.get(OjsService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('creates an OJSClient with the correct url', () => {
    expect(service.client).toBeDefined();
    expect(service.client.url).toBe('http://localhost:8080');
  });

  it('creates an OJSWorker with the correct options', () => {
    expect(service.worker).toBeDefined();
    expect(service.worker.url).toBe('http://localhost:8080');
    expect(service.worker.queues).toEqual(['emails', 'reports']);
  });

  it('uses default queue when queues not specified', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OjsModule.forRoot({ baseUrl: 'http://localhost:8080' })],
    }).compile();

    const svc = moduleRef.get(OjsService);
    expect(svc.worker.queues).toEqual(['default']);
  });

  it('calls worker.start() on module init', async () => {
    await service.onModuleInit();
    expect(service.worker.start).toHaveBeenCalled();
  });

  it('calls worker.stop() on module destroy', async () => {
    await service.onModuleDestroy();
    expect(service.worker.stop).toHaveBeenCalled();
  });
});

describe('OjsJob decorator', () => {
  it('sets metadata with a string type', () => {
    class TestHandler {
      @OjsJob('email.send')
      handle() {}
    }

    const reflector = new Reflector();
    const metadata = reflector.get(OJS_JOB_METADATA, TestHandler.prototype.handle);
    expect(metadata).toEqual({ type: 'email.send' });
  });

  it('sets metadata with an options object', () => {
    class TestHandler {
      @OjsJob({ type: 'report.generate', queue: 'reports' })
      handle() {}
    }

    const reflector = new Reflector();
    const metadata = reflector.get(OJS_JOB_METADATA, TestHandler.prototype.handle);
    expect(metadata).toEqual({ type: 'report.generate', queue: 'reports' });
  });
});

describe('OjsService with forRootAsync', () => {
  it('creates service via async factory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        OjsModule.forRootAsync({
          useFactory: async () => ({
            baseUrl: 'http://async-host:8080',
            queues: ['async-queue'],
          }),
        }),
      ],
    }).compile();

    const service = moduleRef.get(OjsService);
    expect(service).toBeDefined();
    expect(service.client.url).toBe('http://async-host:8080');
    expect(service.worker.queues).toEqual(['async-queue']);
  });
});
