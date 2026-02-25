import { OJSWorker } from '@openjobspec/sdk';
import type { JobContext } from '@openjobspec/sdk';

const worker = new OJSWorker({
  url: process.env.OJS_URL ?? 'http://localhost:8080',
  queues: ['default'],
});

worker.register('email.send', async (ctx: JobContext) => {
  const [to, subject, body] = ctx.job.args;
  console.log(`Sending email to ${to}: ${subject}`);
  console.log(`Body: ${body}`);
  // Simulate email sending
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log(`Email sent to ${to}`);
});

worker.register('report.generate', async (ctx: JobContext) => {
  const [reportType] = ctx.job.args;
  console.log(`Generating ${reportType} report (attempt ${ctx.attempt})`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log(`Report ${reportType} generated`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await worker.stop();
  process.exit(0);
});

console.log('Starting OJS worker...');
await worker.start();

