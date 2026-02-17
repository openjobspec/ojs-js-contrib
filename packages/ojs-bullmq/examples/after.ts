/**
 * AFTER: Same app using the OJS BullMQ adapter.
 *
 * Prerequisites:
 *   docker compose up -d     # Start Redis + OJS server
 *   npm install               # Install dependencies
 *   npm run after             # Run this script
 */
import { Queue } from '@openjobspec/bullmq';

const OJS_URL = process.env.OJS_URL ?? 'http://localhost:8080';

// --- Producer (drop-in replacement for BullMQ Queue) ---
const queue = new Queue('emails', { baseUrl: OJS_URL });

const job1 = await queue.add('send-welcome', { to: 'alice@example.com', template: 'welcome' });
console.log(`Enqueued ${job1.name} → ${job1.id}`);

const job2 = await queue.add('send-invoice', { to: 'bob@example.com', invoiceId: 42 }, {
  delay: 5000,
  priority: 10,
  attempts: 3,
});
console.log(`Enqueued ${job2.name} → ${job2.id}`);

const bulkResults = await queue.addBulk([
  { name: 'send-newsletter', data: { campaignId: 7 } },
  { name: 'send-reminder', data: { userId: 99 }, opts: { delay: 60000 } },
]);
console.log(`Bulk enqueued ${bulkResults.length} jobs`);

await queue.close();
console.log('Producer done');
