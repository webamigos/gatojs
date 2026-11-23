// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const UPLOAD_ID = "11111111-1111-4111-8111-111111111111";
const FOREIGN_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ORG_ID = "33333333-3333-4333-8333-333333333333";

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
  mockCurrentLocale,
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
    mockCurrentLocale: vi.fn(),
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
  moduleMessages: {
    pl: [
      {
        key: "uploads",
        load: () =>
          import("@/features/uploads/i18n/pl.json").then((m) => m.default),
      },
    ],
    en: [
      {
        key: "uploads",
        load: () =>
          import("@/features/uploads/i18n/en.json").then((m) => m.default),
      },
    ],
  },
}));
vi.mock("@/i18n/server-locale", () => ({
  currentLocale: () => mockCurrentLocale(),
}));

import { deleteUploadCommand } from "../upload-commands";

const MEMBER_CONTEXT = {
  userId: "user-1",
  organizationId: "org-1",
  orgRole: "member",
  userRole: "user",
  serviceMode: false,
};

const SERVICE_MODE_ERROR = {
  success: false,
  error: "Potwierdź zmianę w trybie serwisowym",
};

const NO_PERMISSION_ERROR = {
  success: false,
  error: "Brak uprawnień do usunięcia pliku",
};

function seedRows(): void {
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
    {
      id: FOREIGN_ID,
      organizationId: "org-1",
      uploadedById: "user-2",
      key: "orgs/org-1/editor-image/foreign.jpg",
      fileName: "foreign.jpg",
      purpose: "editor-image",
      size: 20,
    },
    {
      id: OTHER_ORG_ID,
      organizationId: "org-2",
      uploadedById: "user-3",
      key: "orgs/org-2/editor-image/other.jpg",
      fileName: "other.jpg",
      purpose: "editor-image",
      size: 30,
    },
  ];
}

function remainingIds(): string[] {
  return uploadStore.rows.map((row) => row.id);
}

function expectNothingDeleted(): void {
  expect(uploadStore.rows).toHaveLength(3);
  expect(mockDeleteObject).not.toHaveBeenCalled();
  expect(mockTrackAudit).not.toHaveBeenCalled();
}

beforeEach(() => {
  mockCurrentLocale.mockResolvedValue("pl");
  seedRows();
  mockGetOrgContext.mockReset();
  mockGetOrgContext.mockResolvedValue(MEMBER_CONTEXT);
  mockDeleteObject.mockReset();
  mockDeleteObject.mockResolvedValue(undefined);
  mockTrackAudit.mockReset();
  mockTrackAudit.mockResolvedValue(undefined);
  mockLogger.warn.mockReset();
  mockLogger.error.mockReset();
});

