import type { ModuleMetadata, Type } from '@nestjs/common';

export interface OjsModuleOptions {
  baseUrl: string;
  queues?: string[];
  isGlobal?: boolean;
}

export interface OjsModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  isGlobal?: boolean;
  useFactory: (...args: unknown[]) => OjsModuleOptions | Promise<OjsModuleOptions>;
  inject?: (string | symbol | Function | Type)[];
}

export const OJS_MODULE_OPTIONS = Symbol('OJS_MODULE_OPTIONS');
export const OJS_JOB_METADATA = Symbol('OJS_JOB_METADATA');
