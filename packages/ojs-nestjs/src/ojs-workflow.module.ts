import { Module, DynamicModule } from '@nestjs/common';
import { OjsWorkflowService } from './ojs-workflow.service.js';

@Module({})
export class OjsWorkflowModule {
  static register(): DynamicModule {
    return {
      module: OjsWorkflowModule,
      providers: [OjsWorkflowService],
      exports: [OjsWorkflowService],
    };
  }
}
