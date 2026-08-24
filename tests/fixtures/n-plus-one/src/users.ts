import { MongoClient } from 'mongodb';

export async function getUsersWithOrders(client: MongoClient, userIds: string[]) {
  const db = client.db('shop');
  const results = [];

  for (const userId of userIds) {
    const user = await db.collection('users').findOne({ _id: userId });
    const orders = await db.collection('orders').find({ userId }).toArray();
    results.push({ user, orders });
  }

  return results;
}

export async function listAllProducts(client: MongoClient) {
  return db.collection('products').find({ active: true });
}

const db = { collection: () => ({ find: () => ({}) }) };
