// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleDef } from "@/shared/lib/modules/define-module";

const UPLOAD_ID = "11111111-1111-4111-8111-111111111111";

interface Row {
  id: string;
  organizationId: string;
  uploadedById: string | null;
  key: string;
  fileName: string;
  purpose: string;
  size: number;
}

const {
  mockGetOrgContext,
  mockDeleteObject,
  mockTrackAudit,
  mockLogger,
  uploadStore,
  uploadFake,
} = vi.hoisted(() => {
  const uploadStore = { rows: [] as Row[] };
  const matches = (row: Row, where: Record<string, unknown> | undefined) =>
    Object.entries(where ?? {}).every(
      ([field, value]) =>
        (row as unknown as Record<string, unknown>)[field] === value,
    );
  const find = async (args: { where?: Record<string, unknown> }) =>
    uploadStore.rows.find((row) => matches(row, args.where)) ?? null;
  const removeWhere = (where: Record<string, unknown> | undefined) => {
    const before = uploadStore.rows.length;
    uploadStore.rows = uploadStore.rows.filter((row) => !matches(row, where));
    return before - uploadStore.rows.length;
  };
  const uploadFake = {
    findFirst: vi.fn(find),
    findUnique: vi.fn(find),
    delete: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const row = await find(args);
      removeWhere(args.where);
      return row;
    }),
    deleteMany: vi.fn(async (args: { where?: Record<string, unknown> }) => ({
      count: removeWhere(args.where),
    })),
  };
  return {
    mockGetOrgContext: vi.fn(),
    mockDeleteObject: vi.fn(),
    mockTrackAudit: vi.fn(),
    mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    uploadStore,
    uploadFake,
  };
});

vi.mock("@/env", () => ({ env: { MULTI_ORG: false } }));
vi.mock("@/shared/lib/prisma", () => ({
  prisma: {
    upload: uploadFake,
    $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({ upload: uploadFake }),
  },
}));
vi.mock("@/shared/lib/auth/org-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/auth/org-context")>()),
  getOrgContext: () => mockGetOrgContext(),
}));
vi.mock("@/shared/lib/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/audit")>()),
  trackAudit: (event: unknown) => mockTrackAudit(event),
}));
vi.mock("@/shared/lib/logger", () => ({ logger: mockLogger }));
vi.mock("../../storage", () => ({ deleteObject: mockDeleteObject }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "pl") }));
vi.mock("@/i18n/routing", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules.generated", () => ({
  auditSinks: [],
  modules: [{ key: "uploads", nav: [], routePrefixes: [] }],
}));
vi.mock("@/modules.client.generated", async () => {
  const { applyGatoConfig } = await import("@/shared/lib/modules/gato-config");
  const modules: ModuleDef[] = [
    { key: "dashboard", nav: [], routePrefixes: ["/dashboard"] },
    { key: "uploads", nav: [], routePrefixes: [] },
  ];
  return {
    authClientPlugins: [],
    clientModules: applyGatoConfig(modules, {
      modules: { uploads: { enabled: false } },
    }),
  };
});

import { deleteUploadCommand } from "../upload-commands";

const OWNER_CONTEXT = {
  userId: "user-1",
  organizationId: "org-1",
  orgRole: "owner",
  userRole: "user",
  serviceMode: false,
};

beforeEach(() => {
  uploadStore.rows = [
    {
      id: UPLOAD_ID,
      organizationId: "org-1",
      uploadedById: "user-1",
      key: "orgs/org-1/editor-image/own.jpg",
      fileName: "own.jpg",
      purpose: "editor-image",
      size: 10,
    },
  ];
  mockGetOrgContext.mockReset();
  mockGetOrgContext.mockResolvedValue(OWNER_CONTEXT);
  mockDeleteObject.mockReset();
  mockDeleteObject.mockResolvedValue(undefined);
  mockTrackAudit.mockReset();
  mockTrackAudit.mockResolvedValue(undefined);
  mockLogger.warn.mockReset();
  mockLogger.error.mockReset();
  uploadFake.findFirst.mockClear();
  uploadFake.findUnique.mockClear();
  uploadFake.delete.mockClear();
  uploadFake.deleteMany.mockClear();
});

describe("deleteUploadCommand with uploads disabled", () => {
  it("returns the generic delete failure", async () => {
    const result = await deleteUploadCommand({ id: UPLOAD_ID });

    expect(result).toEqual({
      success: false,
      error: "Nie udało się usunąć pliku",
    });
  });

  it("keeps the upload row, the stored object and writes no audit entry", async () => {
    await deleteUploadCommand({ id: UPLOAD_ID });

    expect(uploadStore.rows.map((row) => row.id)).toEqual([UPLOAD_ID]);
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("stops before the session read and any upload query", async () => {
    await deleteUploadCommand({ id: UPLOAD_ID });

    expect(mockGetOrgContext).not.toHaveBeenCalled();
    expect(uploadFake.findFirst).not.toHaveBeenCalled();
    expect(uploadFake.findUnique).not.toHaveBeenCalled();
    expect(uploadFake.delete).not.toHaveBeenCalled();
    expect(uploadFake.deleteMany).not.toHaveBeenCalled();
  });

  it("logs the refusal as a warning, not as an error", async () => {
    await deleteUploadCommand({ id: UPLOAD_ID });

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("returns the same failure in service mode with a valid confirmation", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...OWNER_CONTEXT,
      userRole: "superadmin",
      serviceMode: true,
    });

    const result = await deleteUploadCommand(
      { id: UPLOAD_ID },
      { serviceModeConfirmed: true, organizationId: "org-1" },
    );

    expect(result).toEqual({
      success: false,
      error: "Nie udało się usunąć pliku",
    });
    expect(uploadStore.rows).toHaveLength(1);
    expect(mockGetOrgContext).not.toHaveBeenCalled();
  });
});
