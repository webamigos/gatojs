import { prisma } from "@/shared/lib/prisma";
import { USER_ROLES, type UserRole } from "@/shared/lib/auth/roles";

export async function canEnterOrganization(input: {
  userId: string;
  userRole: UserRole;
  organizationId: string;
}): Promise<boolean> {
  if (input.userRole === USER_ROLES.SUPERADMIN) {
    const organization = await prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    return organization !== null;
  }
  const membership = await prisma.member.findFirst({
    where: { organizationId: input.organizationId, userId: input.userId },
    select: { id: true },
  });
  return membership !== null;
}
