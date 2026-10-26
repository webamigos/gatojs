import { randomBytes } from "node:crypto";
import { project } from "@/shared/config/project";
import { auth } from "@/shared/lib/auth";
import { ORG_ROLES, USER_ROLES } from "@/shared/lib/auth/roles";
import { prisma } from "@/shared/lib/prisma";

export type AdminCreateOptions = {
  email: string;
  password?: string;
  name?: string;
  orgName?: string;
  yes: boolean;
  confirm: (question: string) => Promise<boolean>;
};

export type AdminCreateResult = {
  userId: string;
  organizationId: string;
  createdUser: boolean;
  createdOrganization: boolean;
  generatedPassword: string | null;
};

export function slugifyOrgName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureUser(options: AdminCreateOptions): Promise<{
  userId: string;
  created: boolean;
  generatedPassword: string | null;
}> {
  const existing = await prisma.user.findUnique({
    where: { email: options.email },
  });

  if (!existing) {
    const generatedPassword = options.password
      ? null
      : randomBytes(15).toString("base64url");
    const { user } = await auth.api.createUser({
      body: {
        email: options.email,
        password: (options.password ?? generatedPassword) as string,
        name: options.name ?? options.email.split("@")[0],
        role: USER_ROLES.ADMIN,
        data: { emailVerified: true },
      },
    });
    return { userId: user.id, created: true, generatedPassword };
  }

  if (existing.role !== USER_ROLES.ADMIN) {
    const approved =
      options.yes ||
      (await options.confirm(
        `Użytkownik ${options.email} istnieje. Nadać rolę admin? [t/N]`,
      ));
    if (!approved) {
      throw new Error("Przerwano");
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: USER_ROLES.ADMIN },
    });
  }
  return { userId: existing.id, created: false, generatedPassword: null };
}

async function ensureOrganizationOwner(
  userId: string,
  orgName: string,
): Promise<{ organizationId: string; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    const oldest = await tx.organization.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (!oldest) {
      const organization = await tx.organization.create({
        data: {
          name: orgName,
          slug: slugifyOrgName(orgName),
          members: { create: { userId, role: ORG_ROLES.OWNER } },
        },
      });
      return { organizationId: organization.id, created: true };
    }

    const membership = await tx.member.findFirst({
      where: { organizationId: oldest.id, userId },
    });
    if (!membership) {
      await tx.member.create({
        data: {
          organizationId: oldest.id,
          userId,
          role: ORG_ROLES.OWNER,
        },
      });
    }
    return { organizationId: oldest.id, created: false };
  });
}

export async function adminCreate(
  options: AdminCreateOptions,
): Promise<AdminCreateResult> {
  const user = await ensureUser(options);
  const organization = await ensureOrganizationOwner(
    user.userId,
    options.orgName ?? project.name,
  );
  return {
    userId: user.userId,
    organizationId: organization.organizationId,
    createdUser: user.created,
    createdOrganization: organization.created,
    generatedPassword: user.generatedPassword,
  };
}
