# Clean-Code / SRP Quality Audit — `@openjobspec/js-contrib`

Branch: `refactor/clean-code-srp` · Scope: `packages/*` (8 framework adapters) · Reviewed: all `src/` + all `test/` files, manifests, lockfile, TS configs, CI.

## Summary

- **Baseline is red for structural, environmental reasons, not product defects.** The declared dependency `@openjobspec/sdk@^0.2.0` is **not published to any registry** (npm returns `E404` for *every* version), and `package-lock.json` pins it as a workspace `link` to a **non-existent** path `packages/ojs-js-sdk`. A clean `npm ci` therefore fails; `build`/`lint` additionally fail because the environment has the *wrong* SDK (a `0.4.0` sibling symlinked in, outside the `^0.2.0` range) whose API drifted (`enqueue()` now returns `Job | null`, `OJSClient.url` removed). Per the task contract these drift errors must **not** be "fixed" by adapting to `0.4.0`, and no published compatible version exists to repair toward — so the clean-install/build/lint gates are **blocked**, and the runtime test suite (`vitest`, which strips types and runs against the sibling) is the usable gate: **333 pass / 1 fail** at baseline.
- **Highest-leverage split:** extract a single **route error-boundary** (`withRouteErrorHandling`) in `ojs-nextjs/src/routes.ts`, collapsing three near-identical `try/catch → 500` blocks across `GET`/`POST`/`DELETE` into one tested unit — it is the most-duplicated code on the request-critical path and is already fully characterized by `routes.test.ts` (500/404/400/401/201/200).
- **Genuine, framework-independent defects were found and fixed with tests:** a **dangling `setTimeout` timer leak** in the Next.js serverless job processor (`Promise.race` never cleared the timeout — bad for serverless suspension), **dead code that breaks the build** (`ojs-nestjs` unused DI `Reflector` + 4 unused imports; `ojs-express` unused `client` field that also constructs a needless `OJSClient`), a **dead `? 200 : 200` ternary** in the Vercel handler, a **broken characterization test** asserting `useJobStatus.length === 3` (always false — the 3rd param has a default), and a **Node 18 runtime crash** in the Next.js middleware (`crypto.randomUUID()` on the missing Web Crypto global).
- **SRP/DRY consolidations were applied only within a single actor/lifecycle:** Vercel `apiRoute`/`edge` handlers, the Express workflow router (now reuses `buildWorkflowHelpers`), and the Mastra `wrapWorkflow`/`wrapAgent` enqueue body. **No cross-framework deduplication** was performed — Express vs Fastify `OjsWorkerManager`, and each adapter's `OJSClient` wiring, own distinct request/worker lifecycles and were deliberately left separate.
- **Public surface preserved:** all package names, versions, `exports` maps, adapter class/function signatures, routes, config keys, wire/serialization behavior, and framework plugin metadata are unchanged. The only additive export is `isTerminalState` (`@openjobspec/nextjs/client`), added to make a previously untestable private constant testable. No dependency bumps, no lockfile regeneration, no generated-code edits, no format sweeps.

## Findings

> **Release-readiness follow-up (2026-09-02):** F0 is resolved for the
> coordinated 0.5 release. The root, lockfile, and eight publishable workspaces
> are `0.5.0`; SDK peer ranges and examples target `^0.5.0`; and the private
> workspace installs a checked packed SDK 0.5.0 fixture from `vendor/` until the
> coordinated SDK package reaches npm. Framework test dependencies were moved
> to secure releases (Next.js 16.3.4, NestJS 12, Fastify 5.12, Vitest 3.2.7).
> Clean install, build, 348 tests, package lint, package dry runs, and the high
> severity audit now pass.

