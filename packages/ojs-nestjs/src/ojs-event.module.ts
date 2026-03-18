import { Module, DynamicModule } from '@nestjs/common';
import { OjsEventService } from './ojs-event.service.js';

@Module({})
export class OjsEventModule {
  static register(): DynamicModule {
    return {
      module: OjsEventModule,
      providers: [OjsEventService],
      exports: [OjsEventService],
    };
  }
}
