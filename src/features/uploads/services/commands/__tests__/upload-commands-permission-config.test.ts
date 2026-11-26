// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const OWN_ID = "11111111-1111-4111-8111-111111111111";
const FOREIGN_ID = "22222222-2222-4222-8222-222222222222";

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
  prismaFake,
} = vi.hoisted(() => {
  const uploadStore = { rows: [] as Row[] };
  const matches = (row: Row, where: Record<string, unknown> | undefined) =>
    Object.entries(where ?? {}).every(
      ([field, value]) =>
        (row as unknown as Record<string, unknown>)[field] === value,
    );
  const find = async (args: { where?: Record<string, unknown> }) =>
    uploadStore.rows.find((row) => matches(row, args.where)) ?? null;
  const findOrThrow = async (args: { where?: Record<string, unknown> }) => {
    const row = await find(args);
    if (!row) {
      throw new Error("Record not found");
    }
    return row;
  };
  const removeWhere = (where: Record<string, unknown> | undefined) => {
    const before = uploadStore.rows.length;
    uploadStore.rows = uploadStore.rows.filter((row) => !matches(row, where));
    return before - uploadStore.rows.length;
  };
  const upload = {
    findFirst: vi.fn(find),
    findUnique: vi.fn(find),
    findFirstOrThrow: vi.fn(findOrThrow),
    findUniqueOrThrow: vi.fn(findOrThrow),
    delete: vi.fn(async (args: { where: Record<string, unknown> }) => {
      const row = await findOrThrow(args);
      removeWhere(args.where);
      return row;
    }),
    deleteMany: vi.fn(async (args: { where?: Record<string, unknown> }) => ({
      count: removeWhere(args.where),
    })),
  };
  const prismaFake: Record<string, unknown> = { upload };
  prismaFake.$transaction = async (
    work: ((tx: unknown) => Promise<unknown>) | Promise<unknown>[],
  ) => (typeof work === "function" ? work(prismaFake) : Promise.all(work));
  return {
    mockGetOrgContext: vi.fn(),
    mockDeleteObject: vi.fn(),
    mockTrackAudit: vi.fn(),
    mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    uploadStore,
    prismaFake,
  };
});

vi.mock("@/env", () => ({ env: { MULTI_ORG: false } }));
vi.mock("@/shared/lib/prisma", () => ({ prisma: prismaFake }));
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
  const { default: uploadsModule } = await import("@/features/uploads/module");
  return {
    authClientPlugins: [],
    gatoBranding: {},
    clientModules: applyGatoConfig([uploadsModule], {
      modules: {
        uploads: { permissions: { "uploads.delete-others": ["owner"] } },
      },
    }),
  };
});

import { deleteUploadCommand } from "../upload-commands";

const MEMBER_CONTEXT = {
  userId: "user-1",
  organizationId: "org-1",
  orgRole: "member",
  userRole: "user",
  serviceMode: false,
};

const NO_PERMISSION_ERROR = {
  success: false,
  error: "Brak uprawnień do usunięcia pliku",
};

function remainingIds(): string[] {
  return uploadStore.rows.map((row) => row.id);
}

beforeEach(() => {
  uploadStore.rows = [
    {
      id: OWN_ID,
      organizationId: "org-1",
      uploadedById: "user-1",
      key: "orgs/org-1/editor-image/own.jpg",
      fileName: "own.jpg",
      purpose: "editor-image",
      size: 10,
    },
    {
      id: FOREIGN_ID,
      organizationId: "org-1",
      uploadedById: "user-2",
      key: "orgs/org-1/editor-image/foreign.jpg",
      fileName: "foreign.jpg",
      purpose: "editor-image",
      size: 20,
    },
  ];
  mockGetOrgContext.mockReset();
  mockGetOrgContext.mockResolvedValue(MEMBER_CONTEXT);
  mockDeleteObject.mockReset();
  mockDeleteObject.mockResolvedValue(undefined);
  mockTrackAudit.mockReset();
  mockTrackAudit.mockResolvedValue(undefined);
  mockLogger.warn.mockReset();
  mockLogger.error.mockReset();
});

describe("deleteUploadCommand with uploads.delete-others overridden to owner", () => {
  it("refuses an org admin on another member's upload with the permission error", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...MEMBER_CONTEXT,
      orgRole: "admin",
    });

    const result = await deleteUploadCommand({ id: FOREIGN_ID });

    expect(result).toEqual(NO_PERMISSION_ERROR);
  });

  it("keeps the row, the stored object and writes no audit entry when it refuses an org admin", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...MEMBER_CONTEXT,
      orgRole: "admin",
    });

    await deleteUploadCommand({ id: FOREIGN_ID });

    expect(remainingIds()).toEqual([OWN_ID, FOREIGN_ID]);
    expect(mockDeleteObject).not.toHaveBeenCalled();
    expect(mockTrackAudit).not.toHaveBeenCalled();
  });

  it("lets an org owner delete another member's upload", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...MEMBER_CONTEXT,
      orgRole: "owner",
    });

    const result = await deleteUploadCommand({ id: FOREIGN_ID });

    expect(result).toEqual({ success: true });
    expect(remainingIds()).toEqual([OWN_ID]);
    expect(mockDeleteObject).toHaveBeenCalledWith(
      "orgs/org-1/editor-image/foreign.jpg",
    );
  });

  it("lets the uploader with the member role delete the own upload", async () => {
    const result = await deleteUploadCommand({ id: OWN_ID });

    expect(result).toEqual({ success: true });
    expect(remainingIds()).toEqual([FOREIGN_ID]);
  });

  it("lets the uploader with the admin role delete the own upload", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...MEMBER_CONTEXT,
      orgRole: "admin",
    });

    const result = await deleteUploadCommand({ id: OWN_ID });

    expect(result).toEqual({ success: true });
    expect(remainingIds()).toEqual([FOREIGN_ID]);
  });

  it("refuses an org member on another member's upload", async () => {
    const result = await deleteUploadCommand({ id: FOREIGN_ID });

    expect(result).toEqual(NO_PERMISSION_ERROR);
    expect(remainingIds()).toEqual([OWN_ID, FOREIGN_ID]);
  });

  it.each(["admin", "superadmin"])(
    "lets a global %s who is a plain org member delete another member's upload",
    async (userRole) => {
      mockGetOrgContext.mockResolvedValue({ ...MEMBER_CONTEXT, userRole });

      const result = await deleteUploadCommand({ id: FOREIGN_ID });

      expect(result).toEqual({ success: true });
      expect(remainingIds()).toEqual([OWN_ID]);
    },
  );
});
