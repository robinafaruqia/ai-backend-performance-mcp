import type { Db } from 'mongodb';

export async function ensureOrderIndexes(db: Db) {
  await db.collection('orders').createIndex({ userId: 1, createdAt: -1 });
}

export async function ensureUserIndexes(db: Db) {
  await db.collection('users').createIndex({ email: 1 });
}
