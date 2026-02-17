import { Module } from '@nestjs/common';
import { OjsModule } from '@openjobspec/nestjs';
import { EmailJobHandler } from './jobs/email.job.js';

@Module({
  imports: [
    OjsModule.forRoot({
      baseUrl: process.env['OJS_URL'] ?? 'http://localhost:8080',
      queues: ['default', 'emails'],
      isGlobal: true,
    }),
  ],
  providers: [EmailJobHandler],
})
export class AppModule {}
