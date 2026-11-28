import { prisma } from "@/shared/lib/prisma";
import type { OrgRole } from "@/shared/lib/auth/roles";

export async function joinOrganizationCommand(input: {
  userId: string;
  organizationId: string;
  role: OrgRole;
  invitationId?: string;
}): Promise<{ memberId: string }> {
  const addMember = prisma.member.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role,
    },
  });
  if (!input.invitationId) {
    const member = await addMember;
    return { memberId: member.id };
  }
  const [member] = await prisma.$transaction([
    addMember,
    prisma.invitation.update({
      where: { id: input.invitationId },
      data: { status: "accepted" },
    }),
  ]);
  return { memberId: member.id };
}
