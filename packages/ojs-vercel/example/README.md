# @openjobspec/vercel Example

Complete runnable example showing push-based job processing with the OJS Vercel adapter using Next.js-style API routes.

## Prerequisites

- Node.js 18+
- [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`)
- An OJS-compatible server (e.g. `ojs-backend-redis`)

## Setup

```bash
# Start an OJS server (Redis backend + Redis)
docker compose -f ../../../../docker-compose.quickstart.yml up -d

# Install dependencies
npm install
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OJS_URL` | `http://localhost:8080` | Base URL of the OJS server |

For production, set environment variables in the Vercel dashboard or via the CLI:

```bash
vercel env add OJS_URL
```

## Running locally

```bash
# Start the Vercel dev server
npm run dev
# → Listening on http://localhost:3000

# Enqueue a sample job (in another terminal)
curl http://localhost:3000/api/enqueue

# Enqueue a custom job
curl -X POST http://localhost:3000/api/enqueue \
  -H 'content-type: application/json' \
  -d '{"type":"report.generate","args":["monthly","2024-06"]}'
```

## Deploying

```bash
# Deploy to Vercel
npm run deploy
```

After deploying, configure your OJS server to deliver jobs to `https://<your-app>.vercel.app/api/worker` via HTTP push.

## Files

| File | Description |
|------|-------------|
| `api/enqueue.ts` | `GET`/`POST` route — enqueue jobs via the OJS server |
| `api/worker.ts` | `POST` route — push delivery endpoint for the OJS server |
| `vercel.json` | Vercel Cron configuration (polls `/api/worker` every minute) |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |

## Architecture

```
┌──────────┐  GET/POST /api/enqueue  ┌──────────────────┐  POST /api/v1/jobs  ┌──────────────┐
│  Client  │ ──────────────────────► │  Vercel Function  │ ──────────────────► │  OJS Server  │
└──────────┘                         │  (enqueue.ts)     │                     │  (Redis)     │
                                     └──────────────────┘                     └──────┬───────┘
                                                                                     │
                                                                          push delivery
                                                                           POST /api/worker
                                                                                     │
                                                                                     ▼
                                                                              ┌──────────────────┐
                                              Vercel Cron (every 1 min) ────► │  Vercel Function  │
                                              GET /api/worker                 │  (worker.ts)      │
                                                                              └──────────────────┘
```

1. **Enqueue** — `api/enqueue.ts` forwards job requests to the OJS server's REST API.
2. **Deliver** — The OJS server pushes jobs to `api/worker.ts` via `POST`.
3. **Process** — The adapter routes each job to the matching handler (`email.send`, `report.generate`).
4. **Cron** (optional) — Vercel Cron hits `GET /api/worker` every minute for poll-based processing.
