import type { Collection } from 'mongodb';

export async function setupIndexes(collection: Collection) {
  await collection.createIndex({ status: 1, createdAt: -1 });
}

export async function findByStatus(collection: Collection, status: string) {
  return collection.find({ status }).sort({ createdAt: -1 }).toArray();
}

export async function findById(collection: Collection, id: string) {
  return collection.find({ _id: id }).toArray();
}
