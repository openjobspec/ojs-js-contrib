# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0] - 2026-02-20

Release candidate for v1.0. All packages stabilized with comprehensive test suites and TypeScript strict mode.

### Added

- Comprehensive Vitest test suites for all packages
- TypeScript strict mode enforced across all packages via `tsconfig.base.json`

### Stabilized

- `@openjobspec/express` — Express.js middleware with request-scoped OJS client and worker manager
- `@openjobspec/nestjs` — NestJS module with dependency injection and `@OjsJob()` decorator
- `@openjobspec/nextjs` — Next.js Server Actions, Route Handler helpers, and `useJobStatus` client hook
- `@openjobspec/fastify` — Fastify plugin with decorator-based client access
- `@openjobspec/cloudflare` — Cloudflare Workers adapter with Queue consumer, KV caching, and Durable Objects unique jobs
- `@openjobspec/vercel` — Vercel Edge/Serverless adapter with API route handlers, KV caching, and enqueue helper
- `@openjobspec/bullmq` — BullMQ-compatible API adapter for seamless migration
