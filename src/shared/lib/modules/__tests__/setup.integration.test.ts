import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules.generated", () => ({
  moduleEvents: [],
  moduleSubscribers: [],
  moduleSetups: [],
}));

import { prisma } from "@/shared/lib/prisma";
import { TenantScopeError } from "@/shared/lib/tenant-scope";
import {
  createOrganization,
  createUser,
  resetDatabase,
} from "@/test/integration/database";
import {
  OrganizationSetupError,
  missingOrganizationSetups,
  runMissingOrganizationSetups,
  runOrganizationSetup,
  type ModuleSetupEntry,
} from "../setup";

const EARLIER = new Date("2026-03-01T08:00:00.000Z");

let orgA: { id: string };
let orgB: { id: string };
let hookCalls: string[];

function notesEntry(
  hook: (context: { organizationId: string }) => Promise<void> | void = (
    context,
  ) => {
    hookCalls.push(context.organizationId);
  },
): ModuleSetupEntry {
  return {
    module: "notes",
    version: "1.2.0",
    value: { onOrganizationCreated: hook },
  };
}

async function rowsOf(organizationId: string) {
  return prisma.organizationModuleSetup.findMany({
    where: { organizationId },
    select: { moduleKey: true, moduleVersion: true, finishedAt: true },
    orderBy: { moduleKey: "asc" },
  });
}

