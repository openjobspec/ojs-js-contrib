import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OJSClient, OJSWorker } from '@openjobspec/sdk';
import type { OjsModuleOptions } from './ojs.interfaces.js';
import { OJS_MODULE_OPTIONS } from './ojs.interfaces.js';

@Injectable()
export class OjsService implements OnModuleInit, OnModuleDestroy {
  public readonly client: OJSClient;
  public readonly worker: OJSWorker;

  constructor(@Inject(OJS_MODULE_OPTIONS) options: OjsModuleOptions) {
    this.client = new OJSClient({ url: options.baseUrl });
    this.worker = new OJSWorker({
      url: options.baseUrl,
      queues: options.queues ?? ['default'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.worker.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.stop();
  }
}
