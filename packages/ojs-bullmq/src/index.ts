export { Queue, Worker } from './adapter.js';
export type { OjsQueueOptions } from './adapter.js';
export { migrateJobDefinition, migrateBulk } from './migration.js';
export type { BullMQJobDefinition, OjsJobDefinition } from './migration.js';

// BullMQ-compatible aliases with OJS prefix
export { Queue as OJSQueue, Worker as OJSWorker } from './adapter.js';