async function recordRow(
  organizationId: string,
  moduleKey: string,
): Promise<void> {
  await prisma.organizationModuleSetup.create({
    data: {
      organizationId,
      moduleKey,
      moduleVersion: "0.9.0",
      finishedAt: EARLIER,
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  hookCalls = [];
  const alice = await createUser({ email: "alice@a.example" });
  const bob = await createUser({ email: "bob@b.example" });
  orgA = await createOrganization({
    name: "Org A",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    members: [{ userId: alice.id, role: "owner" }],
  });
  orgB = await createOrganization({
    name: "Org B",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    members: [{ userId: bob.id, role: "owner" }],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("runOrganizationSetup on two organizations", () => {
  it("runs for org B although org A already has a row for notes", async () => {
    await recordRow(orgA.id, "notes");

    const result = await runOrganizationSetup(orgB.id, {
      hook: "onOrganizationCreated",
      modules: [notesEntry()],
    });

    expect(result).toStrictEqual({ ran: ["notes"], skipped: [], failed: [] });
    expect(hookCalls).toEqual([orgB.id]);
    expect(
      (await rowsOf(orgB.id)).map(({ moduleKey, moduleVersion }) => ({
        moduleKey,
        moduleVersion,
      })),
    ).toEqual([{ moduleKey: "notes", moduleVersion: "1.2.0" }]);
  });

  it("setting up org B leaves org A's rows unchanged", async () => {
    await recordRow(orgA.id, "notes");
    await recordRow(orgA.id, "tasks");
    const before = await rowsOf(orgA.id);

    await runOrganizationSetup(orgB.id, {
      hook: "onOrganizationCreated",
      modules: [
        notesEntry(),
        {
          module: "tasks",
          version: "2.0.0",
          value: { onOrganizationCreated: () => undefined },
        },
      ],
    });

    expect(await rowsOf(orgA.id)).toEqual(before);
    expect(before).toEqual([
      { moduleKey: "notes", moduleVersion: "0.9.0", finishedAt: EARLIER },
      { moduleKey: "tasks", moduleVersion: "0.9.0", finishedAt: EARLIER },
    ]);
  });

  it("an organization with its own row is skipped and keeps its row", async () => {
    await recordRow(orgA.id, "notes");

    const result = await runOrganizationSetup(orgA.id, {
      hook: "onOrganizationCreated",
      modules: [notesEntry()],
    });

    expect(result).toStrictEqual({ ran: [], skipped: ["notes"], failed: [] });
    expect(hookCalls).toEqual([]);
    expect(await rowsOf(orgA.id)).toEqual([
      { moduleKey: "notes", moduleVersion: "0.9.0", finishedAt: EARLIER },
    ]);
  });

  it("a failing hook leaves no row in the database", async () => {
    const result = await runOrganizationSetup(orgB.id, {
      hook: "onOrganizationCreated",
      modules: [
        notesEntry(async () => {
          throw new Error("notes setup broke");
        }),
      ],
    });

    expect(result).toStrictEqual({ ran: [], skipped: [], failed: ["notes"] });
    expect(await rowsOf(orgB.id)).toEqual([]);
  });

  it("seed writes no row", async () => {
    const seeds: string[] = [];

    await runOrganizationSetup(orgB.id, {
      hook: "seed",
      modules: [
        {
          module: "notes",
          version: "1.2.0",
          value: {
            seed: (context) => {
              seeds.push(context.organizationId);
            },
          },
        },
      ],
    });

    expect(seeds).toEqual([orgB.id]);
    expect(await rowsOf(orgB.id)).toEqual([]);
  });

  it("deleting an organization deletes its rows and keeps the other organization's", async () => {
    await recordRow(orgA.id, "notes");
    await recordRow(orgB.id, "notes");

    await prisma.organization.delete({ where: { id: orgB.id } });

    expect(await rowsOf(orgB.id)).toEqual([]);
    expect(await rowsOf(orgA.id)).toHaveLength(1);
  });
});

describe("missingOrganizationSetups and runMissingOrganizationSetups on two organizations", () => {
  it("the tenant-scope guard covers the setup rows", async () => {
    await expect(
      prisma.organizationModuleSetup.findMany({}),
    ).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("lists only org B for notes when org A has its row, through the guarded client", async () => {
    await recordRow(orgA.id, "notes");

    await expect(
      missingOrganizationSetups({ module: "notes", modules: [notesEntry()] }),
    ).resolves.toStrictEqual([{ organizationId: orgB.id, module: "notes" }]);
  });

  it("--module notes runs only org B, and a second run runs nothing", async () => {
    await recordRow(orgA.id, "notes");
    const modules = [notesEntry()];

    const first = await runMissingOrganizationSetups({
      module: "notes",
      modules,
    });
    const second = await runMissingOrganizationSetups({
      module: "notes",
      modules,
    });

    expect(first).toStrictEqual({
      ran: [{ organizationId: orgB.id, module: "notes" }],
      failed: [],
    });
    expect(second).toStrictEqual({ ran: [], failed: [] });
    expect(hookCalls).toEqual([orgB.id]);
    expect(await rowsOf(orgA.id)).toEqual([
      { moduleKey: "notes", moduleVersion: "0.9.0", finishedAt: EARLIER },
    ]);
    expect(
      (await rowsOf(orgB.id)).map(({ moduleVersion }) => moduleVersion),
    ).toEqual(["1.2.0"]);
  });

  it("lists organizations oldest first, then by id", async () => {
    const carol = await createUser({ email: "carol@c.example" });
    const orgC = await createOrganization({
      name: "Org C",
      createdAt: new Date("2025-12-01T00:00:00.000Z"),
      members: [{ userId: carol.id, role: "owner" }],
    });

    const pairs = await missingOrganizationSetups({ modules: [notesEntry()] });

    expect(pairs.map((pair) => pair.organizationId)).toEqual([
      orgC.id,
      orgA.id,
      orgB.id,
    ]);
  });

  it("organizations created at the same time come in id order", async () => {
    const sameTime = new Date("2026-04-01T00:00:00.000Z");
    const dave = await createUser({ email: "dave@d.example" });
    const erin = await createUser({ email: "erin@e.example" });
    const orgD = await createOrganization({
      name: "Org D",
      createdAt: sameTime,
      members: [{ userId: dave.id, role: "owner" }],
    });
    const orgE = await createOrganization({
      name: "Org E",
      createdAt: sameTime,
      members: [{ userId: erin.id, role: "owner" }],
    });
    const [lower, higher] = [orgD.id, orgE.id].sort();

    const pairs = await missingOrganizationSetups({
      modules: [notesEntry()],
    });

    expect(pairs.map((pair) => pair.organizationId).slice(2)).toEqual([
      lower,
      higher,
    ]);
  });

  it("an organization filter lists only that organization", async () => {
    await expect(
      missingOrganizationSetups({
        organizationId: orgA.id,
        modules: [notesEntry()],
      }),
    ).resolves.toStrictEqual([{ organizationId: orgA.id, module: "notes" }]);
  });

  it("an unknown organization throws OrganizationSetupError", async () => {
    await expect(
      missingOrganizationSetups({
        organizationId: "org-x",
        modules: [notesEntry()],
      }),
    ).rejects.toThrow(
      new OrganizationSetupError("Organization org-x not found"),
    );
  });
});
