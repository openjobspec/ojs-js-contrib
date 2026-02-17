# OJS NestJS Example

A complete NestJS application demonstrating `@openjobspec/nestjs` integration.

## Prerequisites

- Node.js 18+
- Docker & Docker Compose (for the OJS server)

## Setup

1. Start the OJS server and Redis:

```bash
docker compose up -d
```

2. Install dependencies:

```bash
npm install
```

3. Build and run:

```bash
npm run build
npm start
```

## What This Example Does

- **`app.module.ts`** — Configures `OjsModule.forRoot()` with the local OJS server URL
- **`jobs/email.job.ts`** — Defines an `email.send` job handler using `@OjsJob()` decorator
- **`main.ts`** — Bootstraps the NestJS application

## Architecture

```
┌─────────────────────┐       ┌──────────────┐       ┌───────────┐
│  NestJS App         │──────▶│  OJS Server  │──────▶│   Redis   │
│  (OjsModule)        │◀──────│  :8080       │◀──────│   :6379   │
└─────────────────────┘       └──────────────┘       └───────────┘
```

The NestJS app uses `OjsService.client` to enqueue jobs and `OjsService.worker` to process them, both communicating with the OJS server over HTTP.
