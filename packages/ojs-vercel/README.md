# @openjobspec/vercel

Vercel Edge and Serverless adapter for [OpenJobSpec](https://github.com/openjobspec/openjobspec) -- provides Next.js API route handlers, Edge Function handlers, background job enqueueing, and optional Vercel KV caching.

## Installation

```bash
npm install @openjobspec/vercel @openjobspec/sdk
```

## Quick Start

### Next.js App Router (API Route)

```typescript
// app/api/ojs/route.ts
import { OjsVercelHandler } from '@openjobspec/vercel';

const ojs = new OjsVercelHandler({
  ojsUrl: process.env.OJS_URL!,
});

ojs.register('email.send', async (job) => {
  const [to, subject] = job.args;
  await sendEmail(to as string, subject as string);
});

ojs.register('report.generate', async (job) => {
  const [reportId] = job.args;
  await generateReport(reportId as string);
});

export const POST = ojs.apiRouteHandler();
```

### Edge Runtime

```typescript
// app/api/ojs/route.ts
import { OjsVercelHandler } from '@openjobspec/vercel';

export const runtime = 'edge';

const ojs = new OjsVercelHandler({
  ojsUrl: process.env.OJS_URL!,
});

ojs.register('email.send', async (job) => {
  await sendEmail(job.args[0] as string);
});

export const POST = ojs.edgeHandler();
```

### Convenience Factory Functions

For a more concise setup, use the factory functions:

```typescript
// app/api/ojs/route.ts
import { ojsApiRoute } from '@openjobspec/vercel';

export const POST = ojsApiRoute({
  ojsUrl: process.env.OJS_URL!,
  handlers: {
    'email.send': async (job) => {
      await sendEmail(job.args[0] as string);
    },
    'report.generate': async (job) => {
      await generateReport(job.args[0] as string);
    },
  },
});
```

```typescript
// Edge variant
import { ojsEdgeHandler } from '@openjobspec/vercel';

export const runtime = 'edge';
export const POST = ojsEdgeHandler({
  ojsUrl: process.env.OJS_URL!,
  handlers: {
    'email.send': async (job) => { /* ... */ },
  },
});
```

### Enqueue Jobs from Server-Side Code

```typescript
// app/actions.ts
'use server';

import { OjsVercelHandler } from '@openjobspec/vercel';

const ojs = new OjsVercelHandler({ ojsUrl: process.env.OJS_URL! });

export async function sendWelcomeEmail(userId: string) {
  const result = await ojs.enqueue('email.welcome', [userId], {
    queue: 'emails',
    priority: 5,
  });
  return result.id;
}

export async function scheduleReport(reportType: string) {
  const result = await ojs.enqueue('report.generate', [reportType], {
    scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  return result.id;
}
```

### Vercel KV Integration

Cache job state for fast lookups:

```typescript
import { kv } from '@vercel/kv';
import { OjsVercelHandler } from '@openjobspec/vercel';

const ojs = new OjsVercelHandler({
  ojsUrl: process.env.OJS_URL!,
  kv,
  kvTtlSeconds: 7200,
});

ojs.register('email.send', async (job) => {
  // Job state is automatically cached to KV after completion/failure
  await sendEmail(job.args[0] as string);
});

// Check cached job state from an API route
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');
  if (!jobId) return Response.json({ error: 'missing jobId' }, { status: 400 });

  const state = await ojs.getCachedJobState(jobId);
  return Response.json(state ?? { state: 'unknown' });
}

export const POST = ojs.apiRouteHandler();
```

### Default Handler

Handle unregistered job types with a fallback:

```typescript
const ojs = new OjsVercelHandler({ ojsUrl: process.env.OJS_URL! });

ojs.register('email.send', handleEmail);

ojs.registerDefault(async (job) => {
  console.warn(`Unhandled job type: ${job.type}`);
  // Send to dead-letter queue, alert, etc.
});

export const POST = ojs.apiRouteHandler();
```

## Configuration

### `OjsVercelConfig`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ojsUrl` | `string` | *(required)* | OJS server base URL |
| `kv` | `VercelKVClient` | `undefined` | Vercel KV client for caching |
| `kvTtlSeconds` | `number` | `3600` | TTL for KV-cached job state |
| `logger` | `Console`-like | `console` | Logger implementation |

## API Reference

### `OjsVercelHandler`

| Method | Description |
|--------|-------------|
| `register(jobType, handler)` | Register a handler for a job type |
| `registerDefault(handler)` | Register a fallback handler |
| `apiRouteHandler()` | Return a Next.js API route handler |
| `edgeHandler()` | Return a Vercel Edge Function handler |
| `enqueue(type, args, options?)` | Enqueue a job to the OJS server |
| `getCachedJobState(jobId)` | Read cached job state from Vercel KV |

### `ojsApiRoute(config)`

Factory function that creates a Next.js API route handler with handlers registered inline.

### `ojsEdgeHandler(config)`

Factory function that creates a Vercel Edge Function handler with handlers registered inline.

### Types

- `JobEvent` -- Job payload received by handlers
- `OjsRequestContext` -- Context with request, trigger source, and KV access
- `PushDeliveryRequest` / `PushDeliveryResponse` -- HTTP push protocol types
- `VercelKVClient` -- Minimal KV interface compatible with `@vercel/kv`

## License

Apache-2.0