describe("deleteUploadCommand", () => {
  it("autor z rolą member usuwa swój plik: rekord, obiekt i wpis audytu", async () => {
    const result = await deleteUploadCommand({ id: UPLOAD_ID });

    expect(result).toEqual({ success: true });
    expect(remainingIds()).toEqual([FOREIGN_ID, OTHER_ORG_ID]);
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
    expect(mockDeleteObject).toHaveBeenCalledWith(
      "orgs/org-1/editor-image/own.jpg",
    );
    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
    expect(mockTrackAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "user-1",
        action: "upload.deleted",
        entityType: "upload",
        entityId: UPLOAD_ID,
      }),
    );
  });

  it("member usuwający cudzy plik dostaje błąd uprawnień i nic nie jest usunięte", async () => {
    const result = await deleteUploadCommand({ id: FOREIGN_ID });

    expect(result).toEqual(NO_PERMISSION_ERROR);
    expectNothingDeleted();
  });

  it.each(["owner", "admin"])(
    "%s usuwa cudzy plik własnej organizacji",
    async (orgRole) => {
      mockGetOrgContext.mockResolvedValue({ ...MEMBER_CONTEXT, orgRole });

      const result = await deleteUploadCommand({ id: FOREIGN_ID });

      expect(result).toEqual({ success: true });
      expect(remainingIds()).toEqual([UPLOAD_ID, OTHER_ORG_ID]);
      expect(mockDeleteObject).toHaveBeenCalledWith(
        "orgs/org-1/editor-image/foreign.jpg",
      );
      expect(mockTrackAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "upload.deleted",
          entityId: FOREIGN_ID,
        }),
      );
    },
  );

  it("trackAudit dostaje dokładne dane usuniętego pliku i aktora z kontekstu", async () => {
    await deleteUploadCommand({ id: UPLOAD_ID });

    expect(mockTrackAudit).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "user-1",
      serviceMode: false,
      action: "upload.deleted",
      entityType: "upload",
      entityId: UPLOAD_ID,
      oldData: {
        purpose: "editor-image",
        key: "orgs/org-1/editor-image/own.jpg",
        size: 10,
      },
    });
  });

  it.each(["admin", "superadmin"])(
    "globalny %s będący zwykłym memberem organizacji usuwa cudzy plik",
    async (userRole) => {
      mockGetOrgContext.mockResolvedValue({
        ...MEMBER_CONTEXT,
        orgRole: "member",
        userRole,
      });

      const result = await deleteUploadCommand({ id: FOREIGN_ID });

      expect(result).toEqual({ success: true });
      expect(remainingIds()).toEqual([UPLOAD_ID, OTHER_ORG_ID]);
      expect(mockDeleteObject).toHaveBeenCalledWith(
        "orgs/org-1/editor-image/foreign.jpg",
      );
    },
  );

  it.each(["member", "admin", "owner"])(
    "%s z kontekstu A nie usuwa pliku organizacji B",
    async (orgRole) => {
      mockGetOrgContext.mockResolvedValue({
        ...MEMBER_CONTEXT,
        userId: "user-3",
        orgRole,
      });

      const result = await deleteUploadCommand({ id: OTHER_ORG_ID });

      expect(result.success).toBe(false);
      expectNothingDeleted();
    },
  );

  it("odrzuca id, które nie jest uuid, i nic nie usuwa", async () => {
    const result = await deleteUploadCommand({ id: "nie-uuid" });

    expect(result.success).toBe(false);
    expectNothingDeleted();
  });

  it.each([null, undefined, "tekst", 5, {}, { id: 5 }])(
    "odrzuca niepoprawne wejście %j i nic nie usuwa",
    async (input) => {
      const result = await deleteUploadCommand(input);

      expect(result.success).toBe(false);
      expectNothingDeleted();
    },
  );

  it("zwraca błąd dla nieistniejącego pliku", async () => {
    const result = await deleteUploadCommand({
      id: "44444444-4444-4444-8444-444444444444",
    });

    expect(result.success).toBe(false);
    expectNothingDeleted();
  });

  it("w trybie serwisowym bez potwierdzenia zwraca błąd i nic nie usuwa", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...MEMBER_CONTEXT,
      orgRole: "owner",
      serviceMode: true,
    });

    const result = await deleteUploadCommand({ id: FOREIGN_ID });

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expectNothingDeleted();
  });

  it("w trybie serwisowym z potwierdzeniem aktywnej organizacji usuwa plik", async () => {
    mockGetOrgContext.mockResolvedValue({
      ...MEMBER_CONTEXT,
      orgRole: "owner",
      serviceMode: true,
    });

    const result = await deleteUploadCommand(
      { id: FOREIGN_ID },
      { serviceModeConfirmed: true, organizationId: "org-1" },
    );

    expect(result).toEqual({ success: true });
    expect(remainingIds()).toEqual([UPLOAD_ID, OTHER_ORG_ID]);
  });

  it("potwierdzenie innej organizacji kończy się błędem potwierdzenia", async () => {
    const result = await deleteUploadCommand(
      { id: UPLOAD_ID },
      { serviceModeConfirmed: true, organizationId: "org-2" },
    );

    expect(result).toEqual(SERVICE_MODE_ERROR);
    expectNothingDeleted();
  });

  it("błąd deleteObject nie cofa usunięcia rekordu i jest zalogowany", async () => {
    mockDeleteObject.mockRejectedValue(new Error("storage down"));

    const result = await deleteUploadCommand({ id: UPLOAD_ID });

    expect(result).toEqual({ success: true });
    expect(remainingIds()).toEqual([FOREIGN_ID, OTHER_ORG_ID]);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("podwójne wywołanie: drugie zwraca błąd i nie woła deleteObject ponownie", async () => {
    await deleteUploadCommand({ id: UPLOAD_ID });
    const second = await deleteUploadCommand({ id: UPLOAD_ID });

    expect(second.success).toBe(false);
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
    expect(mockTrackAudit).toHaveBeenCalledTimes(1);
  });
});

describe("deleteUploadCommand: komunikaty błędów w języku żądania", () => {
  it.each([
    ["en", "You don't have permission to delete this file"],
    ["pl", "Brak uprawnień do usunięcia pliku"],
  ])("%s: member usuwa cudzy plik → %j", async (locale, expected) => {
    mockCurrentLocale.mockResolvedValue(locale);

    const result = await deleteUploadCommand({ id: FOREIGN_ID });

    expect(result).toEqual({ success: false, error: expected });
    expectNothingDeleted();
  });

  it.each([
    ["en", "Couldn't delete the file"],
    ["pl", "Nie udało się usunąć pliku"],
  ])("%s: id, które nie jest uuid → %j", async (locale, expected) => {
    mockCurrentLocale.mockResolvedValue(locale);

    const result = await deleteUploadCommand({ id: "nie-uuid" });

    expect(result).toEqual({ success: false, error: expected });
    expectNothingDeleted();
  });

  it.each([
    ["en", "Couldn't delete the file"],
    ["pl", "Nie udało się usunąć pliku"],
  ])("%s: plik innej organizacji → %j", async (locale, expected) => {
    mockCurrentLocale.mockResolvedValue(locale);

    const result = await deleteUploadCommand({ id: OTHER_ORG_ID });

    expect(result).toEqual({ success: false, error: expected });
    expectNothingDeleted();
  });

  it.each([
    ["en", "Couldn't delete the file"],
    ["pl", "Nie udało się usunąć pliku"],
  ])("%s: awaria bazy przy usuwaniu → %j", async (locale, expected) => {
    mockCurrentLocale.mockResolvedValue(locale);
    vi.mocked(
      (prismaFake.upload as { deleteMany: ReturnType<typeof vi.fn> })
        .deleteMany,
    ).mockRejectedValueOnce(new Error("db down"));

    const result = await deleteUploadCommand({ id: UPLOAD_ID });

    expect(result).toEqual({ success: false, error: expected });
  });

  it.each([
    ["en", "Confirm the change in service mode"],
    ["pl", "Potwierdź zmianę w trybie serwisowym"],
  ])("%s: tryb serwisowy bez potwierdzenia → %j", async (locale, expected) => {
    mockCurrentLocale.mockResolvedValue(locale);
    mockGetOrgContext.mockResolvedValue({
      ...MEMBER_CONTEXT,
      orgRole: "owner",
      serviceMode: true,
    });

    const result = await deleteUploadCommand({ id: FOREIGN_ID });

    expect(result).toEqual({ success: false, error: expected });
    expectNothingDeleted();
  });
});
