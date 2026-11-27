// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CommandContext,
  CommandHook,
  CommandHookMap,
} from "@/shared/lib/commands/define-command";

const ORG_A = "org-a";
const ORG_B = "org-b";
const UPLOAD_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_UPLOAD_ID = "22222222-2222-4222-8222-222222222222";

interface InvoiceRow {
  id: string;
  organizationId: string;
  number: string;
  status: string;
  assigneeId: string | null;
  pdfUploadId: string | null;
}

const { invoiceStore, mockPrisma } = vi.hoisted(() => {
  const invoiceStore = { rows: [] as InvoiceRow[] };
  const matching = (where: Record<string, unknown> | undefined) =>
    invoiceStore.rows.filter((row) =>
      Object.entries(where ?? {}).every(
        ([field, value]) =>
          (row as unknown as Record<string, unknown>)[field] === value,
      ),
    );
  return {
    invoiceStore,
    mockPrisma: {
      invoice: {
        count: vi.fn(
          async (args?: { where?: Record<string, unknown> }) =>
            matching(args?.where).length,
        ),
        findFirst: vi.fn(
          async (args?: { where?: Record<string, unknown> }) =>
            matching(args?.where)[0] ?? null,
        ),
        findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
          matching(args?.where),
        ),
      },
    },
  };
});

vi.mock("@/shared/lib/prisma", () => ({ prisma: mockPrisma }));

import { DomainError } from "@/shared/utils/error-handling";
import { commandHooks } from "../command-hooks";

const CONTEXT_A: CommandContext = {
  userId: "user-a",
  organizationId: ORG_A,
  orgRole: "owner",
  userRole: "user",
  serviceMode: false,
};

function invoice(row: Partial<InvoiceRow> & { id: string }): InvoiceRow {
  return {
    organizationId: ORG_A,
    number: `FV/${row.id}`,
    status: "issued",
    assigneeId: null,
    pdfUploadId: UPLOAD_ID,
    ...row,
  };
}

function uploadsDeleteHook(): CommandHook {
  const hooks: CommandHookMap = commandHooks;
  const entry = hooks["uploads.delete"];
  if (entry === undefined || Array.isArray(entry)) {
    throw new Error("expected a single uploads.delete hook");
  }
  return entry as CommandHook;
}

async function runBefore(
  input: Record<string, unknown>,
  context: CommandContext = CONTEXT_A,
): Promise<unknown> {
  return uploadsDeleteHook().before(input, context);
}

beforeEach(() => {
  invoiceStore.rows = [];
});

describe("invoices hook on uploads.delete", () => {
  it("is registered once on uploads.delete with the id invoices.keep-issued-pdf", () => {
    expect(Object.keys(commandHooks)).toEqual(["uploads.delete"]);
    expect(uploadsDeleteHook().id).toBe("invoices.keep-issued-pdf");
  });

  it("rejects deleting an upload attached to an issued invoice of the organization", async () => {
    invoiceStore.rows = [invoice({ id: "inv-1" })];

    const outcome = runBefore({ id: UPLOAD_ID });

    await expect(outcome).rejects.toBeInstanceOf(DomainError);
    await expect(outcome).rejects.toThrow(
      "This file is attached to an issued invoice",
    );
  });

  it("returns nothing for an upload attached only to a draft invoice of the organization", async () => {
    invoiceStore.rows = [invoice({ id: "inv-1", status: "draft" })];

    await expect(runBefore({ id: UPLOAD_ID })).resolves.toBeUndefined();
  });

  it("returns nothing for an upload attached to a paid invoice of the organization", async () => {
    invoiceStore.rows = [invoice({ id: "inv-1", status: "paid" })];

    await expect(runBefore({ id: UPLOAD_ID })).resolves.toBeUndefined();
  });

  it("returns nothing when the issued invoice with this upload belongs to another organization", async () => {
    invoiceStore.rows = [invoice({ id: "inv-b", organizationId: ORG_B })];

    await expect(runBefore({ id: UPLOAD_ID })).resolves.toBeUndefined();
  });

  it("returns nothing when the organization's issued invoice holds a different upload", async () => {
    invoiceStore.rows = [
      invoice({ id: "inv-1", pdfUploadId: OTHER_UPLOAD_ID }),
    ];

    await expect(runBefore({ id: UPLOAD_ID })).resolves.toBeUndefined();
  });

  it("returns nothing when no invoice exists", async () => {
    await expect(runBefore({ id: UPLOAD_ID })).resolves.toBeUndefined();
  });

  it("checks the organization of the context, not a fixed one", async () => {
    invoiceStore.rows = [invoice({ id: "inv-b", organizationId: ORG_B })];

    await expect(
      runBefore({ id: UPLOAD_ID }, { ...CONTEXT_A, organizationId: ORG_B }),
    ).rejects.toThrow("This file is attached to an issued invoice");
  });

  it("checks the upload id from the input, not a fixed one", async () => {
    invoiceStore.rows = [
      invoice({ id: "inv-1", pdfUploadId: OTHER_UPLOAD_ID }),
    ];

    await expect(runBefore({ id: OTHER_UPLOAD_ID })).rejects.toThrow(
      "This file is attached to an issued invoice",
    );
  });

  it("rejects when an issued invoice holds the upload next to draft and foreign ones", async () => {
    invoiceStore.rows = [
      invoice({ id: "inv-draft", status: "draft" }),
      invoice({ id: "inv-b", organizationId: ORG_B }),
      invoice({ id: "inv-issued" }),
    ];

    await expect(runBefore({ id: UPLOAD_ID })).rejects.toThrow(
      "This file is attached to an issued invoice",
    );
  });
});
