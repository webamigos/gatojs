import { randomUUID } from "node:crypto";
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
import { readUploadForDownload } from "../read-upload";
import { deleteUploadCommand } from "../../commands/upload-commands";
import { deleteObject, getObject, putObject } from "../../storage";
import {
  createOrganization,
  createSession,
  createUser,
  resetDatabase,
} from "@/test/integration/database";

const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);
const PAYLOAD = new Uint8Array([10, 20, 30, 40, 50]);

interface World {
  alice: { id: string };
  bob: { id: string };
  both: { id: string };
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

async function seedUpload(input: {
  organizationId: string;
  uploadedById: string | null;
  visibility: "PUBLIC" | "ORGANIZATION";
  fileName?: string;
  mimeType?: string;
  withObject?: boolean;
}): Promise<{ id: string; key: string }> {
  const id = randomUUID();
  const key = `orgs/${input.organizationId}/test/${id}.bin`;
  if (input.withObject !== false) {
    await putObject(key, PAYLOAD, input.mimeType ?? "application/pdf");
    writtenKeys.push(key);
  }
  await prisma.upload.create({
    data: {
      id,
      organizationId: input.organizationId,
      uploadedById: input.uploadedById,
      purpose: "test",
      key,
      fileName: input.fileName ?? "raport.pdf",
      mimeType: input.mimeType ?? "application/pdf",
      size: PAYLOAD.length,
      visibility: input.visibility,
    },
  });
  return { id, key };
}

beforeEach(async () => {
  await resetDatabase();
  mockTrackAudit.mockReset();
  mockTrackAudit.mockResolvedValue(undefined);
  currentSession.value = null;
  const alice = await createUser({ email: "alice@example.com" });
  const bob = await createUser({ email: "bob@example.com" });
  const both = await createUser({ email: "both@example.com" });
  const root = await createUser({
    email: "root@example.com",
    role: "superadmin",
  });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: YESTERDAY,
    members: [
      { userId: alice.id, role: "member" },
      { userId: both.id, role: "member" },
    ],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: YESTERDAY,
    members: [
      { userId: bob.id, role: "member" },
      { userId: both.id, role: "member" },
    ],
  });
  world = { alice, bob, both, root, orgA, orgB };
});

afterAll(async () => {
  await Promise.all(writtenKeys.map((key) => deleteObject(key)));
  await prisma.$disconnect();
});

describe("readUploadForDownload na bazie i storage", () => {
  it("plik PUBLIC bez sesji daje 200 z bajtami i nagłówkami z rekordu", async () => {
    const upload = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
      visibility: "PUBLIC",
      fileName: "logo.png",
      mimeType: "image/png",
    });

    const result = await readUploadForDownload(upload.id);

    expect(result).toEqual({
      status: 200,
      body: PAYLOAD,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition":
          "inline; filename=\"logo.png\"; filename*=UTF-8''logo.png",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });

  it("plik ORGANIZATION bez sesji daje 404", async () => {
    const upload = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
      visibility: "ORGANIZATION",
    });

    expect(await readUploadForDownload(upload.id)).toEqual({ status: 404 });
  });

  it("plik ORGANIZATION z aktywną organizacją pliku daje 200 z prywatnym cache", async () => {
    const upload = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
      visibility: "ORGANIZATION",
    });
    await signInAs(world.alice, world.orgA);

    const result = await readUploadForDownload(upload.id);

    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body).toEqual(PAYLOAD);
      expect(result.headers["Cache-Control"]).toBe("private, max-age=300");
      expect(result.headers["X-Content-Type-Options"]).toBe("nosniff");
    }
  });

  it("członek obu organizacji z aktywną B dostaje 404 dla pliku ORGANIZATION z A", async () => {
    const upload = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
      visibility: "ORGANIZATION",
    });
    await signInAs(world.both, world.orgB);

    expect(await readUploadForDownload(upload.id)).toEqual({ status: 404 });
  });

  it("ten sam członek z aktywną A dostaje 200 dla tego samego pliku", async () => {
    const upload = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
      visibility: "ORGANIZATION",
    });
    await signInAs(world.both, world.orgA);

    const result = await readUploadForDownload(upload.id);

    expect(result.status).toBe(200);
  });

  it("użytkownik z usuniętym członkostwem w organizacji pliku dostaje 404 mimo aktywnej organizacji w sesji", async () => {
    const upload = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
      visibility: "ORGANIZATION",
    });
    await signInAs(world.alice, world.orgA);
    await prisma.member.deleteMany({
      where: { userId: world.alice.id, organizationId: world.orgA.id },
    });

    expect(await readUploadForDownload(upload.id)).toEqual({ status: 404 });
  });

  it("użytkownik organizacji B nie czyta pliku ORGANIZATION organizacji A", async () => {
    const upload = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
      visibility: "ORGANIZATION",
    });
    await signInAs(world.bob, world.orgB);

    expect(await readUploadForDownload(upload.id)).toEqual({ status: 404 });
  });

  it("superadmin w trybie serwisowym A czyta plik A, a z aktywną B dostaje 404", async () => {
    const upload = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
      visibility: "ORGANIZATION",
    });
    await signInAs(world.root, world.orgA, "superadmin");
    const inside = await readUploadForDownload(upload.id);
    await signInAs(world.root, world.orgB, "superadmin");
    const outside = await readUploadForDownload(upload.id);

    expect(inside.status).toBe(200);
    expect(outside).toEqual({ status: 404 });
  });

  it("zwraca 404 dla id spoza uuid i dla nieistniejącego uuid", async () => {
    expect(await readUploadForDownload("nie-uuid")).toEqual({ status: 404 });
    expect(await readUploadForDownload(randomUUID())).toEqual({
      status: 404,
    });
  });

  it("zwraca 404, gdy rekord istnieje, a obiektu nie ma w storage", async () => {
    const upload = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
      visibility: "PUBLIC",
      withObject: false,
    });

    expect(await readUploadForDownload(upload.id)).toEqual({ status: 404 });
  });
});

