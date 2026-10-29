import "server-only";

import { prisma } from "@/shared/lib/prisma";
import { requireModuleAccess } from "@/shared/lib/auth/require-module-access";
import type { ApiKeyRow } from "../../contracts/api-key.types";

export async function listApiKeysQuery(): Promise<ApiKeyRow[]> {
  const { organizationId } = await requireModuleAccess("api-keys");
  return prisma.apiKey.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      displayPrefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
}
