import { DynamicModule, Module } from '@nestjs/common';
import { OjsService } from './ojs.service.js';
import type { OjsModuleOptions, OjsModuleAsyncOptions } from './ojs.interfaces.js';
import { OJS_MODULE_OPTIONS } from './ojs.interfaces.js';

@Module({})
export class OjsModule {
  static forRoot(options: OjsModuleOptions): DynamicModule {
    const module: DynamicModule = {
      module: OjsModule,
      providers: [
        { provide: OJS_MODULE_OPTIONS, useValue: options },
        OjsService,
      ],
      exports: [OjsService, OJS_MODULE_OPTIONS],
    };

    if (options.isGlobal) {
      module.global = true;
    }

    return module;
  }

  static forRootAsync(options: OjsModuleAsyncOptions): DynamicModule {
    const module: DynamicModule = {
      module: OjsModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: OJS_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        OjsService,
      ],
      exports: [OjsService, OJS_MODULE_OPTIONS],
    };

    if (options.isGlobal) {
      module.global = true;
    }

    return module;
  }
}
