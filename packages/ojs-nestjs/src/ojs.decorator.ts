import { SetMetadata } from '@nestjs/common';
import { OJS_JOB_METADATA } from './ojs.interfaces.js';

export interface OjsJobOptions {
  type: string;
  queue?: string;
}

export function OjsJob(typeOrOptions: string | OjsJobOptions): MethodDecorator {
  const options = typeof typeOrOptions === 'string' ? { type: typeOrOptions } : typeOrOptions;
  return SetMetadata(OJS_JOB_METADATA, options);
}
