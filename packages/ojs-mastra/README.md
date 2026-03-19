# @openjobspec/mastra

Mastra adapter for [OpenJobSpec](https://openjobspec.org) — wraps Mastra workflows and agents as durable OJS jobs with retry, attestation, and observability.

## Installation

```bash
npm install @openjobspec/mastra @openjobspec/sdk
```

## Quick Start

```typescript
import { MastraAdapter } from '@openjobspec/mastra';

const adapter = new MastraAdapter({
  serverUrl: 'http://localhost:8080',
  defaultQueue: 'mastra',
});

// Wrap a Mastra workflow
const durableWorkflow = adapter.wrapWorkflow(myWorkflow);

// Enqueue as a durable OJS job
const { jobId } = await durableWorkflow.enqueue({ prompt: 'Hello' });

// Register worker handler
worker.register(durableWorkflow.jobType, durableWorkflow.handler());
```

## Wrapping Agents

```typescript
const durableAgent = adapter.wrapAgent(myAgent);

const { jobId } = await durableAgent.enqueue({
  messages: [{ role: 'user', content: 'Summarize this document' }],
});
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `serverUrl` | `process.env.OJS_URL` or `http://localhost:8080` | OJS server URL |
| `defaultQueue` | `"mastra"` | Default queue for Mastra jobs |
| `retry` | `undefined` | Default retry policy |
| `attestation` | `false` | Enable attestation for all jobs |

## License

Apache-2.0
