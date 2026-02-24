export { OjsModule } from './ojs.module.js';
export { OjsService } from './ojs.service.js';
export { OjsJob } from './ojs.decorator.js';
export type { OjsJobOptions } from './ojs.decorator.js';
export type { OjsModuleOptions, OjsModuleAsyncOptions } from './ojs.interfaces.js';
export { OJS_MODULE_OPTIONS, OJS_JOB_METADATA } from './ojs.interfaces.js';

import { Inject } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';
import { OJS_MODULE_OPTIONS, OJS_JOB_METADATA } from './ojs.interfaces.js';

// ─── Convenience Aliases ─────────────────────────────────────────────────────

/** Alias for OjsModule for projects preferring OJS-prefixed naming. */
export { OjsModule as OJSModule } from './ojs.module.js';

/** Alias for OjsService for projects preferring OJS-prefixed naming. */
export { OjsService as OJSWorkerService } from './ojs.service.js';

// ─── @InjectOJSClient() Decorator ───────────────────────────────────────────

/**
 * Injects the OJS client instance into a NestJS provider.
 *
 * @example
 * ```ts
 * @Injectable()
 * export class OrderService {
 *   constructor(@InjectOJSClient() private readonly ojs: OjsService) {}
 *
 *   async createOrder(data: OrderData) {
 *     const order = await this.save(data);
 *     await this.ojs.client.enqueue('email.send', [order.userId]);
 *     return order;
 *   }
 * }
 * ```
 */
export function InjectOJSClient(): ParameterDecorator {
  return Inject(OJS_MODULE_OPTIONS);
}

// ─── @OJSHandler() Decorator ────────────────────────────────────────────────

/**
 * Marks a method as an OJS job handler. Used by OJSWorkerService to
 * auto-discover handlers and register them with the OJS worker.
 *
 * @param type - The OJS job type this handler processes (e.g., 'email.send')
 * @param options - Optional handler configuration
 *
 * @example
 * ```ts
 * @Injectable()
 * export class EmailHandler {
 *   @OJSHandler('email.send')
 *   async handleSendEmail(ctx: JobContext) {
 *     const [to, template] = ctx.args;
 *     await this.mailer.send(to, template);
 *   }
 *
 *   @OJSHandler({ type: 'email.bulk', queue: 'bulk' })
 *   async handleBulkEmail(ctx: JobContext) {
 *     // ...
 *   }
 * }
 * ```
 */
export function OJSHandler(
  typeOrOptions: string | { type: string; queue?: string },
): MethodDecorator {
  const options = typeof typeOrOptions === 'string'
    ? { type: typeOrOptions }
    : typeOrOptions;
  return SetMetadata(OJS_JOB_METADATA, options);
}
