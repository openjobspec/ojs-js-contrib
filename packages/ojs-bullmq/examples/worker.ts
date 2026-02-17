/**
 * Worker using the OJS BullMQ adapter.
 *
 * Prerequisites:
 *   docker compose up -d     # Start Redis + OJS server
 *   npm install               # Install dependencies
 *   npm run worker            # Run this worker
 */
import { Worker } from '@openjobspec/bullmq';

const OJS_URL = process.env.OJS_URL ?? 'http://localhost:8080';

const worker = new Worker('emails', async (job) => {
  console.log(`[${job.id}] Processing ${job.name} (attempt ${job.attemptsMade}):`, job.data);

  switch (job.name) {
    case 'send-welcome':
      console.log(`  → Sending welcome email to ${job.data.to}`);
      break;
    case 'send-invoice':
      console.log(`  → Sending invoice ${job.data.invoiceId} to ${job.data.to}`);
      break;
    case 'send-newsletter':
      console.log(`  → Sending newsletter for campaign ${job.data.campaignId}`);
      break;
    case 'send-reminder':
      console.log(`  → Sending reminder to user ${job.data.userId}`);
      break;
    default:
      console.log(`  → Unknown job type: ${job.name}`);
  }
}, { baseUrl: OJS_URL });

console.log('Worker starting...');
await worker.run();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down worker...');
  await worker.close();
  process.exit(0);
});
