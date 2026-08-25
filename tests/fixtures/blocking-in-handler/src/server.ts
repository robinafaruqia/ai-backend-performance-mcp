import { readFileSync } from 'node:fs';
import express from 'express';

const config = readFileSync('./config.json', 'utf8');
const app = express();

app.get('/config', (_req, res) => {
  const fresh = readFileSync('./config.json', 'utf8');
  res.type('json').send(fresh);
});

export { app, config };
