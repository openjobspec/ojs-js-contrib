'use server';

import { enqueueJob } from '@openjobspec/nextjs/server';

export async function submitJob(type: string, args: unknown[]): Promise<string> {
  const job = await enqueueJob(type, args);
  return job.id;
}
