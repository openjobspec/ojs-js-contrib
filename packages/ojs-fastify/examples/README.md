# @openjobspec/fastify Example

A complete example showing how to use the `@openjobspec/fastify` plugin with a Fastify server and an OJS worker.

## Prerequisites

- Node.js 18+
- Docker & Docker Compose

## Setup

1. Start the OJS backend and Redis:

```bash
docker compose up -d
```

2. Install dependencies:

```bash
npm install
```

## Running

Start the Fastify API server:

```bash
npm run server
```

In a separate terminal, start the worker:

```bash
npm run worker
```

## Usage

Enqueue a job:

```bash
curl -X POST http://localhost:3000/jobs \
  -H 'Content-Type: application/json' \
  -d '{"type": "email.send", "args": [{"to": "user@example.com", "subject": "Hello"}]}'
```

Get a job by ID:

```bash
curl http://localhost:3000/jobs/<job-id>
```

Cancel a job:

```bash
curl -X DELETE http://localhost:3000/jobs/<job-id>
```

## Cleanup

```bash
docker compose down
```
