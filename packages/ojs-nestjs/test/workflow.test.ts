import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'reflect-metadata';

vi.mock('@openjobspec/sdk', () => {
  const MockOJSClient = vi.fn().mockImplementation((opts: { url: string }) => ({
    url: opts.url,
    enqueue: vi.fn().mockResolvedValue({ id: 'job-1' }),
    enqueueBatch: vi.fn().mockImplementation((jobs: Array<{ type: string }>) =>
      Promise.resolve(jobs.map((_: unknown, i: number) => ({ id: `job-${i + 1}` }))),
    ),
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

vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    randomUUID: vi.fn().mockReturnValue('workflow-uuid-1'),
  };
});

import { Test } from '@nestjs/testing';
import { OjsModule } from '../src/ojs.module.js';
import { OjsWorkflowModule } from '../src/ojs-workflow.module.js';
import { OjsWorkflowService } from '../src/ojs-workflow.service.js';
import type { WorkflowStep, WorkflowResult } from '../src/ojs-workflow.service.js';

describe('OjsWorkflowModule', () => {
  it('registers and exports OjsWorkflowService', () => {
    const result = OjsWorkflowModule.register();
    expect(result.module).toBe(OjsWorkflowModule);
    expect(result.providers).toContain(OjsWorkflowService);
    expect(result.exports).toContain(OjsWorkflowService);
  });
});

describe('OjsWorkflowService', () => {
  let service: OjsWorkflowService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        OjsModule.forRoot({
          baseUrl: 'http://localhost:8080',
          queues: ['default'],
          isGlobal: true,
        }),
        OjsWorkflowModule.register(),
      ],
    }).compile();

    service = moduleRef.get(OjsWorkflowService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('chain', () => {
    it('returns empty steps for empty input', async () => {
      const result = await service.chain([]);
      expect(result.id).toBeDefined();
      expect(result.steps).toEqual([]);
    });

    it('enqueues steps sequentially', async () => {
      const steps: WorkflowStep[] = [
        { type: 'step.one', args: ['a'] },
        { type: 'step.two', args: ['b'] },
        { type: 'step.three', args: ['c'] },
      ];

      const result = await service.chain(steps);

      expect(result.id).toBeDefined();
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0]).toMatchObject({ type: 'step.one', state: 'available' });
      expect(result.steps[1]).toMatchObject({ type: 'step.two', state: 'available' });
      expect(result.steps[2]).toMatchObject({ type: 'step.three', state: 'available' });
    });

    it('passes options and workflow metadata', async () => {
      const steps: WorkflowStep[] = [
        { type: 'step.one', args: [1], options: { queue: 'high' } },
      ];

      const result = await service.chain(steps);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].jobId).toBe('job-1');
    });
  });

  describe('group', () => {
    it('returns empty steps for empty input', async () => {
      const result = await service.group([]);
      expect(result.id).toBeDefined();
      expect(result.steps).toEqual([]);
    });

    it('enqueues all steps in parallel via batch', async () => {
      const steps: WorkflowStep[] = [
        { type: 'parallel.one', args: ['x'] },
        { type: 'parallel.two', args: ['y'] },
      ];

      const result = await service.group(steps);

      expect(result.id).toBeDefined();
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0]).toMatchObject({ jobId: 'job-1', type: 'parallel.one', state: 'available' });
      expect(result.steps[1]).toMatchObject({ jobId: 'job-2', type: 'parallel.two', state: 'available' });
    });
  });

  describe('batch', () => {
    it('enqueues jobs and a callback', async () => {
      const jobs: WorkflowStep[] = [
        { type: 'batch.item', args: [1] },
        { type: 'batch.item', args: [2] },
      ];
      const callback: WorkflowStep = { type: 'batch.complete', args: [] };

      const result = await service.batch(jobs, callback);

      expect(result.id).toBeDefined();
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0]).toMatchObject({ type: 'batch.item', state: 'available' });
      expect(result.steps[1]).toMatchObject({ type: 'batch.item', state: 'available' });
      expect(result.steps[2]).toMatchObject({ type: 'batch.complete', state: 'available' });
    });

    it('handles empty jobs with only callback', async () => {
      const callback: WorkflowStep = { type: 'batch.done', args: [] };

      const result = await service.batch([], callback);

      expect(result.steps).toHaveLength(1);
      expect(result.steps[0]).toMatchObject({ type: 'batch.done', state: 'available' });
    });
  });
});
