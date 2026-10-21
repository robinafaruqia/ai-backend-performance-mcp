import type { Collection } from 'mongodb';

export async function setupIndexes(collection: Collection) {
  await collection.createIndex({ status: 1, createdAt: -1, name: 1 });
}

export async function coveredForward(collection: Collection, status: string) {
  return collection.find({ status }).sort({ createdAt: -1 }).toArray();
}

export async function coveredReverse(collection: Collection, status: string) {
  return collection.find({ status }).sort({ createdAt: 1 }).toArray();
}

export async function coveredEquality(collection: Collection, status: string) {
  return collection.find({ status }).toArray();
}

export async function coveredRange(collection: Collection, status: string, since: Date) {
  return collection.find({ status, createdAt: { $gt: since } }).toArray();
}

export async function wrongSortDirection(collection: Collection, status: string) {
  return collection.find({ status }).sort({ createdAt: 1, name: 1 }).toArray();
}

export async function nonPrefixField(collection: Collection, email: string) {
  return collection.find({ email }).toArray();
}
