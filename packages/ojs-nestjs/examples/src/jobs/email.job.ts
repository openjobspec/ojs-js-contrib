import { Injectable, Logger } from '@nestjs/common';
import { OjsJob } from '@openjobspec/nestjs';

@Injectable()
export class EmailJobHandler {
  private readonly logger = new Logger(EmailJobHandler.name);

  @OjsJob({ type: 'email.send', queue: 'emails' })
  async handle(ctx: { job: { id: string; args: unknown[] }; attempt: number }) {
    const [to, subject, body] = ctx.job.args as [string, string, string];
    this.logger.log(
      `Processing email job ${ctx.job.id} (attempt ${ctx.attempt}): to=${to} subject="${subject}"`,
    );

    // Simulate sending an email
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.logger.log(`Email sent successfully to ${to}`);
  }
}
