/**
 * POST /api/enqueue — Enqueue a job via the OJS server.
 * GET  /api/enqueue — Enqueue a sample email.send job for quick testing.
 *
 * Usage:
 *   curl http://localhost:3000/api/enqueue
 *   curl -X POST http://localhost:3000/api/enqueue \
 *     -H 'content-type: application/json' \
 *     -d '{"type":"report.generate","args":["monthly","2024-06"]}'
 */
import { OjsVercelHandler } from '@openjobspec/vercel';

const OJS_URL = process.env.OJS_URL ?? 'http://localhost:8080';

const ojs = new OjsVercelHandler({ ojsUrl: OJS_URL });

export async function GET() {
  const { id } = await ojs.enqueue('email.send', [
    'user@example.com',
    'welcome',
  ]);
  return Response.json({ ok: true, job_id: id });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    type?: string;
    args?: unknown[];
  };

  const jobType = body.type ?? 'email.send';
  const args = body.args ?? [];

  const { id } = await ojs.enqueue(jobType, args);
  return Response.json({ ok: true, job_id: id });
}
