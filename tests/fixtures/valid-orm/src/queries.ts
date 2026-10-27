import { PrismaClient } from '@prisma/client';
import { getRepository } from 'typeorm';

const prisma = new PrismaClient();

export async function recentOrders(status: string) {
  return prisma.order.findMany({ where: { status }, take: 20 });
}

export async function oneUser(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function boundedRows() {
  return getRepository('Order').find({ take: 20 });
}

export async function boundedBuilder() {
  return getRepository('Order').createQueryBuilder('order').limit(20).getMany();
}
