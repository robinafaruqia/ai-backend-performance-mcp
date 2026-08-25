import express from 'express';
import { MongoClient } from 'mongodb';
import { getUsersWithOrders } from './users.js';
import { loadDashboard } from './dashboard.js';

const app = express();

app.get('/users/:id/orders', async (req, res) => {
  const client = await MongoClient.connect(process.env.MONGO_URL ?? 'mongodb://localhost:27017');
  const data = await getUsersWithOrders(client, [req.params.id]);
  res.json(data);
});

app.get('/dashboard', async (_req, res) => {
  const data = await loadDashboard();
  res.json(data);
});

export default app;
