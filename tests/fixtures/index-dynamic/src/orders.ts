import type { Collection } from 'mongodb';

export async function setupIndexes(collection: Collection, spec: Record<string, number>) {
  await collection.createIndex(spec);
}

export async function findByStatus(collection: Collection, status: string) {
  return collection.find({ status }).sort({ createdAt: -1 }).toArray();
}
