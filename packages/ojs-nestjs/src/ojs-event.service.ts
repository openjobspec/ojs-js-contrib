import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { OJS_MODULE_OPTIONS } from './ojs.interfaces.js';
import type { OjsModuleOptions } from './ojs.interfaces.js';

export type OjsEventType =
  | 'job.completed'
  | 'job.failed'
  | 'job.cancelled'
  | 'job.retrying'
  | 'job.progress';

export interface OjsEvent {
  type: OjsEventType;
  jobId: string;
  jobType: string;
  queue: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export type OjsEventHandler = (event: OjsEvent) => void | Promise<void>;

/**
 * Service for subscribing to OJS lifecycle events.
 * Provides a typed event system integrated with NestJS DI.
 */
@Injectable()
export class OjsEventService implements OnModuleDestroy {
  private handlers = new Map<string, Set<OjsEventHandler>>();
  private running = false;

  /** The configured base URL for the OJS server. */
  readonly baseUrl: string;

  constructor(
    @Inject(OJS_MODULE_OPTIONS) options: OjsModuleOptions,
  ) {
    this.baseUrl = options.baseUrl;
  }

  /**
   * Register an event handler for a specific event type or all events.
   * @param event - The event type to listen for, or '*' for all events
   * @param handler - The handler function to invoke
   */
  on(event: OjsEventType | '*', handler: OjsEventHandler): this {
    let handlers = this.handlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(event, handlers);
    }
    handlers.add(handler);
    return this;
  }

  /**
   * Remove an event handler for a specific event type or all events.
   * @param event - The event type to stop listening for
   * @param handler - The handler function to remove
   */
  off(event: OjsEventType | '*', handler: OjsEventHandler): this {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(event);
      }
    }
    return this;
  }

  /**
   * Start listening for events.
   * Marks the service as running so it will dispatch events.
   */
  async start(): Promise<void> {
    this.running = true;
  }

  /**
   * Stop listening for events.
   */
  async stop(): Promise<void> {
    this.running = false;
  }

  /**
   * Emit an event internally.
   * Dispatches to both type-specific handlers and wildcard ('*') handlers.
   * Only dispatches when the service is running.
   */
  async emit(event: OjsEvent): Promise<void> {
    if (!this.running) {
      return;
    }

    const typeHandlers = this.handlers.get(event.type);
    const wildcardHandlers = this.handlers.get('*');

    const promises: Promise<void>[] = [];

    if (typeHandlers) {
      for (const handler of typeHandlers) {
        const result = handler(event);
        if (result instanceof Promise) {
          promises.push(result);
        }
      }
    }

    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        const result = handler(event);
        if (result instanceof Promise) {
          promises.push(result);
        }
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  /**
   * NestJS lifecycle hook — stops the event service on module destroy.
   */
  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }
}
