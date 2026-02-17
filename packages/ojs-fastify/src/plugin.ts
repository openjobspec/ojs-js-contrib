import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { OJSClient } from '@openjobspec/sdk';

export interface OjsFastifyOptions {
  url: string;
  client?: OJSClient;
}

declare module 'fastify' {
  interface FastifyInstance {
    ojs: OJSClient;
  }
}

const ojsPlugin: FastifyPluginAsync<OjsFastifyOptions> = async (
  fastify: FastifyInstance,
  options: OjsFastifyOptions,
) => {
  const client = options.client ?? new OJSClient({ url: options.url });

  fastify.decorate('ojs', client);

  fastify.addHook('onClose', async () => {
    // Client cleanup if needed
  });
};

export default fp(ojsPlugin, {
  name: '@openjobspec/fastify',
  fastify: '>=4.0.0',
});
