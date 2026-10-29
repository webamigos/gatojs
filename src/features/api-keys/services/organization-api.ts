import { prisma } from "@/shared/lib/prisma";
import type { ApiKeyContext } from "./authenticate-api-key";

export async function readOrganizationForApiKey(
  context: ApiKeyContext,
): Promise<{ id: string; name: string; slug: string }> {
  return prisma.organization.findUniqueOrThrow({
    where: { id: context.organizationId },
    select: { id: true, name: true, slug: true },
  });
}
