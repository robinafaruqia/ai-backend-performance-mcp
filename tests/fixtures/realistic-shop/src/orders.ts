import type { Db } from 'mongodb';

export async function listUserOrders(db: Db, userId: string) {
  return db.collection('orders').find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();
}

export async function listByStatus(db: Db, status: string) {
  return db.collection('orders').find({ status }).sort({ createdAt: -1 }).toArray();
}

export async function loadOrderView(db: Db, userId: string) {
  const user = await db.collection('users').findOne({ _id: userId });
  const orders = await db.collection('orders').find({ userId: user?._id }).limit(20).toArray();
  return { user, orders };
}
