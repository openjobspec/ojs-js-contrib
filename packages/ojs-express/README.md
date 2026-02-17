# @openjobspec/express

Express.js middleware for [OpenJobSpec](https://github.com/openjobspec/openjobspec) — attach an OJS client to every request and handle job-related errors automatically.

## Installation

```bash
npm install @openjobspec/express @openjobspec/sdk express
```

## Quick Start

```typescript
import express from 'express';
import { ojsMiddleware, ojsErrorHandler } from '@openjobspec/express';
import type { OjsRequest } from '@openjobspec/express';

const app = express();
app.use(express.json());

// Attach OJS client to every request
app.use(ojsMiddleware({ url: 'http://localhost:8080' }));

// Enqueue jobs from any route
app.post('/send-email', async (req, res) => {
  const { to, subject, body } = req.body;
  const job = await (req as OjsRequest).ojs.enqueue('email.send', [to, subject, body], {
    queue: 'emails',
  });
  res.json({ jobId: job.id });
});

// Handle OJS errors
app.use(ojsErrorHandler({
  onError: (err) => console.error('OJS error:', err),
}));

app.listen(3000);
```

## API

### `ojsMiddleware(options)`

Creates Express middleware that attaches an `OJSClient` instance to `req.ojs`.

**Options:**

| Option    | Type        | Required | Description                                   |
|-----------|-------------|----------|-----------------------------------------------|
| `url`     | `string`    | Yes      | URL of the OJS server                         |
| `client`  | `OJSClient` | No       | Pre-configured client instance (overrides url)     |
| `onError` | `function`  | No       | Error callback for middleware initialization  |

### `ojsErrorHandler(options?)`

Express error-handling middleware that catches OJS-specific errors (`OJSError`, `OJSValidationError`) and returns a structured JSON response.

**Options:**

| Option    | Type       | Required | Description                        |
|-----------|------------|----------|------------------------------------|
| `onError` | `function` | No       | Callback invoked with the error    |

**Error response format:**

```json
{
  "error": "Job processing error",
  "message": "..."
}
```

Non-OJS errors are passed to the next error handler via `next(err)`.

### `createOjsClient(options)`

Standalone helper to create an `OJSClient` without using middleware.

```typescript
import { createOjsClient } from '@openjobspec/express';

const client = createOjsClient({ url: 'http://localhost:8080' });
const job = await client.enqueue('my.job', ['arg1']);
```

### `OjsRequest`

Extended Express `Request` type with the `ojs` property:

```typescript
import type { OjsRequest } from '@openjobspec/express';

app.get('/jobs/:id', async (req, res) => {
  const job = await (req as OjsRequest).ojs.getJob(req.params.id);
  res.json(job);
});
```

## License

Apache-2.0
