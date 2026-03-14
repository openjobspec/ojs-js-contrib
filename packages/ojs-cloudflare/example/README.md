# @openjobspec/cloudflare Example

Complete runnable example showing push-based job processing with the OJS Cloudflare Workers adapter.

## Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm i -g wrangler`)
- An OJS-compatible server (e.g. `ojs-backend-redis`)

## Setup

```bash
# Start an OJS server (Redis backend + Redis)
docker compose -f ../../../../docker-compose.quickstart.yml up -d

# Install dependencies
npm install
```

## Running locally

```bash
# Start the Cloudflare Worker dev server
npm run dev
# → Listening on http://localhost:8787

# Enqueue a sample job (in another terminal)
curl http://localhost:8787/enqueue
curl "http://localhost:8787/enqueue?type=image.resize"
```

## Deploying

```bash
# Authenticate with Cloudflare (first time only)
wrangler login

# Set the OJS server URL secret
wrangler secret put OJS_URL

# Deploy
npm run deploy
```

After deploying, configure your OJS server to deliver jobs to the Worker URL via HTTP push.

## Files

| File | Description |
|------|-------------|
| `src/index.ts` | Worker entry point — registers job handlers, exposes enqueue + push delivery routes |
| `wrangler.toml` | Wrangler configuration (worker name, env vars) |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |

## Architecture

```
┌──────────────┐  POST /api/v1/jobs  ┌──────────────┐  push delivery  ┌────────────────────┐
│   Client /   │ ──────────────────► │  OJS Server  │ ──────────────► │  Cloudflare Worker  │
│   curl       │                     │  (Redis)     │  POST /         │  (this example)     │
└──────────────┘                     └──────────────┘                 └────────────────────┘
        │                                                                      │
        │  GET /enqueue                                                        │
        └──────────────────────────────────────────────────────────────────────►│
                                                                  enqueues via OJS API
```

1. **Enqueue** — `GET /enqueue` sends a job to the OJS server's REST API.
2. **Deliver** — The OJS server pushes the job to the Worker via `POST /`.
3. **Process** — The adapter routes the job to the registered handler (`email.send`, `image.resize`, or the default handler).
