import { prisma } from "@/shared/lib/prisma";
import { logger } from "@/shared/lib/logger";
import { trackAudit } from "@/shared/lib/audit";
import { toUserRole, USER_ROLES } from "@/shared/lib/auth/roles";

export async function trackServiceModeEntry(session: {
  userId: string;
  activeOrganizationId?: string | null;
}): Promise<void> {
  const organizationId = session.activeOrganizationId;
  if (!organizationId) {
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });
    if (toUserRole(user?.role) !== USER_ROLES.SUPERADMIN) {
      return;
    }
    const membership = await prisma.member.findFirst({
      where: { organizationId, userId: session.userId },
      select: { id: true },
    });
    if (membership !== null) {
      return;
    }
    await trackAudit({
      organizationId,
      actorUserId: session.userId,
      action: "organization.entered",
      entityType: "organization",
      entityId: organizationId,
      serviceMode: true,
    });
  } catch (error) {
    logger.error("[AUTH] Failed to track service mode entry", {
      err: error,
    });
  }
}
