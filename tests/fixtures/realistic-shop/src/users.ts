import type { Db } from 'mongodb';

export async function hydrateUsers(db: Db, ids: string[]) {
  const users = [];
  for (const id of ids) {
    const user = await db.collection('users').findOne({ _id: id });
    users.push(user);
  }
  return users;
}
