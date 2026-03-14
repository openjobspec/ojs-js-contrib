/**
 * OJS Cloudflare Worker Example
 *
 * Demonstrates push-based job processing with the OJS Cloudflare adapter.
 * The OJS server delivers jobs to this worker via HTTP POST (push delivery).
 * GET /enqueue lets you enqueue sample jobs for testing.
 *
 * Prerequisites:
 *   npm install
 *   wrangler dev           # Start local dev server
 */
import {
  OjsCloudflareWorker,
  type JobEvent,
  type JobContext,
  type OjsEnv,
} from '@openjobspec/cloudflare';

// ---------------------------------------------------------------------------
// 1. Create the OJS worker and register job handlers
// ---------------------------------------------------------------------------

const ojs = new OjsCloudflareWorker();

ojs.register('email.send', async (job: JobEvent, ctx: JobContext) => {
  const [to, template] = job.args as [string, string];
  console.log(`Sending email to ${to} using template "${template}"`);
  // Simulate network call
  await new Promise((r) => setTimeout(r, 100));
  console.log(`Email sent successfully to ${to}`);
});

ojs.register('image.resize', async (job: JobEvent, ctx: JobContext) => {
  const [url, width, height] = job.args as [string, number, number];
  console.log(`Resizing image ${url} to ${width}×${height}`);
  // Simulate image processing
  await new Promise((r) => setTimeout(r, 500));
  console.log(`Image resized successfully`);
});

ojs.registerDefault(async (job: JobEvent, ctx: JobContext) => {
  console.log(
    `[default] Processing ${job.type} (attempt ${job.attempt}):`,
    job.args,
  );
});

// ---------------------------------------------------------------------------
// 2. Export the Worker
// ---------------------------------------------------------------------------

export default {
  async fetch(
    request: Request,
    env: OjsEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const ojsUrl = env.OJS_URL ?? 'http://localhost:8080';

    // GET /enqueue — enqueue a sample job via the OJS server
    if (request.method === 'GET' && url.pathname === '/enqueue') {
      const jobType = url.searchParams.get('type') ?? 'email.send';
      const res = await fetch(`${ojsUrl}/api/v1/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: jobType,
          args: ['user@example.com', 'welcome'],
        }),
      });
      const body = await res.json();
      return Response.json({ ok: true, job: body });
    }

    // POST / — push delivery from the OJS server (handled by the adapter)
    if (request.method === 'POST') {
      return ojs.handleFetch(request, env, ctx);
    }

    // GET / — health / usage info
    return new Response(
      [
        'OJS Cloudflare Worker Example',
        '',
        'Routes:',
        '  GET  /enqueue?type=email.send  — Enqueue a sample job',
        '  POST /                         — Push delivery endpoint',
      ].join('\n'),
      { headers: { 'content-type': 'text/plain' } },
    );
  },
} satisfies ExportedHandler<OjsEnv>;
