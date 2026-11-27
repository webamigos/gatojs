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

import { deleteUploadCommand } from "@/features/uploads/services/commands/upload-commands";
import { emitEvent } from "@/shared/lib/events";
import { prisma } from "@/shared/lib/prisma";
import { withoutTenantScope } from "@/shared/lib/tenant-scope";
import {
  createOrganization,
  createSession,
  createUser,
  resetDatabase,
} from "@/test/integration/database";
import { issueInvoiceCommand } from "../services/commands/issue-invoice-command";
import { listUnpaidInvoicesQuery } from "../services/queries/list-unpaid-invoices-query";

const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);
const NOT_ISSUABLE = "Invoice not found or already issued";
const ATTACHED = "This file is attached to an issued invoice";

interface World {
  alice: { id: string };
  bob: { id: string };
  carol: { id: string };
  orgA: { id: string };
  orgB: { id: string };
}

let world: World;

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

async function seedInvoice(input: {
  organizationId: string;
  number: string;
  status: string;
  assigneeId?: string | null;
  pdfUploadId?: string | null;
}): Promise<{ id: string }> {
  return withoutTenantScope("test seed", () =>
    prisma.invoice.create({
      data: {
        organizationId: input.organizationId,
        number: input.number,
        status: input.status,
        assigneeId: input.assigneeId ?? null,
        pdfUploadId: input.pdfUploadId ?? null,
      },
      select: { id: true },
    }),
  );
}

async function seedUpload(input: {
  organizationId: string;
  uploadedById: string;
}): Promise<{ id: string }> {
  const id = randomUUID();
  await withoutTenantScope("test seed", () =>
    prisma.upload.create({
      data: {
        id,
        organizationId: input.organizationId,
        uploadedById: input.uploadedById,
        purpose: "invoice-pdf",
        key: `orgs/${input.organizationId}/invoice-pdf/${id}.pdf`,
        fileName: "faktura.pdf",
        mimeType: "application/pdf",
        size: 4,
        visibility: "ORGANIZATION",
      },
    }),
  );
  return { id };
}

async function invoiceState(
  id: string,
): Promise<{ status: string; assigneeId: string | null } | null> {
  return withoutTenantScope("test assertion", () =>
    prisma.invoice.findUnique({
      where: { id },
      select: { status: true, assigneeId: true },
    }),
  );
}

async function uploadExists(id: string): Promise<boolean> {
  const count = await withoutTenantScope("test assertion", () =>
    prisma.upload.count({ where: { id } }),
  );
  return count === 1;
}

beforeEach(async () => {
  await resetDatabase();
  mockTrackAudit.mockReset();
  mockTrackAudit.mockResolvedValue(undefined);
  currentSession.value = null;
  const alice = await createUser({ email: "alice@example.com" });
  const bob = await createUser({ email: "bob@example.com" });
  const carol = await createUser({ email: "carol@example.com" });
  const orgA = await createOrganization({
    name: "Org A",
    createdAt: YESTERDAY,
    members: [
      { userId: alice.id, role: "owner" },
      { userId: carol.id, role: "member" },
    ],
  });
  const orgB = await createOrganization({
    name: "Org B",
    createdAt: YESTERDAY,
    members: [
      { userId: bob.id, role: "owner" },
      { userId: carol.id, role: "member" },
    ],
  });
  world = { alice, bob, carol, orgA, orgB };
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("issueInvoiceCommand across two organizations", () => {
  it("issues a draft of the active organization and leaves the other organization's draft with the same number", async () => {
    const aDraft = await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/001",
      status: "draft",
    });
    const bDraft = await seedInvoice({
      organizationId: world.orgB.id,
      number: "FV/2026/001",
      status: "draft",
    });
    await signInAs(world.alice, world.orgA);

    const result = await issueInvoiceCommand({ id: aDraft.id });

    expect(result).toEqual({ success: true, data: { id: aDraft.id } });
    expect(await invoiceState(aDraft.id)).toEqual({
      status: "issued",
      assigneeId: null,
    });
    expect(await invoiceState(bDraft.id)).toEqual({
      status: "draft",
      assigneeId: null,
    });
  });

  it("refuses to issue another organization's draft and leaves it a draft", async () => {
    const bDraft = await seedInvoice({
      organizationId: world.orgB.id,
      number: "FV/2026/001",
      status: "draft",
    });
    await signInAs(world.alice, world.orgA);

    const result = await issueInvoiceCommand({ id: bDraft.id });

    expect(result).toEqual({ success: false, error: NOT_ISSUABLE });
    expect(await invoiceState(bDraft.id)).toEqual({
      status: "draft",
      assigneeId: null,
    });
  });

  it("refuses to issue an already issued invoice", async () => {
    const issued = await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/002",
      status: "issued",
    });
    await signInAs(world.alice, world.orgA);

    const result = await issueInvoiceCommand({ id: issued.id });

    expect(result).toEqual({ success: false, error: NOT_ISSUABLE });
    expect(await invoiceState(issued.id)).toEqual({
      status: "issued",
      assigneeId: null,
    });
  });

  it("refuses to issue a paid invoice and keeps it paid", async () => {
    const paid = await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/003",
      status: "paid",
    });
    await signInAs(world.alice, world.orgA);

    const result = await issueInvoiceCommand({ id: paid.id });

    expect(result).toEqual({ success: false, error: NOT_ISSUABLE });
    expect(await invoiceState(paid.id)).toEqual({
      status: "paid",
      assigneeId: null,
    });
  });

  it("refuses an unknown invoice id", async () => {
    await signInAs(world.alice, world.orgA);

    const result = await issueInvoiceCommand({ id: "no-such-invoice" });

    expect(result).toEqual({ success: false, error: NOT_ISSUABLE });
  });

  it("issuing the same draft twice succeeds once and then refuses", async () => {
    const aDraft = await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/004",
      status: "draft",
    });
    await signInAs(world.alice, world.orgA);

    const first = await issueInvoiceCommand({ id: aDraft.id });
    const second = await issueInvoiceCommand({ id: aDraft.id });

    expect(first).toEqual({ success: true, data: { id: aDraft.id } });
    expect(second).toEqual({ success: false, error: NOT_ISSUABLE });
  });

  it("a superadmin in service mode without confirmation cannot issue and the draft stays", async () => {
    const root = await createUser({
      email: "root@example.com",
      role: "superadmin",
    });
    const aDraft = await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/005",
      status: "draft",
    });
    await signInAs(root, world.orgA, "superadmin");

    const result = await issueInvoiceCommand({ id: aDraft.id });

    expect(result).toEqual({
      success: false,
      error: "Potwierdź zmianę w trybie serwisowym",
    });
    expect(await invoiceState(aDraft.id)).toEqual({
      status: "draft",
      assigneeId: null,
    });
  });
});

