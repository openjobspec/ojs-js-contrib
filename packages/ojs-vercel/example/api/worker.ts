/**
 * POST /api/worker — Push delivery endpoint (OJS server sends jobs here).
 * GET  /api/worker — Vercel Cron trigger for poll-based processing.
 *
 * Configure your OJS server to push jobs to:
 *   https://<your-app>.vercel.app/api/worker
 *
 * For Vercel Cron, see vercel.json at the project root.
 */
import {
  OjsVercelHandler,
  type JobEvent,
  type OjsRequestContext,
} from '@openjobspec/vercel';

const OJS_URL = process.env.OJS_URL ?? 'http://localhost:8080';

// ---------------------------------------------------------------------------
// 1. Create handler and register job processors
// ---------------------------------------------------------------------------

const ojs = new OjsVercelHandler({ ojsUrl: OJS_URL });

ojs.register(
  'email.send',
  async (job: JobEvent, _ctx: OjsRequestContext) => {
    const [to, template] = job.args as [string, string];
    console.log(`Sending email to ${to} using template "${template}"`);
    // Simulate sending
    await new Promise((r) => setTimeout(r, 100));
    console.log(`Email sent to ${to}`);
  },
);

ojs.register(
  'report.generate',
  async (job: JobEvent, _ctx: OjsRequestContext) => {
    const [period, date] = job.args as [string, string];
    console.log(`Generating ${period} report for ${date}`);
    // Simulate report generation
    await new Promise((r) => setTimeout(r, 500));
    console.log(`Report generated`);
  },
);

// ---------------------------------------------------------------------------
// 2. Export route handlers
// ---------------------------------------------------------------------------

// Push delivery — the OJS server POSTs jobs to this endpoint.
const handler = ojs.apiRouteHandler();
export const POST = handler;

// Vercel Cron — triggers a poll-based fetch from the OJS server.
// The cron schedule is defined in vercel.json.
export async function GET() {
  return new Response('OK — cron triggered', { status: 200 });
}
