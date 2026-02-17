# @openjobspec/nextjs

Next.js helpers for [OpenJobSpec](https://github.com/openjobspec/openjobspec) — a universal, language-agnostic standard for background job processing.

## Installation

```bash
npm install @openjobspec/nextjs @openjobspec/sdk next
```

## Server-Side Usage

### Server Actions

```typescript
'use server';

import { enqueueJob } from '@openjobspec/nextjs/server';

export async function submitEmailJob(to: string, subject: string) {
  const job = await enqueueJob('email.send', [{ to, subject }], {
    queue: 'emails',
  });
  return job.id;
}
```

### Route Handlers

```typescript
import { NextResponse } from 'next/server';
import { enqueueJob, getJob } from '@openjobspec/nextjs/server';

export async function POST(request: Request) {
  const { type, args } = await request.json();
  const job = await enqueueJob(type, args);
  return NextResponse.json(job, { status: 201 });
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const job = await getJob(params.id);
  return NextResponse.json(job);
}
```

### Custom Configuration

By default, the client connects to `http://localhost:8080` or the `OJS_URL` environment variable. To configure explicitly:

```typescript
// app/lib/ojs.ts
import { configureOjs } from '@openjobspec/nextjs/server';

configureOjs({ baseUrl: process.env.OJS_URL! });
```

## Client-Side Usage

### Job Status Polling

```typescript
'use client';

import { useJobStatus } from '@openjobspec/nextjs/client';

export function JobTracker({ jobId }: { jobId: string }) {
  const { status, isPolling } = useJobStatus(jobId, '/api/jobs', {
    pollInterval: 2000,
    onComplete: (s) => console.log('Done!', s),
  });

  if (!status) return <p>Loading...</p>;

  return (
    <div>
      <p>State: {status.state}</p>
      {isPolling && <p>Polling...</p>}
    </div>
  );
}
```

### Hook Options

| Option         | Type                          | Default | Description                          |
|----------------|-------------------------------|---------|--------------------------------------|
| `pollInterval` | `number`                      | `1000`  | Milliseconds between polling requests |
| `enabled`      | `boolean`                     | `true`  | Whether polling is active            |
| `onComplete`   | `(status: JobStatus) => void` | —       | Callback when job reaches completed  |
| `onError`      | `(status: JobStatus) => void` | —       | Callback when job reaches discarded  |

## API Reference

### Server (`@openjobspec/nextjs/server`)

| Function                                       | Description                       |
|------------------------------------------------|-----------------------------------|
| `configureOjs(config: OjsServerConfig)`        | Set OJS server URL explicitly     |
| `getOjsClient(): OJSClient`                   | Get the singleton OJS client      |
| `enqueueJob(type, args, options?): Promise<Job>` | Enqueue a job                   |
| `getJob(jobId): Promise<Job>`                  | Retrieve a job by ID              |
| `cancelJob(jobId): Promise<Job>`               | Cancel a job by ID                |

### Client (`@openjobspec/nextjs/client`)

| Function                                              | Description                |
|-------------------------------------------------------|----------------------------|
| `useJobStatus(jobId, apiEndpoint, options?)`          | React hook for polling job status |

## License

Apache-2.0
