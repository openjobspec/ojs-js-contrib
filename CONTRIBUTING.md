# Contributing to OJS JavaScript Contrib

Thank you for your interest in contributing to the Open Job Spec JavaScript/TypeScript contrib packages!

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Build all packages: `npm run build`
4. Run tests: `npm test`

## Adding a New Integration

1. Create a new directory under `packages/` (e.g., `packages/ojs-hono/`)
2. Follow the structure of existing packages:
   - `src/` — Source code
   - `test/` — Unit tests (vitest)
   - `examples/` — Runnable example project with `docker-compose.yml`
   - `README.md` — Package documentation
3. Declare `@openjobspec/sdk` as a `peerDependency`
4. Use TypeScript strict mode and ESM
5. Export types for downstream consumers

## Package Naming

All packages use the `@openjobspec/{framework}` naming convention.

## Code Style

- TypeScript with strict mode enabled
- ESM modules
- No default exports — use named exports
- Tests use vitest

## Pull Requests

- One integration per PR when possible
- Include tests for new functionality
- Update the root README.md status table
- Ensure `npm test` passes for all packages

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
