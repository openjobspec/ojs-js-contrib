import { OJSClient } from '@openjobspec/sdk';
import type { Job, EnqueueOptions } from '@openjobspec/sdk';

let _client: OJSClient | null = null;

export interface OjsServerConfig {
  baseUrl: string;
}

export function configureOjs(config: OjsServerConfig): void {
  _client = new OJSClient({ url: config.baseUrl });
}

export function getOjsClient(): OJSClient {
  if (!_client) {
    const url = process.env.OJS_URL ?? 'http://localhost:8080';
    _client = new OJSClient({ url });
  }
  return _client;
}

export async function enqueueJob(
  type: string,
  args: unknown[],
  options?: EnqueueOptions,
): Promise<Job> {
  const client = getOjsClient();
  return client.enqueue(type, args, options);
}

export async function getJob(jobId: string): Promise<Job> {
  const client = getOjsClient();
  return client.getJob(jobId);
}

export async function cancelJob(jobId: string): Promise<Job> {
  const client = getOjsClient();
  return client.cancelJob(jobId);
}