| ID | Location | Category | Severity | Actor(s) | Cost | Size | Risk |
|----|----------|----------|----------|----------|------|------|------|
| F0 | `package-lock.json` (sdk `link`→`packages/ojs-js-sdk`), all `packages/*/package.json` (`@openjobspec/sdk ^0.2.0`), root `package.json` v`0.4.0` vs lock v`0.9.0` | Dependency / build integrity | P0 (blocked) | Repo install contract | — | — | — |
| F1 | `ojs-nextjs/src/worker.ts` `createJobProcessor.handler` | Resource leak | P1 | Next.js serverless request | S | ~6 | Low |
| F2 | `ojs-nestjs/src/ojs.service.ts` (unused `DiscoveryService`/`MetadataScanner`/`Reflector`/`OJS_JOB_METADATA`/`OjsJobOptions` + injected `reflector`) | Dead code (breaks build) | P1 | NestJS DI/service | S | ~7 | Low |
| F3 | `ojs-express/src/worker.ts` (`private client` field) | Dead code + needless resource (breaks build) | P1 | Express worker manager | S | ~3 | Low |
| F4 | `ojs-nextjs/src/routes.ts` `GET`/`POST`/`DELETE` | SRP/DRY (triple `try/catch→500`) | P2 | Next.js route handler | M | ~-25 | Low |
| F5 | `ojs-express/src/workflow.ts` `createWorkflowRouter` | SRP/DRY (chain/group/batch inline dup; router re-implements `buildWorkflowHelpers`) | P2 | Express workflow router | M | ~-35 | Low |
| F6 | `ojs-vercel/src/index.ts` `jsonResponse(... ? 200 : 200 ...)` | Dead code / magic value | P2 | Vercel handler | S | ~-1 | Low |
| F7 | `ojs-vercel/src/index.ts` `apiRouteHandler`/`edgeHandler` + `ojsApiRoute`/`ojsEdgeHandler` | SRP/DRY (near-verbatim dup, same actor) | P2 | Vercel handler | M | ~-30 | Low |
| F8 | `ojs-mastra/src/index.ts` `wrapWorkflow`/`wrapAgent` | DRY (identical `enqueue` fetch body, same actor) | P2 | Mastra adapter | M | ~-20 | Low |
| F9 | `ojs-nextjs/test/server.test.ts` + `ojs-nextjs/src/client.ts` | Broken test / untestable private const | P2 | Next.js client hook | S | ~+8 | Low |
| F10 | `ojs-nextjs/src/middleware.ts` `createOjsMiddleware` (`crypto.randomUUID()`) | Cross-runtime correctness (crashes on Node 18) | P1 | Next.js Edge middleware | S | ~+15 | Low |

## Ordered implementation sequence

1. **F2, F3** — remove build-breaking dead code first (independent, shrinks the error surface so drift is isolated).
2. **F1** — timer-leak fix + characterization test (correctness/resource, uncovered path).
3. **F4** — Next.js route error boundary (highest-leverage split; fully covered).
4. **F5** — Express workflow router dedup via `buildWorkflowHelpers` (covered).
5. **F6, F7** — Vercel dead-ternary removal + handler/factory unification (covered).
6. **F8** — Mastra enqueue dedup + new characterization tests (uncovered).
7. **F9** — export `isTerminalState`, rewrite the broken arity test to verify the terminal-state contract.
8. **F10** — make the Next.js middleware request-id generation resilient to bare Node 18 (feature-detect the Web Crypto global, self-contained UUIDv4 fallback, no `node:crypto` import so the Edge bundle boundary is preserved).
9. **Validate** — full `vitest` run + per-package `tsc`, confirm no regressions vs the 333-pass baseline, document blocked gates.

## Out of scope (not addressed here)

