import type { Collection, Document } from 'mongodb';

export function findUserById(users: Array<{ id: string; name: string }>, id: string) {
  return users.find((user) => user.id === id);
}

export async function loadUsersByIds(collection: Collection<Document>, ids: string[]) {
  return collection.find({ _id: { $in: ids } }).toArray();
}

export async function loadUser(collection: Collection<Document>, id: string) {
  return collection.findOne({ _id: id });
}

export async function listRecent(collection: Collection<Document>) {
  return collection.find({ active: true }).limit(50).toArray();
}

export async function annotateLocally(collection: Collection<Document>, ids: string[]) {
  const users = await collection.find({ _id: { $in: ids } }).toArray();
  const annotated = [];
  for (const user of users) {
    annotated.push({ ...user, label: String(user._id) });
  }
  return annotated;
}
