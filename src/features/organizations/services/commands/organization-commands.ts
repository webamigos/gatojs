import { prisma } from "@/shared/lib/prisma";
import { ORG_ROLES } from "@/shared/lib/auth/roles";
import { emitEvent } from "@/shared/lib/events";
import { slugifyOrganizationName } from "../../contracts/organization-slug";

export async function createOrganizationWithOwnerCommand(input: {
  name: string;
  ownerId: string;
}): Promise<{ id: string }> {
  const organization = await prisma.organization.create({
    data: {
      name: input.name,
      slug: slugifyOrganizationName(input.name),
      members: { create: { userId: input.ownerId, role: ORG_ROLES.OWNER } },
    },
    select: { id: true, slug: true },
  });
  await emitEvent(
    { organizationId: organization.id, actorUserId: input.ownerId },
    "organizations.created",
    { name: input.name, slug: organization.slug, ownerUserId: input.ownerId },
  );
  return { id: organization.id };
}
