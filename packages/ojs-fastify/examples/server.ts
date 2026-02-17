import Fastify from 'fastify';
import { ojsPlugin } from '@openjobspec/fastify';

const OJS_URL = process.env['OJS_URL'] ?? 'http://localhost:8080';
const PORT = Number(process.env['PORT'] ?? 3000);

const app = Fastify({ logger: true });

await app.register(ojsPlugin, {
  url: OJS_URL,
});

app.post('/jobs', async (request, reply) => {
  const { type, args, options } = request.body as {
    type: string;
    args: unknown[];
    options?: Record<string, unknown>;
  };

  const job = await app.ojs.enqueue(type, args, options);
  return reply.status(201).send(job);
});

app.get('/jobs/:id', async (request) => {
  const { id } = request.params as { id: string };
  return app.ojs.getJob(id);
});

app.delete('/jobs/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  await app.ojs.cancelJob(id);
  return reply.status(204).send();
});

await app.listen({ port: PORT });
console.log(`Server listening on http://localhost:${PORT}`);
