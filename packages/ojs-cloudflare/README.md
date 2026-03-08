# @openjobspec/cloudflare

Cloudflare Workers adapter for [OpenJobSpec](https://github.com/openjobspec/openjobspec) -- handles push delivery via fetch events, Cloudflare Queue consumers, KV-based job state caching, and Durable Objects for unique job enforcement.

## Installation

```bash
npm install @openjobspec/cloudflare @openjobspec/sdk
```

## Quick Start

### Basic Worker

```typescript
import { OjsCloudflareWorker } from '@openjobspec/cloudflare';

const ojs = new OjsCloudflareWorker();

ojs.register('email.send', async (job) => {
  const [to, subject, body] = job.args;
  await sendEmail(to as string, subject as string, body as string);
});

ojs.register('report.generate', async (job) => {
  const [reportId] = job.args;
  await generateReport(reportId as string);
});

export default ojs.asWorker();
```

### Push Delivery via HTTP

The OJS server pushes jobs to your Cloudflare Worker via HTTP POST. The worker handles the `fetch` event automatically:

```typescript
// wrangler.toml
// name = "ojs-worker"
// main = "src/index.ts"

import { OjsCloudflareWorker } from '@openjobspec/cloudflare';

const ojs = new OjsCloudflareWorker({
  ojsUrl: 'https://ojs.example.com',
});

ojs.register('email.send', async (job, ctx) => {
  console.log(`Processing job ${job.id} (attempt ${job.attempt})`);
  const [to] = job.args;
  // Send email...
});

export default ojs.asWorker();
```

### Cloudflare Queue Consumer

Process jobs from a Cloudflare Queue:

```toml
# wrangler.toml
[[queues.consumers]]
queue = "ojs-jobs"
max_batch_size = 10
max_retries = 3
```

```typescript
import { OjsCloudflareWorker } from '@openjobspec/cloudflare';

const ojs = new OjsCloudflareWorker();

ojs.register('data.import', async (job) => {
  const [fileUrl] = job.args;
  await importData(fileUrl as string);
});

// Handles both fetch (HTTP push) and queue (Cloudflare Queue) events
export default ojs.asWorker();
```

### KV-based Job State Caching

Enable job state caching via Cloudflare KV:

```toml
# wrangler.toml
[[kv_namespaces]]
binding = "OJS_KV"
id = "your-kv-namespace-id"
```

```typescript
import { OjsCloudflareWorker } from '@openjobspec/cloudflare';
import type { OjsEnv } from '@openjobspec/cloudflare';

const ojs = new OjsCloudflareWorker({
  kvTtlSeconds: 7200, // Cache for 2 hours
});

ojs.register('email.send', async (job, ctx) => {
  // Job state is automatically cached to KV after completion/failure
  await sendEmail(job.args[0] as string);
});

export default ojs.asWorker();
```

### Unique Jobs via Durable Objects

Enforce unique job processing using Durable Objects:

```toml
# wrangler.toml
[durable_objects]
bindings = [{ name = "OJS_UNIQUE_JOBS", class_name = "OjsUniqueJobDO" }]

[[migrations]]
tag = "v1"
new_classes = ["OjsUniqueJobDO"]
```

```typescript
import { OjsCloudflareWorker, OjsUniqueJobDO } from '@openjobspec/cloudflare';

const ojs = new OjsCloudflareWorker();
ojs.register('payment.process', async (job) => {
  // Only one instance of this job type+ID will be processed at a time
  await processPayment(job.args[0] as string);
});

export default ojs.asWorker();

// Export the Durable Object class
export { OjsUniqueJobDO };
```

### Default Handler

Register a fallback handler for unregistered job types:

```typescript
const ojs = new OjsCloudflareWorker();

ojs.registerDefault(async (job, ctx) => {
  console.warn(`No handler for job type: ${job.type}`);
  // Log to external service, dead-letter queue, etc.
});

export default ojs.asWorker();
```

## Configuration

### `OjsWorkerConfig`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ojsUrl` | `string` | `env.OJS_URL` | OJS server URL for callbacks |
| `kvTtlSeconds` | `number` | `3600` | TTL for KV-cached job state |
| `logger` | `Console`-like | `console` | Logger implementation |

### Environment Bindings (`OjsEnv`)

| Binding | Type | Description |
|---------|------|-------------|
| `OJS_URL` | `string` | OJS server URL (fallback for config) |
| `OJS_KV` | `KVNamespace` | KV namespace for state caching |
| `OJS_UNIQUE_JOBS` | `DurableObjectNamespace` | Durable Object for unique jobs |

## API Reference

### `OjsCloudflareWorker`

| Method | Description |
|--------|-------------|
| `register(jobType, handler)` | Register a handler for a job type |
| `registerDefault(handler)` | Register a fallback handler |
| `asWorker()` | Return a Cloudflare Worker module export (`fetch` + `queue`) |
| `handleFetch(request, env, ctx)` | Handle an HTTP push delivery request |
| `handleQueue(batch, env, ctx)` | Handle a Cloudflare Queue batch |
| `processJobDirect(job, env?)` | Process a job directly (useful for testing) |

### `OjsUniqueJobDO`

Durable Object class for unique job enforcement. Bind in `wrangler.toml` and export from your worker module.

### Types

- `JobEvent` -- Job payload received by handlers
- `JobContext` -- Context with execution info, KV access, and trigger source
- `PushDeliveryRequest` / `PushDeliveryResponse` -- HTTP push protocol types

## License

Apache-2.0

