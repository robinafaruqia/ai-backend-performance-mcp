import express from 'express';
import { createClient } from 'redis';

const app = express();

app.get('/cache', async (_req, res) => {
  const redis = createClient();
  const ids = ['a', 'b'];
  const values = [];
  for (const id of ids) {
    values.push(await redis.get(id));
  }
  await redis.set('session', '1');
  const all = await redis.keys('*');
  res.json({ values, all });
});

export default app;
