/**
 * BEFORE: Original BullMQ code (for reference only).
 *
 * This file shows typical BullMQ usage. It is NOT runnable as-is because
 * this example project does not include BullMQ as a dependency. It exists
 * solely to illustrate the "before" state for a migration comparison.
 */

// import { Queue, Worker } from 'bullmq';
//
// const connection = { host: 'localhost', port: 6379 };
//
// // --- Producer ---
// const queue = new Queue('emails', { connection });
//
// await queue.add('send-welcome', { to: 'alice@example.com', template: 'welcome' });
//
// await queue.add('send-invoice', { to: 'bob@example.com', invoiceId: 42 }, {
//   delay: 5000,
//   priority: 10,
//   attempts: 3,
// });
//
// await queue.addBulk([
//   { name: 'send-newsletter', data: { campaignId: 7 } },
//   { name: 'send-reminder', data: { userId: 99 }, opts: { delay: 60000 } },
// ]);
//
// console.log('Jobs enqueued');
// await queue.close();
//
// // --- Worker ---
// const worker = new Worker('emails', async (job) => {
//   console.log(`[${job.id}] Processing ${job.name}:`, job.data);
//
//   switch (job.name) {
//     case 'send-welcome':
//       console.log(`Sending welcome email to ${job.data.to}`);
//       break;
//     case 'send-invoice':
//       console.log(`Sending invoice ${job.data.invoiceId} to ${job.data.to}`);
//       break;
//     case 'send-newsletter':
//       console.log(`Sending newsletter for campaign ${job.data.campaignId}`);
//       break;
//     case 'send-reminder':
//       console.log(`Sending reminder to user ${job.data.userId}`);
//       break;
//   }
// }, { connection, concurrency: 5 });

console.log('This file is for reference only. See after.ts for the OJS adapter version.');
