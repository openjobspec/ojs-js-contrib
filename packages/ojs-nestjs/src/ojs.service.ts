import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { OJSClient, OJSWorker } from '@openjobspec/sdk';
import type { OjsModuleOptions } from './ojs.interfaces.js';
import { OJS_MODULE_OPTIONS, OJS_JOB_METADATA } from './ojs.interfaces.js';
import type { OjsJobOptions } from './ojs.decorator.js';

@Injectable()
export class OjsService implements OnModuleInit, OnModuleDestroy {
  public readonly client: OJSClient;
  public readonly worker: OJSWorker;
  private running = false;
  private shuttingDown = false;

  constructor(
    @Inject(OJS_MODULE_OPTIONS) private readonly options: OjsModuleOptions,
    private readonly reflector: Reflector,
  ) {
    this.client = new OJSClient({ url: options.baseUrl });
    this.worker = new OJSWorker({
      url: options.baseUrl,
      queues: options.queues ?? ['default'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.worker.start();
    this.running = true;
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    await this.worker.stop();
    this.running = false;
    this.shuttingDown = false;
  }

  /**
   * Register a job handler programmatically.
   */
  registerHandler(type: string, handler: (ctx: unknown) => Promise<void>): void {
    this.worker.register(type, handler);
  }

  /**
   * Health check for dependency injection.
   * Returns an object suitable for NestJS health indicators.
   */
  getHealth(): { status: string; running: boolean; shuttingDown: boolean; queues: string[] } {
    return {
      status: this.running && !this.shuttingDown ? 'ok' : this.shuttingDown ? 'draining' : 'stopped',
      running: this.running,
      shuttingDown: this.shuttingDown,
      queues: this.options.queues ?? ['default'],
    };
  }

  /**
   * Returns true if the worker is running and not shutting down.
   */
  isHealthy(): boolean {
    return this.running && !this.shuttingDown;
  }
}
