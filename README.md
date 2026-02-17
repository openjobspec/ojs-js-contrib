# Open Job Spec — JavaScript/TypeScript Contrib

Community framework integrations for the [OJS JavaScript SDK](https://github.com/openjobspec/ojs-js-sdk).

## Provided Integrations

| Status | Integration | Description |
|--------|-------------|-------------|
| alpha  | [Express](./packages/ojs-express/README.md) | Express.js middleware with request-scoped OJS client |
| alpha  | [NestJS](./packages/ojs-nestjs/README.md) | NestJS module with dependency injection and `@OjsJob()` decorator |
| alpha  | [Next.js](./packages/ojs-nextjs/README.md) | Next.js Server Actions and Route Handler helpers |
| alpha  | [Fastify](./packages/ojs-fastify/README.md) | Fastify plugin with decorator-based client access |
| alpha  | [BullMQ](./packages/ojs-bullmq/README.md) | BullMQ-compatible API adapter for seamless migration |

Status definitions: `alpha` (API may change), `beta` (API stable, not battle-tested), `stable` (production-ready).

## Getting Started

Each package is published under the `@openjobspec` scope and declares `@openjobspec/sdk` as a peer dependency.

```bash
# Example: install the Express integration
npm install @openjobspec/express @openjobspec/sdk
```

## Development

```bash
# Install all dependencies
npm install

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
