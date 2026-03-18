// ---- Adapter (Queue & Worker) ----
export { Queue, Worker } from './adapter.js';
export type { OjsQueueOptions, BullMQProcessor } from './adapter.js';

// ---- Migration (single job / bulk) ----
export { migrateJobDefinition, migrateBulk } from './migration.js';
export type { BullMQJobDefinition, OjsJobDefinition } from './migration.js';

// ---- Queue Migration ----
export { migrateQueue, generateMigrationReport } from './queue-migration.js';
export type {
  QueueMigrationOptions,
  MigrationProgress,
  MigrationResult,
} from './queue-migration.js';

// ---- Types ----
export { mapBackoffToRetry, mapRepeatToCron, toCompatJob } from './types.js';
export type {
  BullMQJob,
  BullMQJobOptions,
  BullMQBackoffOptions,
  BullMQRepeatOptions,
  OjsRetryPolicy,
  OjsCronDefinition,
} from './types.js';

// ---- Events ----
export {
  EVENT_MAP,
  mapEventName,
  toCompatEvent,
  isBullMQEvent,
  allMappedOjsEvents,
} from './events.js';
export type { BullMQEventName, OjsEventName } from './events.js';

// ---- BullMQ-compatible aliases with OJS prefix ----
export { Queue as OJSQueue, Worker as OJSWorker } from './adapter.js';
