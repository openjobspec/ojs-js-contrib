# @openjobspec/bullmq Examples

Complete runnable examples comparing BullMQ and the OJS BullMQ adapter.

## Prerequisites

- Docker and Docker Compose
- Node.js 18+

## Setup

```bash
# Start Redis and OJS server
docker compose up -d

# Install dependencies
npm install
```

## Running

```bash
# Start the worker (in one terminal)
npm run worker

# Enqueue jobs (in another terminal)
npm run after
```

## Files

| File | Description |
|------|-------------|
| `before.ts` | Original BullMQ code (reference only, not runnable) |
| `after.ts` | Same app using the OJS BullMQ adapter (producer) |
| `worker.ts` | Worker process using the OJS BullMQ adapter |
| `docker-compose.yml` | Redis + OJS server stack |

## Cleanup

```bash
docker compose down
```

