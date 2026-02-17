# @openjobspec/fastify

Fastify plugin for [OpenJobSpec](https://github.com/openjobspec/openjobspec) — a universal, language-agnostic standard for background job processing.

## Installation

```bash
npm install @openjobspec/fastify @openjobspec/sdk fastify fastify-plugin
```

## Quick Start

Register the plugin with your Fastify instance:

```typescript
import Fastify from 'fastify';
import { ojsPlugin } from '@openjobspec/fastify';

const app = Fastify({ logger: true });

await app.register(ojsPlugin, {
  url: 'http://localhost:8080',
});

app.post('/jobs', async (request, reply) => {
  const { type, args } = request.body as { type: string; args: unknown[] };
  const job = await app.ojs.enqueue(type, args);
  return reply.status(201).send(job);
});

await app.listen({ port: 3000 });
```

## Plugin Options

| Option | Type        | Required | Description                                      |
|--------|-------------|----------|--------------------------------------------------|
| `url`  | `string`    | Yes      | URL of the OJS-compliant server                  |
| `client` | `OJSClient` | No     | Pre-configured OJS client instance to use instead |

## Accessing the Client

Once registered, the OJS client is available on the Fastify instance as `fastify.ojs`:

```typescript
app.get('/jobs/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const job = await app.ojs.getJob(id);
  return job;
});

app.delete('/jobs/:id', async (request, reply) => {
  await app.ojs.cancelJob(id);
  return reply.status(204).send();
});
```

## Using a Custom Client

You can pass a pre-configured `OJSClient` instance:

```typescript
import { OJSClient } from '@openjobspec/sdk';

const client = new OJSClient({ url: 'http://localhost:8080' });

await app.register(ojsPlugin, {
  url: 'http://localhost:8080',
  client,
});
```

## License

Apache-2.0
