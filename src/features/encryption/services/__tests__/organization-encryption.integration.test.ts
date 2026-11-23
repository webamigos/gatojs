import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/prisma";
import {
  createOrganization,
  createUser,
  resetDatabase,
} from "@/test/integration/database";
import {
  decryptForOrganization,
  encryptForOrganization,
  OrganizationDataKeyMissingError,
} from "../organization-encryption";

interface World {
  orgA: { id: string };
  orgB: { id: string };
}

let world: World;

async function dataKeyRows(organizationId: string) {
  return prisma.organizationDataKey.findMany({
    where: { organizationId },
    select: { organizationId: true, wrappedKey: true },
  });
}

beforeEach(async () => {
  await resetDatabase();
  const alice = await createUser({ email: "alice@a.example" });
  const bob = await createUser({ email: "bob@b.example" });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [{ userId: alice.id, role: "owner" }],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    members: [{ userId: bob.id, role: "owner" }],
  });
  world = { orgA, orgB };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("organization encryption on a real database", () => {
  it("stores one data key row per organization on first use", async () => {
    const ciphertextA = await encryptForOrganization(world.orgA.id, "alpha");
    const ciphertextB = await encryptForOrganization(world.orgB.id, "beta");

    const rowsA = await dataKeyRows(world.orgA.id);
    const rowsB = await dataKeyRows(world.orgB.id);
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0]?.wrappedKey).not.toBe(rowsB[0]?.wrappedKey);
    await expect(
      decryptForOrganization(world.orgA.id, ciphertextA),
    ).resolves.toBe("alpha");
    await expect(
      decryptForOrganization(world.orgB.id, ciphertextB),
    ).resolves.toBe("beta");
  });

  it("keeps one row per organization across repeated encryptions", async () => {
    await encryptForOrganization(world.orgA.id, "one");
    const [before] = await dataKeyRows(world.orgA.id);
    await encryptForOrganization(world.orgA.id, "two");

    const after = await dataKeyRows(world.orgA.id);
    expect(after).toEqual([before]);
  });

  it("does not decrypt orgA's ciphertext with orgB's key", async () => {
    const ciphertextA = await encryptForOrganization(world.orgA.id, "alpha");
    await encryptForOrganization(world.orgB.id, "beta");

    await expect(
      decryptForOrganization(world.orgB.id, ciphertextA),
    ).rejects.toThrow();
  });

  it("decrypting for an organization without a key fails and creates no row", async () => {
    const ciphertextA = await encryptForOrganization(world.orgA.id, "alpha");

    await expect(
      decryptForOrganization(world.orgB.id, ciphertextA),
    ).rejects.toBeInstanceOf(OrganizationDataKeyMissingError);
    expect(await dataKeyRows(world.orgB.id)).toEqual([]);
    expect(await dataKeyRows(world.orgA.id)).toHaveLength(1);
  });

  it("never reads orgA's row for orgB: orgB keeps working after orgA's key is corrupted", async () => {
    await encryptForOrganization(world.orgA.id, "alpha");
    const ciphertextB = await encryptForOrganization(world.orgB.id, "beta");
    await prisma.organizationDataKey.update({
      where: { organizationId: world.orgA.id },
      data: { wrappedKey: Buffer.alloc(60, 1).toString("base64") },
    });

    await expect(
      decryptForOrganization(world.orgB.id, ciphertextB),
    ).resolves.toBe("beta");
    const fresh = await encryptForOrganization(world.orgB.id, "gamma");
    await expect(decryptForOrganization(world.orgB.id, fresh)).resolves.toBe(
      "gamma",
    );
    await expect(
      encryptForOrganization(world.orgA.id, "alpha again"),
    ).rejects.toThrow();
  });

  it("removing orgA's key leaves orgB's content readable and orgA's unreadable", async () => {
    const ciphertextA = await encryptForOrganization(world.orgA.id, "alpha");
    const ciphertextB = await encryptForOrganization(world.orgB.id, "beta");
    await prisma.organizationDataKey.delete({
      where: { organizationId: world.orgA.id },
    });

    await expect(
      decryptForOrganization(world.orgB.id, ciphertextB),
    ).resolves.toBe("beta");
    await expect(
      decryptForOrganization(world.orgA.id, ciphertextA),
    ).rejects.toBeInstanceOf(OrganizationDataKeyMissingError);
    expect(await dataKeyRows(world.orgA.id)).toEqual([]);
  });

  it("orgB without a key fails the same way whether or not orgA has one", async () => {
    await expect(
      decryptForOrganization(world.orgB.id, "AAAA"),
    ).rejects.toBeInstanceOf(OrganizationDataKeyMissingError);
    await encryptForOrganization(world.orgA.id, "alpha");

    await expect(
      decryptForOrganization(world.orgB.id, "AAAA"),
    ).rejects.toBeInstanceOf(OrganizationDataKeyMissingError);
  });

  it("concurrent first encryptions for one organization leave one row and both decrypt", async () => {
    const [first, second] = await Promise.all([
      encryptForOrganization(world.orgA.id, "first"),
      encryptForOrganization(world.orgA.id, "second"),
    ]);

    expect(await dataKeyRows(world.orgA.id)).toHaveLength(1);
    await expect(decryptForOrganization(world.orgA.id, first)).resolves.toBe(
      "first",
    );
    await expect(decryptForOrganization(world.orgA.id, second)).resolves.toBe(
      "second",
    );
  });

  it("deleting an organization removes its data key", async () => {
    await encryptForOrganization(world.orgA.id, "alpha");
    await encryptForOrganization(world.orgB.id, "beta");

    await prisma.organization.delete({ where: { id: world.orgA.id } });

    expect(await dataKeyRows(world.orgA.id)).toEqual([]);
    expect(await dataKeyRows(world.orgB.id)).toHaveLength(1);
  });
});
