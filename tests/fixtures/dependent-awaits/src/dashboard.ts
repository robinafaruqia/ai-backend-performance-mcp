export async function loadUserDashboard(userId: string) {
  const user = await fetchUser(userId);
  const orders = await fetchOrders(user.id);
  return { user, orders };
}

export async function paginateAll() {
  let cursor: string | null = null;
  const pages = [];
  while (true) {
    const page = await fetchPage(cursor);
    pages.push(page.items);
    cursor = page.nextCursor;
    if (!cursor) {
      break;
    }
  }
  return pages.flat();
}

async function fetchUser(userId: string) {
  return { id: userId };
}

async function fetchOrders(userId: string) {
  return [{ userId }];
}

async function fetchPage(cursor: string | null) {
  return { items: cursor ? [] : [{ id: '1' }], nextCursor: null };
}
