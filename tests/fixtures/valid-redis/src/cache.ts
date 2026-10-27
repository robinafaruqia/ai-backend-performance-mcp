import { createClient } from 'redis';

const redis = createClient();

export async function remember(userId: string) {
  await redis.set(`user:${userId}`, '1', { EX: 60 });
  return redis.get(`user:${userId}`);
}
