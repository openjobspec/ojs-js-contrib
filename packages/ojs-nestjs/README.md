# @openjobspec/nestjs

NestJS module for [OpenJobSpec](https://github.com/openjobspec/openjobspec) — a universal, language-agnostic standard for background job processing.

## Installation

```bash
npm install @openjobspec/nestjs @openjobspec/sdk
```

## Quick Start

### Module Setup

Import `OjsModule` in your root module using `forRoot()`:

```typescript
import { Module } from '@nestjs/common';
import { OjsModule } from '@openjobspec/nestjs';

@Module({
  imports: [
    OjsModule.forRoot({
      baseUrl: 'http://localhost:8080',
      queues: ['default', 'emails'],
      isGlobal: true, // makes OjsService available everywhere
    }),
  ],
})
export class AppModule {}
```

### Async Configuration

Use `forRootAsync()` when you need to inject a config service:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OjsModule } from '@openjobspec/nestjs';

@Module({
  imports: [
    ConfigModule.forRoot(),
    OjsModule.forRootAsync({
      imports: [ConfigModule],
      isGlobal: true,
      useFactory: (config: ConfigService) => ({
        baseUrl: config.get<string>('OJS_URL', 'http://localhost:8080'),
        queues: ['default', 'emails'],
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Enqueuing Jobs

Inject `OjsService` to enqueue jobs:

```typescript
import { Injectable } from '@nestjs/common';
import { OjsService } from '@openjobspec/nestjs';

@Injectable()
export class EmailService {
  constructor(private readonly ojs: OjsService) {}

  async sendWelcomeEmail(userId: string) {
    await this.ojs.client.enqueue('email.welcome', [userId], {
      queue: 'emails',
    });
  }
}
```

### Defining Job Handlers

Use the `@OjsJob()` decorator to mark methods as job handlers:

```typescript
import { Injectable } from '@nestjs/common';
import { OjsJob } from '@openjobspec/nestjs';

@Injectable()
export class EmailJobHandler {
  @OjsJob('email.welcome')
  async handleWelcomeEmail(ctx: { job: { args: string[] } }) {
    const [userId] = ctx.job.args;
    // send the email...
  }

  @OjsJob({ type: 'email.digest', queue: 'emails' })
  async handleDigestEmail(ctx: { job: { args: string[] } }) {
    // send digest email...
  }
}
```

### Direct Client & Worker Access

`OjsService` exposes the underlying `OJSClient` and `OJSWorker`:

```typescript
// Get a job by ID
const job = await ojs.client.getJob('job-id');

// Cancel a job
await ojs.client.cancelJob('job-id');

// Register a handler directly on the worker
ojs.worker.register('my.job', async (ctx) => {
  console.log('Processing:', ctx.job.id);
});
```

## API Reference

### OjsModule

| Method | Description |
|--------|-------------|
| `forRoot(options)` | Synchronous module registration |
| `forRootAsync(options)` | Async module registration with factory |

### OjsModuleOptions

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `baseUrl` | `string` | Yes | OJS server URL |
| `queues` | `string[]` | No | Queues to consume (default: `['default']`) |
| `isGlobal` | `boolean` | No | Register module globally |

### OjsService

| Property/Method | Description |
|-----------------|-------------|
| `client` | `OJSClient` instance for enqueuing/managing jobs |
| `worker` | `OJSWorker` instance for processing jobs |

### @OjsJob(type) / @OjsJob(options)

Decorator to mark a method as a job handler.

- `type: string` — Job type to handle
- `options: { type: string, queue?: string }` — Job type with optional queue

## License

Apache-2.0
