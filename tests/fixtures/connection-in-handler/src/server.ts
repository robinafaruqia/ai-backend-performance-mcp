import express from 'express';
import { MongoClient } from 'mongodb';

const app = express();

app.get('/users', async (_req, res) => {
  const client = await MongoClient.connect('mongodb://localhost:27017');
  const users = await client.db('app').collection('users').find({}).toArray();
  res.json(users);
});

export default app;
