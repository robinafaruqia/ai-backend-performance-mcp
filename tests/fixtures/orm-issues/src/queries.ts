import { PrismaClient } from '@prisma/client';
import { getRepository } from 'typeorm';

const prisma = new PrismaClient();

export async function allOrders() {
  return prisma.order.findMany();
}

export async function usersFor(ids: string[]) {
  const users = [];
  for (const id of ids) {
    users.push(await prisma.user.findUnique({ where: { id } }));
  }
  return users;
}

export async function allRows() {
  return getRepository('Order').createQueryBuilder('order').getMany();
}

export async function rowsFor(ids: string[]) {
  const rows = [];
  for (const id of ids) {
    rows.push(await getRepository('Order').findOne({ where: { id } }));
  }
  return rows;
}
