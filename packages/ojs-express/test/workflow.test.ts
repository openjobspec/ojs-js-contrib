import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('@openjobspec/sdk', () => {
  const mockWorkflow = vi.fn().mockResolvedValue({
    id: 'wf_123',
    type: 'chain',
    state: 'pending',
    metadata: { created_at: '2024-01-01T00:00:00Z', job_count: 3, completed_count: 0, failed_count: 0 },
  });

  const OJSClient = vi.fn().mockImplementation((opts: { url: string }) => ({
    url: opts.url,
    enqueue: vi.fn(),
    enqueueBatch: vi.fn(),
    getJob: vi.fn(),
    cancelJob: vi.fn(),
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
    workflow: mockWorkflow,
  }));

  const OJSWorker = vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  }));

  const chain = vi.fn().mockImplementation((...steps: unknown[]) => ({
    type: 'chain',
    steps,
  }));
  const group = vi.fn().mockImplementation((...jobs: unknown[]) => ({
    type: 'group',
    jobs,
  }));
  const batch = vi.fn().mockImplementation((jobs: unknown[], callbacks: unknown) => ({
    type: 'batch',
    jobs,
    callbacks,
  }));

  return { OJSClient, OJSWorker, chain, group, batch };
});

import { ojsMiddleware, createWorkflowRouter, ojsWorkflowMiddleware } from '../src/index.js';
import type { OjsRequest, WorkflowStep } from '../src/index.js';
import { OJSClient, chain, group, batch } from '@openjobspec/sdk';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return { ...overrides } as unknown as Request;
}

function createMockRes(): Response & { _statusCode?: number; _body?: unknown } {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & { _statusCode?: number; _body?: unknown };
  return res;
}

function attachOjsClient(req: Request, url = 'http://localhost:8080'): void {
  const client = new OJSClient({ url });
  (req as OjsRequest).ojs = client;
}

describe('ojsWorkflowMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attaches ojsWorkflow helpers to the request', () => {
    const req = createMockReq();
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    const middleware = ojsWorkflowMiddleware();
    middleware(req, res, next);

    const ojsReq = req as unknown as OjsRequest & { ojsWorkflow: unknown };
    expect(ojsReq.ojsWorkflow).toBeDefined();
    expect(typeof (ojsReq.ojsWorkflow as Record<string, unknown>).chain).toBe('function');
    expect(typeof (ojsReq.ojsWorkflow as Record<string, unknown>).group).toBe('function');
    expect(typeof (ojsReq.ojsWorkflow as Record<string, unknown>).batch).toBe('function');
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws if ojs client is not on request', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    const middleware = ojsWorkflowMiddleware();
    expect(() => middleware(req, res, next)).toThrow('OJS client not found');
  });

  it('chain helper calls SDK chain and client.workflow', async () => {
    const req = createMockReq();
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    ojsWorkflowMiddleware()(req, res, next);

    const ojsReq = req as unknown as OjsRequest & { ojsWorkflow: { chain: (steps: WorkflowStep[]) => Promise<unknown> } };
    const steps: WorkflowStep[] = [
      { type: 'order.validate', args: ['id_1'] },
      { type: 'payment.charge', args: ['id_1'] },
    ];

    const result = await ojsReq.ojsWorkflow.chain(steps);

    expect(chain).toHaveBeenCalledWith(
      { type: 'order.validate', args: ['id_1'], options: undefined },
      { type: 'payment.charge', args: ['id_1'], options: undefined },
    );
    expect(result).toEqual(expect.objectContaining({ id: 'wf_123' }));
  });

  it('group helper calls SDK group and client.workflow', async () => {
    const req = createMockReq();
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    ojsWorkflowMiddleware()(req, res, next);

    const ojsReq = req as unknown as OjsRequest & { ojsWorkflow: { group: (steps: WorkflowStep[]) => Promise<unknown> } };
    const steps: WorkflowStep[] = [
      { type: 'export.csv', args: ['rpt_1'] },
      { type: 'export.pdf', args: ['rpt_1'] },
    ];

    const result = await ojsReq.ojsWorkflow.group(steps);

    expect(group).toHaveBeenCalledWith(
      { type: 'export.csv', args: ['rpt_1'], options: undefined },
      { type: 'export.pdf', args: ['rpt_1'], options: undefined },
    );
    expect(result).toEqual(expect.objectContaining({ id: 'wf_123' }));
  });

  it('batch helper calls SDK batch and client.workflow', async () => {
    const req = createMockReq();
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    ojsWorkflowMiddleware()(req, res, next);

    const ojsReq = req as unknown as OjsRequest & {
      ojsWorkflow: {
        batch: (steps: WorkflowStep[], callbacks: Record<string, WorkflowStep>) => Promise<unknown>;
      };
    };
    const steps: WorkflowStep[] = [
      { type: 'email.send', args: ['user1'] },
      { type: 'email.send', args: ['user2'] },
    ];
    const callbacks = {
      on_complete: { type: 'batch.report', args: [] as unknown[] },
    };

    const result = await ojsReq.ojsWorkflow.batch(steps, callbacks);

    expect(batch).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: 'wf_123' }));
  });
});

