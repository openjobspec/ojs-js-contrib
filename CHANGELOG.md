# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-09-02

### Changed

- **Breaking:** all framework packages now target `@openjobspec/sdk ^0.5.0`
  and handle the SDK's nullable single-enqueue result explicitly.
- **Breaking:** the Next.js and Vercel adapters now require Next.js 16.3.4 or
  later; the NestJS adapter now requires NestJS 12 and Node.js 22.12 or later.
- **Breaking:** the Fastify adapter now requires Fastify 5.12.1 or later.
- **Breaking:** the Express adapter now requires Express 5.2.1 or later.
- Updated Fastify development compatibility and moved the
  workspace test toolchain to the secure Vitest 3.2 line.
- Aligned all eight publishable package versions to the coordinated 0.5.0
  release and added package-level publish dry runs.
- Pinned the coordinated SDK package fixture by SHA-256 and npm SHA-512
  integrity; cold-cache installs and package checks reject stale tarballs.

## [0.4.0] - 2026-04-20

All packages stabilized with comprehensive test suites and TypeScript strict mode.

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
