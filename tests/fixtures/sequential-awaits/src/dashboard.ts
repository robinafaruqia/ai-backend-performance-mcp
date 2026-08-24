export async function loadDashboard() {
  const users = await fetchUsers();
  const orders = await fetchOrders();
  const metrics = await fetchMetrics();
  return { users, orders, metrics };
}

async function fetchUsers() {
  return [];
}

async function fetchOrders() {
  return [];
}

async function fetchMetrics() {
  return [];
}
