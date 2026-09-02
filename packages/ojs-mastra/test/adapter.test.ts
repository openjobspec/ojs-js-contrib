import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MastraAdapter } from '../src/index.js';

/**
 * Characterization tests added prior to the wrapWorkflow/wrapAgent enqueue
 * de-duplication so the shared transport behavior is pinned down.
 */
describe('MastraAdapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ job: { id: 'job-xyz' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.OJS_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('wrapWorkflow', () => {
    it('derives the job type from the workflow name', () => {
      const adapter = new MastraAdapter();
      const durable = adapter.wrapWorkflow({ name: 'reindex' });
      expect(durable.jobType).toBe('mastra.workflow.reindex');
    });

    it('falls back to "unnamed" when no name is provided', () => {
      const adapter = new MastraAdapter();
      expect(adapter.wrapWorkflow({}).jobType).toBe('mastra.workflow.unnamed');
    });

    it('enqueue POSTs the job envelope and returns the server job id', async () => {
      const adapter = new MastraAdapter({ serverUrl: 'http://ojs:9000', defaultQueue: 'flows' });
      const durable = adapter.wrapWorkflow({ name: 'reindex' });

      const result = await durable.enqueue({ tenant: 'acme' });

      expect(result).toEqual({ jobId: 'job-xyz' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://ojs:9000/api/v1/jobs');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(init.body)).toEqual({
        type: 'mastra.workflow.reindex',
        args: [{ tenant: 'acme' }],
        queue: 'flows',
      });
    });

    it('enqueue throws when the server responds with a non-ok status', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' });
      const adapter = new MastraAdapter();
      const durable = adapter.wrapWorkflow({ name: 'reindex' });

      await expect(durable.enqueue({})).rejects.toThrow('OJS enqueue failed: 503 Service Unavailable');
    });

    it('handler invokes the workflow execute with the first arg', async () => {
      const execute = vi.fn().mockResolvedValue('ok');
      const adapter = new MastraAdapter();
      const handler = adapter.wrapWorkflow({ name: 'reindex', execute }).handler();

      const out = await handler([{ tenant: 'acme' }, 'ignored']);

      expect(out).toBe('ok');
      expect(execute).toHaveBeenCalledWith({ tenant: 'acme' });
    });

    it('handler throws when the workflow has no execute method', async () => {
      const adapter = new MastraAdapter();
      const handler = adapter.wrapWorkflow({ name: 'reindex' }).handler();
      await expect(handler([{}])).rejects.toThrow('Workflow reindex has no execute method');
    });
  });

  describe('wrapAgent', () => {
    it('derives the job type from the agent name', () => {
      const adapter = new MastraAdapter();
      expect(adapter.wrapAgent({ name: 'triage' }).jobType).toBe('mastra.agent.triage');
    });

    it('enqueue POSTs with the agent job type and default queue', async () => {
      const adapter = new MastraAdapter({ serverUrl: 'http://ojs:9000' });
      const durable = adapter.wrapAgent({ name: 'triage' });

      const result = await durable.enqueue({ ticket: 42 });

      expect(result).toEqual({ jobId: 'job-xyz' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://ojs:9000/api/v1/jobs');
      expect(JSON.parse(init.body)).toEqual({
        type: 'mastra.agent.triage',
        args: [{ ticket: 42 }],
        queue: 'mastra',
      });
    });

    it('handler invokes the agent generate with the first arg', async () => {
      const generate = vi.fn().mockResolvedValue('answer');
      const adapter = new MastraAdapter();
      const handler = adapter.wrapAgent({ name: 'triage', generate }).handler();

      const out = await handler([{ ticket: 42 }]);

      expect(out).toBe('answer');
      expect(generate).toHaveBeenCalledWith({ ticket: 42 });
    });

    it('handler throws when the agent has no generate method', async () => {
      const adapter = new MastraAdapter();
      const handler = adapter.wrapAgent({ name: 'triage' }).handler();
      await expect(handler([{}])).rejects.toThrow('Agent triage has no generate method');
    });
  });

  describe('configuration defaults', () => {
    it('defaults serverUrl to localhost and queue to "mastra"', async () => {
      const adapter = new MastraAdapter();
      await adapter.wrapWorkflow({ name: 'x' }).enqueue({});
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8080/api/v1/jobs');
      expect(JSON.parse(init.body).queue).toBe('mastra');
    });

    it('honors the OJS_URL environment variable', async () => {
      process.env.OJS_URL = 'http://env-host:7000';
      const adapter = new MastraAdapter();
      await adapter.wrapWorkflow({ name: 'x' }).enqueue({});
      expect(fetchMock.mock.calls[0][0]).toBe('http://env-host:7000/api/v1/jobs');
    });
  });
});
