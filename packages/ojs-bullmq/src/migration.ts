export interface BullMQJobDefinition {
  name: string;
  queue: string;
  data: Record<string, unknown>;
  opts?: {
    delay?: number;
    priority?: number;
    attempts?: number;
    backoff?: { type: string; delay: number };
    repeat?: { pattern: string };
  };
}

export interface OjsJobDefinition {
  type: string;
  args: unknown[];
  options: {
    queue: string;
    priority?: number;
    delay?: string;
    retry?: { maxAttempts: number };
  };
}

/** Convert a single BullMQ job definition to OJS format. */
export function migrateJobDefinition(bullJob: BullMQJobDefinition): OjsJobDefinition {
  const ojsJob: OjsJobDefinition = {
    type: bullJob.name,
    args: [bullJob.data],
    options: {
      queue: bullJob.queue,
    },
  };

  if (bullJob.opts?.priority !== undefined) {
    ojsJob.options.priority = bullJob.opts.priority;
  }

  if (bullJob.opts?.delay !== undefined) {
    ojsJob.options.delay = `${bullJob.opts.delay}ms`;
  }

  if (bullJob.opts?.attempts !== undefined) {
    ojsJob.options.retry = { maxAttempts: bullJob.opts.attempts };
  }

  return ojsJob;
}

/** Convert an array of BullMQ job definitions to OJS format. */
export function migrateBulk(bullJobs: BullMQJobDefinition[]): OjsJobDefinition[] {
  return bullJobs.map(migrateJobDefinition);
}

