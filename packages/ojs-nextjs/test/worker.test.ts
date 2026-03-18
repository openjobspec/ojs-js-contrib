import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetJob = vi.fn().mockResolvedValue({ id: 'job-1', type: 'email.send', state: 'active' });

vi.mock('@openjobspec/sdk', () => {
  const OJSClient = vi.fn().mockImplementation(() => ({
    enqueue: vi.fn(),
    enqueueBatch: vi.fn(),
    getJob: mockGetJob,
    cancelJob: vi.fn(),
    health: vi.fn(),
  }));
  return { OJSClient };
});

import { createJobProcessor } from '../src/worker.js';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/ojs/worker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('createJobProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns register and handler functions', () => {
    const processor = createJobProcessor({ baseUrl: 'http://localhost:8080' });
    expect(processor.register).toBeTypeOf('function');
    expect(processor.handler).toBeTypeOf('function');
  });

  it('processes a registered job successfully', async () => {
    const processor = createJobProcessor({ baseUrl: 'http://localhost:8080' });
    const emailHandler = vi.fn().mockResolvedValue({ sent: true });
    processor.register('email.send', emailHandler);

    const req = makeRequest({
      id: 'job-1',
      type: 'email.send',
      args: [{ to: 'user@test.com' }],
      attempt: 1,
    });

    const res = await processor.handler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.jobId).toBe('job-1');
    expect(data.type).toBe('email.send');

    expect(emailHandler).toHaveBeenCalledWith({
      id: 'job-1',
      type: 'email.send',
      args: [{ to: 'user@test.com' }],
      attempt: 1,
    });
  });

  it('returns 422 for unregistered job types', async () => {
    const processor = createJobProcessor({ baseUrl: 'http://localhost:8080' });

    const req = makeRequest({
      id: 'job-1',
      type: 'unknown.job',
      args: [],
      attempt: 1,
    });

    const res = await processor.handler(req);
    expect(res.status).toBe(422);

    const data = await res.json();
    expect(data.error).toContain('unknown.job');
  });

  it('returns 400 for missing id field', async () => {
    const processor = createJobProcessor({ baseUrl: 'http://localhost:8080' });

    const req = makeRequest({ type: 'email.send', args: [] });
    const res = await processor.handler(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing type field', async () => {
    const processor = createJobProcessor({ baseUrl: 'http://localhost:8080' });

    const req = makeRequest({ id: 'job-1', args: [] });
    const res = await processor.handler(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const processor = createJobProcessor({ baseUrl: 'http://localhost:8080' });

    const req = new Request('http://localhost:3000/api/ojs/worker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json{{{',
    });

    const res = await processor.handler(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 500 when handler throws', async () => {
    const processor = createJobProcessor({ baseUrl: 'http://localhost:8080' });
    processor.register('failing.job', async () => {
      throw new Error('handler exploded');
    });

    const req = makeRequest({
      id: 'job-1',
      type: 'failing.job',
      args: [],
      attempt: 1,
    });

    const res = await processor.handler(req);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('handler exploded');
    expect(data.jobId).toBe('job-1');
  });

  it('supports multiple registered handlers', async () => {
    const processor = createJobProcessor({ baseUrl: 'http://localhost:8080' });
    const emailHandler = vi.fn().mockResolvedValue('email sent');
    const reportHandler = vi.fn().mockResolvedValue('report generated');

    processor.register('email.send', emailHandler);
    processor.register('report.generate', reportHandler);

    const req1 = makeRequest({ id: 'j1', type: 'email.send', args: [], attempt: 1 });
    const res1 = await processor.handler(req1);
    expect(res1.status).toBe(200);
    expect(emailHandler).toHaveBeenCalled();

    const req2 = makeRequest({ id: 'j2', type: 'report.generate', args: [], attempt: 1 });
    const res2 = await processor.handler(req2);
    expect(res2.status).toBe(200);
    expect(reportHandler).toHaveBeenCalled();
  });

  it('defaults attempt to 1 if not provided', async () => {
    const processor = createJobProcessor({ baseUrl: 'http://localhost:8080' });
    const handler = vi.fn().mockResolvedValue(null);
    processor.register('test.job', handler);

    const req = makeRequest({ id: 'job-1', type: 'test.job', args: ['data'] });
    await processor.handler(req);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1 }),
    );
  });

  it('defaults args to empty array if not provided', async () => {
    const processor = createJobProcessor({ baseUrl: 'http://localhost:8080' });
    const handler = vi.fn().mockResolvedValue(null);
    processor.register('test.job', handler);

    const req = makeRequest({ id: 'job-1', type: 'test.job', attempt: 2 });
    await processor.handler(req);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ args: [], attempt: 2 }),
    );
  });

  it('uses custom client when provided', async () => {
    const customGetJob = vi.fn().mockResolvedValue({ id: 'j1', state: 'active' });
    const customClient = { getJob: customGetJob } as never;

    const processor = createJobProcessor({ client: customClient });
    const handler = vi.fn().mockResolvedValue('done');
    processor.register('test.job', handler);

    const req = makeRequest({ id: 'j1', type: 'test.job', args: [], attempt: 1 });
    const res = await processor.handler(req);
    expect(res.status).toBe(200);
    expect(customGetJob).toHaveBeenCalledWith('j1');
  });
});
