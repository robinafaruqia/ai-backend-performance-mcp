import type { Pool } from 'pg';

export async function loadOrdersForUsers(pool: Pool, userIds: string[]) {
  const rows = [];
  for (const userId of userIds) {
    const result = await pool.query('SELECT * FROM orders WHERE user_id = $1', [userId]);
    rows.push(result.rows);
  }
  return rows;
}
