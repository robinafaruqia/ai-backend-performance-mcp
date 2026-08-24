export async function getUsersWithOrders(client, userIds) {
  const db = client.db('shop');
  const results = [];

  for (const userId of userIds) {
    const user = await db.collection('users').findOne({ _id: userId });
    const orders = await db.collection('orders').find({ userId }).toArray();
    results.push({ user, orders });
  }

  return results;
}
