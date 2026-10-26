import { prisma } from "@/shared/lib/prisma";
import { ORG_ROLES } from "@/shared/lib/auth/roles";
import { slugifyOrganizationName } from "../../contracts/organization-slug";

export async function createOrganizationWithOwnerCommand(input: {
  name: string;
  ownerId: string;
}): Promise<{ id: string }> {
  return prisma.organization.create({
    data: {
      name: input.name,
      slug: slugifyOrganizationName(input.name),
      members: { create: { userId: input.ownerId, role: ORG_ROLES.OWNER } },
    },
    select: { id: true },
  });
}