describe("deleteUploadCommand na bazie i storage", () => {
  it("autor usuwa swój plik: znika rekord i obiekt, plik B zostaje", async () => {
    const own = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
      visibility: "ORGANIZATION",
    });
    const foreign = await seedUpload({
      organizationId: world.orgB.id,
      uploadedById: world.bob.id,
      visibility: "ORGANIZATION",
    });
    await signInAs(world.alice, world.orgA);

    const result = await deleteUploadCommand({ id: own.id });

    expect(result).toEqual({ success: true });
    expect(await prisma.upload.count({ where: { id: own.id } })).toBe(0);
    expect(await getObject(own.key)).toBeNull();
    expect(await prisma.upload.count({ where: { id: foreign.id } })).toBe(1);
    expect(await getObject(foreign.key)).not.toBeNull();
    expect(mockTrackAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "upload.deleted",
        entityId: own.id,
        organizationId: world.orgA.id,
      }),
    );
  });

  it("kontekst A nie usuwa pliku organizacji B ani jego obiektu", async () => {
    const foreign = await seedUpload({
      organizationId: world.orgB.id,
      uploadedById: world.bob.id,
      visibility: "ORGANIZATION",
    });
    await signInAs(world.alice, world.orgA);

    const result = await deleteUploadCommand({ id: foreign.id });

    expect(result.success).toBe(false);
    expect(await prisma.upload.count({ where: { id: foreign.id } })).toBe(1);
    expect(await getObject(foreign.key)).not.toBeNull();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("member nie usuwa cudzego pliku własnej organizacji", async () => {
    const other = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.both.id,
      visibility: "ORGANIZATION",
    });
    await signInAs(world.alice, world.orgA);

    const result = await deleteUploadCommand({ id: other.id });

    expect(result).toEqual({
      success: false,
      error: "Brak uprawnień do usunięcia pliku",
    });
    expect(await prisma.upload.count({ where: { id: other.id } })).toBe(1);
    expect(await getObject(other.key)).not.toBeNull();
  });

  it("superadmin w trybie serwisowym bez potwierdzenia nic nie usuwa, z potwierdzeniem A usuwa w A", async () => {
    const upload = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
      visibility: "ORGANIZATION",
    });
    await signInAs(world.root, world.orgA, "superadmin");

    const denied = await deleteUploadCommand({ id: upload.id });
    const countAfterDenied = await prisma.upload.count({
      where: { id: upload.id },
    });
    const allowed = await deleteUploadCommand(
      { id: upload.id },
      { serviceModeConfirmed: true, organizationId: world.orgA.id },
    );

    expect(denied).toEqual({
      success: false,
      error: "Potwierdź zmianę w trybie serwisowym",
    });
    expect(countAfterDenied).toBe(1);
    expect(allowed).toEqual({ success: true });
    expect(await prisma.upload.count({ where: { id: upload.id } })).toBe(0);
  });
});
