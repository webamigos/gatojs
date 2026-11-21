import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/mailer", () => ({
  sendOrganizationInvitationEmail: vi.fn(async () => undefined),
  sendPasswordResetEmail: vi.fn(async () => undefined),
}));

import { auth } from "@/shared/lib/auth";
import { prisma } from "@/shared/lib/prisma";
import {
  createOrganization,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

const PASSWORD = "Haslo-testowe-123!";

let world: { alice: { id: string }; orgA: { id: string } };

beforeEach(async () => {
  await resetDatabase();
  const alice = await createUser({ email: "alice@a.example" });
  await prisma.account.create({
    data: {
      userId: alice.id,
      accountId: alice.id,
      providerId: "credential",
      password: await hashPassword(PASSWORD),
    },
  });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [{ userId: alice.id, role: "owner" }],
  });
  await createOrganization({
    name: "Org B",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    members: [],
  });
  world = { alice, orgA };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("logowanie przez better-auth na kliencie z guardem organizacji", () => {
  it("signInEmail z poprawnym hasłem tworzy sesję z aktywną organizacją użytkownika", async () => {
    const result = await auth.api.signInEmail({
      body: { email: "alice@a.example", password: PASSWORD },
    });

    expect(result.user.id).toBe(world.alice.id);
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: world.alice.id },
      select: { activeOrganizationId: true },
    });
    expect(session.activeOrganizationId).toBe(world.orgA.id);
  });

  it("signInEmail ze złym hasłem jest odrzucone i nie tworzy sesji", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: "alice@a.example", password: "zle-haslo-123" },
      }),
    ).rejects.toThrow();

    expect(
      await prisma.session.count({ where: { userId: world.alice.id } }),
    ).toBe(0);
  });
});
