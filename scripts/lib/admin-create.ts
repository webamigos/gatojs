import { randomBytes } from "node:crypto";
import { project } from "@/shared/config/project";
import { auth } from "@/shared/lib/auth";
import { ORG_ROLES, USER_ROLES } from "@/shared/lib/auth/roles";
import { roleFromStored } from "@/shared/lib/auth/admin-guard";
import { emitEvent } from "@/shared/lib/events";
import { prisma } from "@/shared/lib/prisma";

export type GlobalAdminRole = "admin" | "superadmin";

export type AdminCreateOptions = {
  email: string;
  role?: GlobalAdminRole;
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

export class AdminCreateError extends Error {
  constructor(
    message: string,
    readonly generatedPassword: string | null,
  ) {
    super(message);
    this.name = "AdminCreateError";
  }
}

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

const GLOBAL_ADMIN_ROLES: readonly string[] = [
  USER_ROLES.ADMIN,
  USER_ROLES.SUPERADMIN,
];

const ROLE_RANK: Record<string, number> = {
  [USER_ROLES.ADMIN]: 1,
  [USER_ROLES.SUPERADMIN]: 2,
};

function assertKnownRole(role: string): asserts role is GlobalAdminRole {
  if (!GLOBAL_ADMIN_ROLES.includes(role)) {
    throw new Error(
      `Unknown role: ${role} (allowed: ${GLOBAL_ADMIN_ROLES.join(", ")})`,
    );
  }
}

async function ensureUser(
  options: AdminCreateOptions & { role: GlobalAdminRole },
): Promise<{
  userId: string;
  created: boolean;
  generatedPassword: string | null;
}> {
  const existing = await prisma.user.findUnique({
    where: { email: options.email },
  });

  if (!existing) {
    const providedPassword = options.password?.trim() ? options.password : null;
    const generatedPassword = providedPassword
      ? null
      : randomBytes(15).toString("base64url");
    const { user } = await auth.api.createUser({
      body: {
        email: options.email,
        password: (providedPassword ?? generatedPassword) as string,
        name: options.name ?? options.email.split("@")[0],
        role: options.role,
        data: { emailVerified: true },
      },
    });
    return { userId: user.id, created: true, generatedPassword };
  }

  if (
    (ROLE_RANK[roleFromStored(existing.role)] ?? 0) < ROLE_RANK[options.role]
  ) {
    const approved =
      options.yes ||
      (await options.confirm(
        `User ${options.email} already exists. Grant role ${options.role}? [y/N]`,
      ));
    if (!approved) {
      throw new Error("Aborted");
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: options.role },
    });
  }
  return { userId: existing.id, created: false, generatedPassword: null };
}

type OwnedOrganization =
  | { organizationId: string; created: false }
  | { organizationId: string; created: true; name: string; slug: string };

async function emitOrganizationCreated(
  userId: string,
  organization: OwnedOrganization,
): Promise<void> {
  if (!organization.created) {
    return;
  }
  await emitEvent(
    { organizationId: organization.organizationId, actorUserId: userId },
    "organizations.created",
    { name: organization.name, slug: organization.slug, ownerUserId: userId },
  );
}

async function ensureOrganizationOwner(
  userId: string,
  orgName: string,
): Promise<OwnedOrganization> {
  return prisma.$transaction(async (tx) => {
    const oldest = await tx.organization.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (!oldest) {
      const organization = await tx.organization.create({
        data: {
          name: orgName,
          slug: slugifyOrgName(orgName) || project.slug,
          members: { create: { userId, role: ORG_ROLES.OWNER } },
        },
      });
      return {
        organizationId: organization.id,
        name: organization.name,
        slug: organization.slug,
        created: true,
      };
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
  rawOptions: AdminCreateOptions,
): Promise<AdminCreateResult> {
  const role = rawOptions.role ?? USER_ROLES.ADMIN;
  assertKnownRole(role);
  const options = {
    ...rawOptions,
    role,
    email: rawOptions.email.toLowerCase(),
  };
  const user = await ensureUser(options);
  try {
    const organization = await ensureOrganizationOwner(
      user.userId,
      options.orgName ?? project.name,
    );
    await emitOrganizationCreated(user.userId, organization);
    return {
      userId: user.userId,
      organizationId: organization.organizationId,
      createdUser: user.created,
      createdOrganization: organization.created,
      generatedPassword: user.generatedPassword,
    };
  } catch (error) {
    if (user.generatedPassword) {
      throw new AdminCreateError(
        error instanceof Error ? error.message : String(error),
        user.generatedPassword,
      );
    }
    throw error;
  }
}
