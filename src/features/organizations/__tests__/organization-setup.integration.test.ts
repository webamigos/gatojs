import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { registry } = vi.hoisted(() => ({
  registry: {
    subscribers: [] as unknown[],
    setups: [] as unknown[],
  },
}));

vi.mock("@/modules.generated", () => ({
  moduleEvents: [],
  moduleSubscribers: registry.subscribers,
  get moduleSetups() {
    return registry.setups;
  },
}));

import { prisma } from "@/shared/lib/prisma";
import { createUser, resetDatabase } from "@/test/integration/database";
import { createOrganizationWithOwnerCommand } from "../services/commands/organization-commands";
import { subscribers } from "../subscribers";

registry.subscribers.push({ module: "organizations", value: subscribers });

let owner: { id: string };
let hookCalls: string[];

function notesSetup(
  hook: (context: { organizationId: string }) => Promise<void> | void,
) {
  return [
    {
      module: "notes",
      version: "1.2.0",
      value: { onOrganizationCreated: hook },
    },
  ];
}

async function rowsOf(organizationId: string) {
  return prisma.organizationModuleSetup.findMany({
    where: { organizationId },
    select: { organizationId: true, moduleKey: true, moduleVersion: true },
  });
}

beforeEach(async () => {
  await resetDatabase();
  hookCalls = [];
  owner = await createUser({ email: "owner@a.example" });
  registry.setups = notesSetup((context) => {
    hookCalls.push(context.organizationId);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createOrganizationWithOwnerCommand runs organization setup", () => {
  it("a new organization gets exactly one notes row with the module version", async () => {
    const { id } = await createOrganizationWithOwnerCommand({
      name: "Acme",
      ownerId: owner.id,
    });

    expect(hookCalls).toEqual([id]);
    expect(await rowsOf(id)).toEqual([
      { organizationId: id, moduleKey: "notes", moduleVersion: "1.2.0" },
    ]);
  });

  it("a second organization gets its own row and leaves the first one's row alone", async () => {
    const first = await createOrganizationWithOwnerCommand({
      name: "Acme",
      ownerId: owner.id,
    });
    const firstRows = await prisma.organizationModuleSetup.findMany({
      where: { organizationId: first.id },
    });

    const second = await createOrganizationWithOwnerCommand({
      name: "Beta",
      ownerId: owner.id,
    });

    expect(hookCalls).toEqual([first.id, second.id]);
    expect(
      await prisma.organizationModuleSetup.findMany({
        where: { organizationId: first.id },
      }),
    ).toEqual(firstRows);
    expect(await rowsOf(second.id)).toEqual([
      { organizationId: second.id, moduleKey: "notes", moduleVersion: "1.2.0" },
    ]);
  });

  it("a failing setup still creates the organization and writes no row", async () => {
    registry.setups = notesSetup(async () => {
      throw new Error("notes setup broke");
    });

    const { id } = await createOrganizationWithOwnerCommand({
      name: "Acme",
      ownerId: owner.id,
    });

    expect(
      await prisma.organization.findUnique({
        where: { id },
        select: { name: true },
      }),
    ).toEqual({ name: "Acme" });
    expect(
      await prisma.member.findMany({
        where: { organizationId: id },
        select: { userId: true, role: true },
      }),
    ).toEqual([{ userId: owner.id, role: "owner" }]);
    expect(await rowsOf(id)).toEqual([]);
  });

  it("an organization whose setup failed is listed by setup:organizations and can be repaired", async () => {
    registry.setups = notesSetup(async () => {
      throw new Error("notes setup broke");
    });
    const { id } = await createOrganizationWithOwnerCommand({
      name: "Acme",
      ownerId: owner.id,
    });
    registry.setups = notesSetup((context) => {
      hookCalls.push(context.organizationId);
    });
    const { runMissingOrganizationSetups } =
      await import("@/shared/lib/modules/setup");

    const result = await runMissingOrganizationSetups({ module: "notes" });

    expect(result).toStrictEqual({
      ran: [{ organizationId: id, module: "notes" }],
      failed: [],
    });
    expect(await rowsOf(id)).toHaveLength(1);
  });
});
