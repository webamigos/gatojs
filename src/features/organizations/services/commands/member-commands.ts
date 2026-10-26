import { prisma } from "@/shared/lib/prisma";
import type { OrgRole } from "@/shared/lib/auth/roles";

export async function joinOrganizationCommand(input: {
  userId: string;
  organizationId: string;
  role: OrgRole;
  invitationId?: string;
}): Promise<void> {
  const addMember = prisma.member.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role,
    },
  });
  if (!input.invitationId) {
    await addMember;
    return;
  }
  await prisma.$transaction([
    addMember,
    prisma.invitation.update({
      where: { id: input.invitationId },
      data: { status: "accepted" },
    }),
  ]);
}
