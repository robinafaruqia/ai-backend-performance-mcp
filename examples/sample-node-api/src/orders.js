export async function setupIndexes(collection) {
  await collection.createIndex({ email: 1 });
}

export async function findOrdersByStatus(collection, status) {
  return collection.find({ status }).sort({ createdAt: -1 }).toArray();
}