- **SDK `0.4.0` API drift** (`enqueue()` → `Job | null` at `ojs-bullmq/adapter.ts:81`, `ojs-fastify/request-context.ts:76`, `ojs-nestjs/ojs-workflow.service.ts:68,157`, `ojs-nextjs/routes.ts:214` & `server.ts:61`; `OJSClient.url` reads; `ojs-cloudflare/index.ts:127` `MessageBatch<unknown>` from a newer `@cloudflare/workers-types`). Fixing these would mean coding to the wrong (out-of-range, unpublished-declared) SDK version — explicitly forbidden.
- **Missing `@types/react` devDependency** in `ojs-nextjs` and the `res.json(): unknown → JobStatus` cast in `client.ts` — a real declared-manifest gap, but its resolution + lockfile regeneration is **blocked** by the unavailable SDK registry entry (any install fails at `@openjobspec/sdk` `E404`).
- **Root `lint` over-breadth** (`tsc --noEmit --project tsconfig.base.json` has no `include`/`exclude`, so it type-checks `examples/**` JSX and `test/**`, producing most lint errors) — a build-config decision, left unchanged to avoid weakening the declared lint contract.
- Adding a `test` script / `vitest` config to `ojs-mastra/package.json` (new Mastra tests are picked up by the root `vitest.workspace.ts` glob without touching its manifest).

## Deferred (needs a product / contract / environment decision)

- **F0 repair** — republishing `@openjobspec/sdk` (or correcting the declared range to a *published* version) and regenerating `package-lock.json` (removing the `link → packages/ojs-js-sdk` phantom, reconciling root `0.4.0`/`0.9.0`). Requires registry access + a version-policy decision; not a code change.
- `ojs-cloudflare` queue-handler type (`MessageBatch<unknown>`) — compatible fix requires widening a public method signature driven by a types-package bump; deferred to a dependency-policy decision.
- `ojs-bullmq/src/queue-migration.ts` `migrateQueue` (~100-line cohesive function) — long but single-purpose; splitting risks over-extraction with no behavioral win. Left as-is.

## Validation results

Branch `refactor/clean-code-srp`, left unstaged. Zero dependency-manifest or lockfile edits.

**Runtime test suite (`vitest run`) — the usable canonical gate:**

| Runtime | Baseline | After |
|---------|----------|-------|
| Node 22 | 333 pass / **1 fail** (334) | **348 pass / 0 fail** (23 files) |
| Node 20 | 333 / 1 fail | **348 / 0 fail** |
| Node 18 | 328 / **6 fail** (5× `crypto` + 1 arity) | **348 / 0 fail** |

Net **+14 tests** (2 for the timer-leak fix in `ojs-nextjs/worker.test.ts`; 12 new characterization tests in `ojs-mastra/test/adapter.test.ts`) plus the 1 rewritten terminal-state test and the F10 fix that clears the 5 Node-18 middleware failures.

**Per-package `tsc` (build/typecheck):** `ojs-express`, `ojs-mastra`, `ojs-vercel` now build **fully green**; the 6 genuine build-blocking errors (Express unused `client`, NestJS 5 unused symbols) are gone with **no new errors introduced**. Remaining `tsc` failures are exclusively **out-of-scope SDK-0.4.0 drift** and the missing `@types/react` (see Out of scope). Built `dist` for the green packages verified via an ESM exports smoke test: `OjsVercelHandler`/`ojsApiRoute`/`ojsEdgeHandler`, all 12 Express exports, and `MastraAdapter` load and behave correctly; `dist` contains no test files.

**Blocked / red gates (environmental, unchanged by this work):**
- `npm ci` — **blocked**: `@openjobspec/sdk` is unpublished (`E404`); the lockfile also links it to a phantom `packages/ojs-js-sdk`.
- `npm run build` / `npm run lint` — **red**, solely from SDK-0.4.0 drift, the missing `@types/react`, and the root lint's over-breadth + missing `experimentalDecorators` (it scans `examples/**` JSX, `test/**`, and NestJS decorator code). Root-lint error count nonetheless dropped **191 → 188**.
- `npm audit --audit-level=high` — **red** at baseline from pre-existing dev-dependency advisories (`bullmq`→`uuid`, etc.); untouched (no dependency changes).
