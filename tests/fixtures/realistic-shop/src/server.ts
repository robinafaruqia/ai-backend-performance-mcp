import express from 'express';
import { shopDb } from './db.js';
import { listUserOrders } from './orders.js';

const app = express();

app.get('/orders', async (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
  const orders = await listUserOrders(shopDb(), userId);
  res.json(orders);
});

export default app;
