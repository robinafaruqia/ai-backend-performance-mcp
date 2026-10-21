import { MongoClient } from 'mongodb';

export const client = new MongoClient(process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017');

export function shopDb() {
  return client.db('shop');
}
