import { Injectable, Inject } from '@nestjs/common';
import type { OjsModuleOptions } from './ojs.interfaces.js';
import { OJS_MODULE_OPTIONS } from './ojs.interfaces.js';
import { OjsService } from './ojs.service.js';

export interface OjsHealthResult {
  status: 'up' | 'down';
  details: {
    client: { status: string; url: string };
    worker: { status: string; running: boolean; queues: string[] };
  };
}

/**
 * Health indicator for OJS integration.
 * Compatible with NestJS @nestjs/terminus HealthIndicator pattern.
 *
 * Can be used standalone or with @nestjs/terminus:
 *
 * @example
 * ```ts
 * // Standalone usage
 * @Controller('health')
 * export class HealthController {
 *   constructor(private readonly ojsHealth: OjsHealthIndicator) {}
 *
 *   @Get('ojs')
 *   async checkOjs() {
 *     return this.ojsHealth.check();
 *   }
 * }
 * ```
 */
@Injectable()
export class OjsHealthIndicator {
  constructor(
    @Inject(OJS_MODULE_OPTIONS) private readonly options: OjsModuleOptions,
    @Inject(OjsService) private readonly ojsService: OjsService,
  ) {}

  /**
   * Check OJS health status.
   * Returns detailed health information about the client and worker.
   */
  async check(): Promise<OjsHealthResult> {
    const workerHealth = this.ojsService.getHealth();

    let clientStatus = 'unknown';
    try {
      const healthResponse = await this.ojsService.client.health();
      clientStatus = healthResponse?.status === 'ok' ? 'up' : 'down';
    } catch {
      clientStatus = 'down';
    }

    const workerUp = workerHealth.running && !workerHealth.shuttingDown;
    const overallUp = clientStatus === 'up' && workerUp;

    return {
      status: overallUp ? 'up' : 'down',
      details: {
        client: {
          status: clientStatus,
          url: this.options.baseUrl,
        },
        worker: {
          status: workerHealth.status,
          running: workerHealth.running,
          queues: workerHealth.queues,
        },
      },
    };
  }

  /**
   * Check if OJS is healthy (returns boolean).
   * Convenience method for simple health checks.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.check();
      return result.status === 'up';
    } catch {
      return false;
    }
  }
}
