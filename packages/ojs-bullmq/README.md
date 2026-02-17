# @openjobspec/bullmq

BullMQ-compatible adapter for [OpenJobSpec](https://github.com/openjobspec/openjobspec). Drop-in replacements for BullMQ's `Queue` and `Worker` classes, backed by any OJS-compliant server.

## Install

```bash
npm install @openjobspec/bullmq @openjobspec/sdk
```

## Quick Start

### Before (BullMQ)

```typescript
import { Queue, Worker } from 'bullmq';

const queue = new Queue('emails', { connection: { host: 'localhost', port: 6379 } });
await queue.add('send-email', { to: 'user@example.com' }, { delay: 5000, attempts: 3 });

const worker = new Worker('emails', async (job) => {
  console.log(`Processing ${job.name}`, job.data);
}, { connection: { host: 'localhost', port: 6379 } });
```

### After (OJS via BullMQ adapter)

```typescript
import { Queue, Worker } from '@openjobspec/bullmq';

const queue = new Queue('emails', { baseUrl: 'http://localhost:8080' });
await queue.add('send-email', { to: 'user@example.com' }, { delay: 5000, attempts: 3 });

const worker = new Worker('emails', async (job) => {
  console.log(`Processing ${job.name}`, job.data);
}, { baseUrl: 'http://localhost:8080' });

await worker.run();
```

The only change is the import path and connection options — your job processing logic stays the same.

## API Reference

### `Queue`

```typescript
new Queue(name: string, options: { baseUrl: string })
```

| Method | Description |
|--------|-------------|
| `add(name, data, opts?)` | Enqueue a single job. Supports `delay` (ms), `priority`, `attempts`. |
| `addBulk(jobs)` | Enqueue multiple jobs in a single batch. |
| `getJob(id)` | Retrieve a job by ID, or `undefined` if not found. |
| `close()` | No-op (HTTP client has no persistent connection). |

#### Options mapping

| BullMQ option | OJS equivalent |
|---------------|----------------|
| `delay` (ms) | `delay` (`"5000ms"`) |
| `priority` | `priority` |
| `attempts` | `retry.maxAttempts` |

### `Worker`

```typescript
new Worker(name: string, processor: (job) => Promise<unknown>, options: { baseUrl: string; concurrency?: number })
```

| Method | Description |
|--------|-------------|
| `run()` | Start polling for jobs. |
| `close()` | Gracefully stop the worker. |

The processor receives a BullMQ-compatible job object:

```typescript
{
  id: string;
  name: string;
  data: Record<string, unknown>;
  attemptsMade: number;
}
```

## Migration Guide

Use the migration helpers to convert existing BullMQ job definitions:

```typescript
import { migrateJobDefinition, migrateBulk } from '@openjobspec/bullmq';

// Single job
const ojsJob = migrateJobDefinition({
  name: 'send-email',
  queue: 'emails',
  data: { to: 'user@example.com' },
  opts: { delay: 5000, priority: 3, attempts: 5 },
});
// → { type: 'send-email', args: [{ to: 'user@example.com' }], options: { queue: 'emails', delay: '5000ms', priority: 3, retry: { maxAttempts: 5 } } }

// Bulk
const ojsJobs = migrateBulk([
  { name: 'job-a', queue: 'q1', data: { x: 1 } },
  { name: 'job-b', queue: 'q2', data: { y: 2 }, opts: { priority: 5 } },
]);
```

### Step-by-step migration

1. **Install the adapter**: `npm install @openjobspec/bullmq @openjobspec/sdk`
2. **Start an OJS server** (e.g., `ojs-backend-redis`): see `examples/docker-compose.yml`
3. **Update imports**: change `from 'bullmq'` to `from '@openjobspec/bullmq'`
4. **Update connection options**: replace `{ connection: { host, port } }` with `{ baseUrl: 'http://...' }`
5. **Keep your processor logic unchanged** — the job shape is the same

## Examples

See the [`examples/`](./examples/) directory for a complete runnable example comparing BullMQ and OJS adapter usage side by side.

## License

Apache-2.0
