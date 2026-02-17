# @openjobspec/express Examples

A complete example showing Express.js integration with OpenJobSpec.

## Prerequisites

- Node.js 18+
- Docker and Docker Compose

## Setup

1. Start the OJS backend:

```bash
docker compose up -d
```

2. Install dependencies:

```bash
npm install
```

3. Start the Express server:

```bash
npm run server
```

4. In another terminal, start the worker:

```bash
npm run worker
```

## Usage

Enqueue a job:

```bash
curl -X POST http://localhost:3000/jobs \
  -H 'Content-Type: application/json' \
  -d '{"type": "email.send", "args": ["user@example.com", "Hello", "World"]}'
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
