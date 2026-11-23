import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { tenantScopeExtension } from "@/shared/lib/tenant-scope/tenant-scope-extension";

const globalForPrisma = globalThis as unknown as {
  prisma: ScopedPrismaClient | undefined;
};

function parsePoolMax(): number {
  const n = parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  return Number.isInteger(n) && n > 0 ? n : 10;
}

function createPrismaClient() {
  // WHY: given pool options instead of a Pool, the adapter owns the pool and $disconnect() ends it,
  // so scripts such as admin:create exit right away instead of waiting for idleTimeoutMillis.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: parsePoolMax(),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  });
  return new PrismaClient({ adapter }).$extends(tenantScopeExtension);
}

type ScopedPrismaClient = ReturnType<typeof createPrismaClient>;

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
