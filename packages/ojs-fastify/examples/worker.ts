import { OJSWorker } from '@openjobspec/sdk';

const OJS_URL = process.env['OJS_URL'] ?? 'http://localhost:8080';

const worker = new OJSWorker({
  url: OJS_URL,
  queues: ['default'],
});

worker.register('email.send', async (job) => {
  console.log(`Processing email job ${job.id}:`, job.args);
  // Simulate work
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log(`Completed job ${job.id}`);
});

worker.register('report.generate', async (job) => {
  console.log(`Generating report ${job.id}:`, job.args);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  console.log(`Completed job ${job.id}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await worker.stop();
  process.exit(0);
});

console.log('Starting worker...');
await worker.start();