describe("listUnpaidInvoicesQuery across two organizations", () => {
  it("lists only the active organization's issued invoices sorted by number", async () => {
    const third = await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/003",
      status: "issued",
    });
    const first = await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/001",
      status: "issued",
    });
    await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/004",
      status: "draft",
    });
    await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/005",
      status: "paid",
    });
    const second = await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/002",
      status: "issued",
    });
    await seedInvoice({
      organizationId: world.orgB.id,
      number: "FV/2026/000",
      status: "issued",
    });
    await signInAs(world.alice, world.orgA);

    const unpaid = await listUnpaidInvoicesQuery();

    expect(unpaid).toEqual([
      { id: first.id, number: "FV/2026/001" },
      { id: second.id, number: "FV/2026/002" },
      { id: third.id, number: "FV/2026/003" },
    ]);
  });

  it("returns an empty list when only the other organization has issued invoices", async () => {
    await seedInvoice({
      organizationId: world.orgB.id,
      number: "FV/2026/001",
      status: "issued",
    });
    await signInAs(world.alice, world.orgA);

    expect(await listUnpaidInvoicesQuery()).toEqual([]);
  });
});

describe("invoices hook on deleteUploadCommand", () => {
  it("keeps an upload attached to an issued invoice of the organization", async () => {
    const pdf = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
    });
    await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/001",
      status: "issued",
      pdfUploadId: pdf.id,
    });
    await signInAs(world.alice, world.orgA);

    const result = await deleteUploadCommand({ id: pdf.id });

    expect(result).toEqual({ success: false, error: ATTACHED });
    expect(await uploadExists(pdf.id)).toBe(true);
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("deletes an upload attached only to a draft invoice", async () => {
    const pdf = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
    });
    await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/001",
      status: "draft",
      pdfUploadId: pdf.id,
    });
    await signInAs(world.alice, world.orgA);

    const result = await deleteUploadCommand({ id: pdf.id });

    expect(result).toEqual({ success: true });
    expect(await uploadExists(pdf.id)).toBe(false);
  });

  it("deletes an upload whose id is referenced only by an issued invoice of the other organization", async () => {
    const pdf = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
    });
    await seedInvoice({
      organizationId: world.orgB.id,
      number: "FV/2026/001",
      status: "issued",
      pdfUploadId: pdf.id,
    });
    await signInAs(world.alice, world.orgA);

    const result = await deleteUploadCommand({ id: pdf.id });

    expect(result).toEqual({ success: true });
    expect(await uploadExists(pdf.id)).toBe(false);
  });

  it("deletes an upload with no invoice while another upload stays protected", async () => {
    const protectedPdf = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
    });
    const loose = await seedUpload({
      organizationId: world.orgA.id,
      uploadedById: world.alice.id,
    });
    await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/001",
      status: "issued",
      pdfUploadId: protectedPdf.id,
    });
    await signInAs(world.alice, world.orgA);

    const result = await deleteUploadCommand({ id: loose.id });

    expect(result).toEqual({ success: true });
    expect(await uploadExists(loose.id)).toBe(false);
    expect(await uploadExists(protectedPdf.id)).toBe(true);
  });
});

describe("organizations.member-removed subscriber of invoices", () => {
  it("unassigns the removed member's invoices only in the event organization", async () => {
    const aCarolFirst = await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/001",
      status: "draft",
      assigneeId: world.carol.id,
    });
    const aCarolSecond = await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/002",
      status: "issued",
      assigneeId: world.carol.id,
    });
    const aAlice = await seedInvoice({
      organizationId: world.orgA.id,
      number: "FV/2026/003",
      status: "draft",
      assigneeId: world.alice.id,
    });
    const bCarol = await seedInvoice({
      organizationId: world.orgB.id,
      number: "FV/2026/001",
      status: "draft",
      assigneeId: world.carol.id,
    });

    await emitEvent(
      { organizationId: world.orgA.id, actorUserId: world.alice.id },
      "organizations.member-removed",
      { memberId: "m1", userId: world.carol.id, role: "member" },
    );

    expect(await invoiceState(aCarolFirst.id)).toEqual({
      status: "draft",
      assigneeId: null,
    });
    expect(await invoiceState(aCarolSecond.id)).toEqual({
      status: "issued",
      assigneeId: null,
    });
    expect(await invoiceState(aAlice.id)).toEqual({
      status: "draft",
      assigneeId: world.alice.id,
    });
    expect(await invoiceState(bCarol.id)).toEqual({
      status: "draft",
      assigneeId: world.carol.id,
    });
  });
});
