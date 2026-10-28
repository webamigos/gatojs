import { prisma } from "@/shared/lib/prisma";
import { logger } from "@/shared/lib/logger";
import { toUserRole, USER_ROLES } from "@/shared/lib/auth/roles";

export async function getDefaultActiveOrganizationId(
  userId: string,
): Promise<string | null> {
  try {
    const member = await prisma.member.findFirst({
      where: { userId },
      select: { organizationId: true },
      orderBy: { createdAt: "asc" },
    });
    if (member) {
      return member.organizationId;
    }
    return await oldestOrganizationForSuperadmin(userId);
  } catch (error) {
    logger.error("[AUTH] Failed to resolve active organization", {
      err: error,
    });
    return null;
  }
}

async function oldestOrganizationForSuperadmin(
  userId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (toUserRole(user?.role) !== USER_ROLES.SUPERADMIN) {
    return null;
  }
  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return organization?.id ?? null;
}
