import express from 'express';
import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb://localhost:27017');
const app = express();

export async function start(): Promise<void> {
  await client.connect();
  app.get('/users', async (_req, res) => {
    const users = await client.db('app').collection('users').find({}).limit(20).toArray();
    res.json(users);
  });
  app.listen(3000);
}

export default app;
