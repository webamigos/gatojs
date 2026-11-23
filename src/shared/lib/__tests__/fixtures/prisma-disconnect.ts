import { prisma } from "@/shared/lib/prisma";

async function main(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  await prisma.$disconnect();
}

void main();
