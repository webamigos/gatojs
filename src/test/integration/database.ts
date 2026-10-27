import { prisma } from "@/shared/lib/prisma";
import { assertTestDatabase } from "./database-url";

const TABLES = [
  "invitations",
  "members",
  "organizations",
  "sessions",
  "accounts",
  "verifications",
  "users",
];

export async function resetDatabase(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL ?? "");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export async function createUser(input: {
  email: string;
  role?: "user" | "admin";
}): Promise<{ id: string; email: string }> {
  return prisma.user.create({
    data: {
      email: input.email,
      name: input.email.split("@")[0] ?? input.email,
      emailVerified: true,
      role: input.role ?? "user",
    },
    select: { id: true, email: true },
  });
}

export async function createOrganization(input: {
  name: string;
  createdAt: Date;
  members: Array<{ userId: string; role: "owner" | "admin" | "member" }>;
}): Promise<{ id: string }> {
  return prisma.organization.create({
    data: {
      name: input.name,
      slug: input.name.toLowerCase().replaceAll(" ", "-"),
      createdAt: input.createdAt,
      members: { create: input.members },
    },
    select: { id: true },
  });
}

export async function createInvitation(input: {
  organizationId: string;
  inviterId: string;
  email: string;
  role?: "owner" | "admin" | "member";
  status?: "pending" | "accepted" | "canceled";
  expiresAt: Date;
}): Promise<{ id: string }> {
  return prisma.invitation.create({
    data: {
      organizationId: input.organizationId,
      inviterId: input.inviterId,
      email: input.email,
      role: input.role ?? "member",
      status: input.status ?? "pending",
      expiresAt: input.expiresAt,
    },
    select: { id: true },
  });
}
