# Open Job Spec — JavaScript/TypeScript Contrib
[![Stability: beta](https://img.shields.io/badge/stability-beta-yellow.svg)](https://openjobspec.org/governance/stability/)

Community framework integrations for the [OJS JavaScript SDK](https://github.com/openjobspec/ojs-js-sdk).

## Provided Integrations

| Status | Integration | Description |
|--------|-------------|-------------|
| alpha  | [Express](./packages/ojs-express/README.md) | Express.js middleware with request-scoped OJS client |
| alpha  | [NestJS](./packages/ojs-nestjs/README.md) | NestJS module with dependency injection and `@OjsJob()` decorator |
| alpha  | [Next.js](./packages/ojs-nextjs/README.md) | Next.js Server Actions and Route Handler helpers |
| alpha  | [Fastify](./packages/ojs-fastify/README.md) | Fastify plugin with decorator-based client access |
| alpha  | [Cloudflare Workers](./packages/ojs-cloudflare/README.md) | Cloudflare Workers adapter with Queue consumer and Durable Objects |
| alpha  | [Vercel](./packages/ojs-vercel/README.md) | Vercel Edge/Serverless adapter with KV caching |
| alpha  | [BullMQ](./packages/ojs-bullmq/README.md) | BullMQ-compatible API adapter for seamless migration |
| alpha  | [Mastra](./packages/ojs-mastra/README.md) | Durable Mastra workflow and agent integration |

Status definitions: `alpha` (API may change), `beta` (API stable, not battle-tested), `stable` (production-ready).

## Getting Started

Each package is published under the `@openjobspec` scope and declares `@openjobspec/sdk` as a peer dependency.

The 0.5 release requires `@openjobspec/sdk ^0.5.0`. Express requires Express
5.2.1+, Next.js and Vercel require Next.js 16.3.4+, Fastify requires Fastify
5.12.1+, and NestJS requires NestJS 12 with Node.js 22.12+.

```bash
# Example: install the Express integration
npm install @openjobspec/express @openjobspec/sdk
```

## Development

```bash
# Install all locked dependencies
npm ci

# Build all packages
npm run build

# Run all tests
npm test

# Lint
npm run lint
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

[Apache 2.0](./LICENSE)
