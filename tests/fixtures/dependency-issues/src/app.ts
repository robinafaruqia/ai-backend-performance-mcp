import express from 'express';
import axios from 'axios';

const app = express();

app.get('/health', (_req, res) => {
  res.json({ ok: true, client: typeof axios });
});

export default app;
