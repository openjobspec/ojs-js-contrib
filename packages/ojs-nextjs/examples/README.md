# Next.js + OpenJobSpec Example

A minimal Next.js App Router example demonstrating how to enqueue and track background jobs using OpenJobSpec.

## Prerequisites

- Docker and Docker Compose
- Node.js 18+

## Getting Started

### 1. Start the OJS Server

```bash
docker compose up -d
```

This starts a Redis instance and an OJS-compliant server at `http://localhost:8080`.

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## How It Works

- **Server Action** (`app/page.tsx`): A form submission triggers a Server Action that enqueues a job via `enqueueJob()`.
- **Route Handler** (`app/api/jobs/route.ts`): A REST API endpoint that enqueues jobs and retrieves job status.
- **Client Hook** (`app/page.tsx`): The `useJobStatus` hook polls the API endpoint to display real-time job status.

## Architecture

```
Browser → Server Action → enqueueJob() → OJS Server → Redis
Browser → useJobStatus() → /api/jobs/:id → getJob() → OJS Server
```

## License

Apache-2.0
