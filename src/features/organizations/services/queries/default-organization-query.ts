import { prisma } from "@/shared/lib/prisma";
import { logger } from "@/shared/lib/logger";

export async function getDefaultActiveOrganizationId(
  userId: string,
): Promise<string | null> {
  try {
    const member = await prisma.member.findFirst({
      where: { userId },
      select: { organizationId: true },
      orderBy: { createdAt: "asc" },
    });
    return member?.organizationId ?? null;
  } catch (error) {
    logger.error("[AUTH] Failed to resolve active organization", {
      err: error,
    });
    return null;
  }
}
