import type { Collection } from 'mongodb';

export async function findByStatus(collection: Collection, status: string) {
  return collection.find({ status }).toArray();
}
