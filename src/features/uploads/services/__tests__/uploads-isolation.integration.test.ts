import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { currentSession, mockTrackAudit } = vi.hoisted(() => ({
  mockTrackAudit: vi.fn(),
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

import { prisma } from "@/shared/lib/prisma";
import { createUpload } from "../commands/create-upload";
import { deleteObject, getObject } from "../storage";
import {
  createOrganization,
  createSession,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);

interface World {
  alice: { id: string };
  bob: { id: string };
  root: { id: string };
  orgA: { id: string };
  orgB: { id: string };
}

let world: World;
const writtenKeys: string[] = [];

async function signInAs(
  user: { id: string },
  organization: { id: string },
  role = "user",
): Promise<void> {
  const session = await createSession({
    userId: user.id,
    activeOrganizationId: organization.id,
  });
  currentSession.value = {
    user: { id: user.id, role },
    session: { id: session.id, activeOrganizationId: organization.id },
  };
}

async function pngForm(extra: Record<string, string> = {}): Promise<FormData> {
  const png = await sharp({
    create: {
      width: 20,
      height: 20,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set("file", new File([new Uint8Array(png)], "pixel.png"));
  form.set("purpose", "editor-image");
  for (const [name, value] of Object.entries(extra)) {
    form.set(name, value);
  }
  return form;
}

beforeEach(async () => {
  await resetDatabase();
  mockTrackAudit.mockReset();
  mockTrackAudit.mockResolvedValue(undefined);
  currentSession.value = null;
  const alice = await createUser({ email: "alice@example.com" });
  const bob = await createUser({ email: "bob@example.com" });
  const root = await createUser({
    email: "root@example.com",
    role: "superadmin",
  });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: YESTERDAY,
    members: [{ userId: alice.id, role: "member" }],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: YESTERDAY,
    members: [{ userId: bob.id, role: "member" }],
  });
  world = { alice, bob, root, orgA, orgB };
});

afterAll(async () => {
  await Promise.all(writtenKeys.map((key) => deleteObject(key)));
  await prisma.$disconnect();
});

describe("izolacja uploadów między organizacjami", () => {
  it("zapis z kontekstem A tworzy rekord i obiekt tylko w A", async () => {
    await signInAs(world.alice, world.orgA);

    const result = await createUpload(await pngForm());

    expect(result.status).toBe(201);
    const rowsA = await prisma.upload.findMany({
      where: { organizationId: world.orgA.id },
    });
    const rowsB = await prisma.upload.findMany({
      where: { organizationId: world.orgB.id },
    });
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(0);
    expect(rowsA[0]!.uploadedById).toBe(world.alice.id);
    expect(rowsA[0]!.visibility).toBe("PUBLIC");
    expect(rowsA[0]!.key).toBe(
      `orgs/${world.orgA.id}/editor-image/${rowsA[0]!.id}.jpg`,
    );
    writtenKeys.push(rowsA[0]!.key);
    const stored = await getObject(rowsA[0]!.key);
    expect(stored).not.toBeNull();
    expect(stored!.contentType).toBe("image/jpeg");
  });

  it("ignoruje organizationId z formularza i nie zapisuje w B", async () => {
    await signInAs(world.alice, world.orgA);

    const result = await createUpload(
      await pngForm({ organizationId: world.orgB.id }),
    );

    expect(result.status).toBe(201);
    expect(
      await prisma.upload.count({ where: { organizationId: world.orgB.id } }),
    ).toBe(0);
    const rows = await prisma.upload.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.organizationId).toBe(world.orgA.id);
    writtenKeys.push(rows[0]!.key);
  });

  it("upload B nie zmienia rekordów A", async () => {
    await signInAs(world.alice, world.orgA);
    await createUpload(await pngForm());
    await signInAs(world.bob, world.orgB);

    const result = await createUpload(await pngForm());

    expect(result.status).toBe(201);
    expect(
      await prisma.upload.count({ where: { organizationId: world.orgA.id } }),
    ).toBe(1);
    const rowsB = await prisma.upload.findMany({
      where: { organizationId: world.orgB.id },
    });
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]!.key.startsWith(`orgs/${world.orgB.id}/`)).toBe(true);
    const all = await prisma.upload.findMany();
    writtenKeys.push(...all.map((row) => row.key));
  });

  it("superadmin w trybie serwisowym bez potwierdzenia nie tworzy rekordu", async () => {
    await signInAs(world.root, world.orgA, "superadmin");

    const result = await createUpload(await pngForm());

    expect(result.status).toBe(403);
    expect(await prisma.upload.count()).toBe(0);
  });

  it("superadmin z potwierdzeniem A zapisuje tylko w A", async () => {
    await signInAs(world.root, world.orgA, "superadmin");

    const result = await createUpload(
      await pngForm({
        serviceModeConfirmation: JSON.stringify({
          serviceModeConfirmed: true,
          organizationId: world.orgA.id,
        }),
      }),
    );

    expect(result.status).toBe(201);
    const rows = await prisma.upload.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.organizationId).toBe(world.orgA.id);
    writtenKeys.push(rows[0]!.key);
  });

  it("usunięcie organizacji kasuje jej rekordy uploadów", async () => {
    await signInAs(world.alice, world.orgA);
    await createUpload(await pngForm());
    const [row] = await prisma.upload.findMany();
    writtenKeys.push(row!.key);

    await prisma.organization.delete({ where: { id: world.orgA.id } });

    expect(await prisma.upload.count()).toBe(0);
  });
});
