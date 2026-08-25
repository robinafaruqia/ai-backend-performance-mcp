import type { Collection } from 'mongodb';

export async function setupIndexes(collection: Collection) {
  await collection.createIndex({ email: 1 });
}

export async function findByStatus(collection: Collection, status: string) {
  return collection.find({ status }).sort({ createdAt: -1 }).toArray();
}
