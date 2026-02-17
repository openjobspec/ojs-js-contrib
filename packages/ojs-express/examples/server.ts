import express from 'express';
import { ojsMiddleware, ojsErrorHandler } from '@openjobspec/express';
import type { OjsRequest } from '@openjobspec/express';

const app = express();
app.use(express.json());

app.use(ojsMiddleware({
  url: process.env.OJS_URL ?? 'http://localhost:8080',
}));

app.post('/jobs', async (req, res) => {
  const { type, args, queue } = req.body;
  const job = await (req as OjsRequest).ojs.enqueue(type, args ?? [], {
    queue: queue ?? 'default',
  });
  res.status(201).json(job);
});

app.get('/jobs/:id', async (req, res) => {
  const job = await (req as OjsRequest).ojs.getJob(req.params.id);
  res.json(job);
});

app.delete('/jobs/:id', async (req, res) => {
  await (req as OjsRequest).ojs.cancelJob(req.params.id);
  res.status(204).end();
});

app.use(ojsErrorHandler({
  onError: (err) => console.error('[OJS Error]', err.message),
}));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Express OJS server listening on http://localhost:${port}`);
});
