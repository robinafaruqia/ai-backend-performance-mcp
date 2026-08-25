import type { Pool } from 'pg';

export async function loadOrdersForUsers(pool: Pool, userIds: string[]) {
  const result = await pool.query('SELECT * FROM orders WHERE user_id = ANY($1::text[]) LIMIT 100', [
    userIds,
  ]);
  return result.rows;
}

export async function insertOrder(pool: Pool, userId: string) {
  return pool.query('INSERT INTO orders (user_id) VALUES ($1)', [userId]);
}
