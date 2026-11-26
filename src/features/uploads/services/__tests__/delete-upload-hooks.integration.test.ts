import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisteredCommandHook } from "@/shared/lib/commands/define-command";

const { currentSession, mockTrackAudit, hookStore } = vi.hoisted(() => ({
  mockTrackAudit: vi.fn(),
  hookStore: { entries: [] as RegisteredCommandHook[] },
  currentSession: {
    value: null as null | {
      user: { id: string; role: string };
      session: { id: string; activeOrganizationId: string | null };
    },
  },
}));

vi.mock("@/shared/lib/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/audit")>()),
  trackAudit: (event: unknown) => mockTrackAudit(event),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/shared/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => currentSession.value) } },
}));
vi.mock("@/modules.generated", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules.generated")>()),
  moduleCommandHooks: hookStore.entries,
}));

import { prisma } from "@/shared/lib/prisma";
import { withoutTenantScope } from "@/shared/lib/tenant-scope";
import { deleteUploadCommand } from "../commands/upload-commands";
import { deleteObject, getObject, putObject } from "../storage";
import {
  createOrganization,
  createSession,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);
const PAYLOAD = new Uint8Array([1, 2, 3, 4]);

interface World {
  alice: { id: string };
  bob: { id: string };
  orgA: { id: string };
  orgB: { id: string };
}

let world: World;
const writtenKeys: string[] = [];

async function signInAs(
  user: { id: string },
  organization: { id: string },
): Promise<void> {
  const session = await createSession({
    userId: user.id,
    activeOrganizationId: organization.id,
  });
  currentSession.value = {
    user: { id: user.id, role: "user" },
    session: { id: session.id, activeOrganizationId: organization.id },
  };
}

async function seedUpload(input: {
  organizationId: string;
  uploadedById: string;
}): Promise<{ id: string; key: string }> {
  const id = randomUUID();
  const key = `orgs/${input.organizationId}/test/${id}.bin`;
  await putObject(key, PAYLOAD, "application/pdf");
  writtenKeys.push(key);
  await prisma.upload.create({
    data: {
      id,
      organizationId: input.organizationId,
      uploadedById: input.uploadedById,
      purpose: "test",
      key,
      fileName: "raport.pdf",
      mimeType: "application/pdf",
      size: PAYLOAD.length,
      visibility: "ORGANIZATION",
    },
  });
  return { id, key };
}

function swapTo(id: string): void {
  hookStore.entries.push({
    module: "uploads",
    command: "uploads.delete",
    hook: { id: "uploads.test-swap", before: () => ({ id }) },
  });
}

async function uploadIds(): Promise<string[]> {
  const rows = await withoutTenantScope("test assertion", () =>
    prisma.upload.findMany({ select: { id: true } }),
  );
  return rows.map((row) => row.id).sort();
}

beforeEach(async () => {
  await resetDatabase();
  hookStore.entries.length = 0;
  mockTrackAudit.mockReset();
  mockTrackAudit.mockResolvedValue(undefined);
  currentSession.value = null;
  const alice = await createUser({ email: "alice@example.com" });
  const bob = await createUser({ email: "bob@example.com" });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: YESTERDAY,
    members: [{ userId: alice.id, role: "owner" }],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: YESTERDAY,
    members: [{ userId: bob.id, role: "owner" }],
  });
  world = { alice, bob, orgA, orgB };
});

afterAll(async () => {
  await Promise.all(writtenKeys.map((key) => deleteObject(key)));
  await prisma.$disconnect();
});

describe("deleteUploadCommand before hooks on the database", () => {
  it("a hook returning org B's upload id under org A's context fails and keeps org B's row and object", async () => {
    const own = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
    });
    const foreign = await seedUpload({
      organizationId: world.orgB.id,
      uploadedById: world.bob.id,
    });
    swapTo(foreign.id);
    await signInAs(world.alice, world.orgA);

    const result = await deleteUploadCommand({ id: own.id });

    expect(result).toEqual({
      success: false,
      error: "Nie udało się usunąć pliku",
    });
    expect(
      await prisma.upload.count({
        where: { id: foreign.id, organizationId: world.orgB.id },
      }),
    ).toBe(1);
    expect(await getObject(foreign.key)).not.toBeNull();
    expect(await uploadIds()).toEqual([own.id, foreign.id].sort());
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("a hook returning another upload id of org A deletes that upload, not the requested one", async () => {
    const requested = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
    });
    const target = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
    });
    const foreign = await seedUpload({
      organizationId: world.orgB.id,
      uploadedById: world.bob.id,
    });
    swapTo(target.id);
    await signInAs(world.alice, world.orgA);

    const result = await deleteUploadCommand({ id: requested.id });

    expect(result).toEqual({ success: true });
    expect(await uploadIds()).toEqual([requested.id, foreign.id].sort());
    expect(await getObject(target.key)).toBeNull();
    expect(await getObject(requested.key)).not.toBeNull();
  });

  it("without hooks the owner of org A deletes the requested upload and org B's stays", async () => {
    const own = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
    });
    const foreign = await seedUpload({
      organizationId: world.orgB.id,
      uploadedById: world.bob.id,
    });
    await signInAs(world.alice, world.orgA);

    const result = await deleteUploadCommand({ id: own.id });

    expect(result).toEqual({ success: true });
    expect(await uploadIds()).toEqual([foreign.id]);
  });
});