describe('createWorkflowRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a router with POST /ojs/workflows/chain', () => {
    const router = createWorkflowRouter();
    const routes = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }).stack
      .filter((layer) => layer.route)
      .map((layer) => ({ path: layer.route!.path, method: Object.keys(layer.route!.methods)[0] }));

    expect(routes).toContainEqual({ path: '/ojs/workflows/chain', method: 'post' });
    expect(routes).toContainEqual({ path: '/ojs/workflows/group', method: 'post' });
    expect(routes).toContainEqual({ path: '/ojs/workflows/batch', method: 'post' });
  });

  it('uses custom prefix', () => {
    const router = createWorkflowRouter({ prefix: '/api/workflows' });
    const routes = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }).stack
      .filter((layer) => layer.route)
      .map((layer) => ({ path: layer.route!.path, method: Object.keys(layer.route!.methods)[0] }));

    expect(routes).toContainEqual({ path: '/api/workflows/chain', method: 'post' });
    expect(routes).toContainEqual({ path: '/api/workflows/group', method: 'post' });
    expect(routes).toContainEqual({ path: '/api/workflows/batch', method: 'post' });
  });

  it('POST /ojs/workflows/chain creates a chain workflow', async () => {
    const router = createWorkflowRouter();
    const chainRoute = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack
      .find((layer) => layer.route?.path === '/ojs/workflows/chain');

    const handler = chainRoute!.route!.stack[0].handle;

    const req = createMockReq({
      body: {
        steps: [
          { type: 'order.validate', args: ['id_1'] },
          { type: 'payment.charge', args: ['id_1'] },
        ],
      },
    } as Partial<Request>);
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(chain).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalled();
  });

  it('POST /ojs/workflows/chain returns 400 for empty steps', async () => {
    const router = createWorkflowRouter();
    const chainRoute = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack
      .find((layer) => layer.route?.path === '/ojs/workflows/chain');

    const handler = chainRoute!.route!.stack[0].handle;

    const req = createMockReq({
      body: { steps: [] },
    } as Partial<Request>);
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'steps must be a non-empty array' });
  });

  it('POST /ojs/workflows/group creates a group workflow', async () => {
    const router = createWorkflowRouter();
    const groupRoute = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack
      .find((layer) => layer.route?.path === '/ojs/workflows/group');

    const handler = groupRoute!.route!.stack[0].handle;

    const req = createMockReq({
      body: {
        steps: [
          { type: 'export.csv', args: ['rpt_1'] },
          { type: 'export.pdf', args: ['rpt_1'] },
        ],
      },
    } as Partial<Request>);
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(group).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('POST /ojs/workflows/batch returns 400 if callbacks missing', async () => {
    const router = createWorkflowRouter();
    const batchRoute = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack
      .find((layer) => layer.route?.path === '/ojs/workflows/batch');

    const handler = batchRoute!.route!.stack[0].handle;

    const req = createMockReq({
      body: {
        steps: [{ type: 'email.send', args: ['user1'] }],
      },
    } as Partial<Request>);
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('callbacks') }),
    );
  });

  it('POST /ojs/workflows/batch creates a batch workflow', async () => {
    const router = createWorkflowRouter();
    const batchRoute = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack
      .find((layer) => layer.route?.path === '/ojs/workflows/batch');

    const handler = batchRoute!.route!.stack[0].handle;

    const req = createMockReq({
      body: {
        steps: [
          { type: 'email.send', args: ['user1'] },
          { type: 'email.send', args: ['user2'] },
        ],
        callbacks: {
          on_complete: { type: 'batch.report', args: [] },
        },
      },
    } as Partial<Request>);
    attachOjsClient(req);
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(batch).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('calls next on unexpected errors', async () => {
    const router = createWorkflowRouter();
    const chainRoute = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack
      .find((layer) => layer.route?.path === '/ojs/workflows/chain');

    const handler = chainRoute!.route!.stack[0].handle;

    const req = createMockReq({
      body: {
        steps: [{ type: 'order.validate', args: ['id_1'] }],
      },
    } as Partial<Request>);
    // No client attached — will throw
    const res = createMockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
